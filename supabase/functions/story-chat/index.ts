import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiGate, chargeUsage, releaseAiReservation } from "../_shared/ai-gate.ts";
import { meterSseStream, estimateTokens, creditsForUsage } from "../_shared/ai-cost.ts";
import { chatRouteFor } from "../_shared/model-choice.ts";
import { type ProjectMemory } from "../_shared/project-memory.ts";
import { keepAnswer } from "./keep-answer.ts";
import { buildEditorPrompt, editorModel, planEditorRequest, stripStaleSelections, type ContextMode } from "./editor-request.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  // What the editor read for this answer, so the browser can say what it's thinking about.
  "Access-Control-Expose-Headers": "x-storymode-scope",
};

/**
 * Translates a gateway Responses API SSE stream into the chat-completions SSE
 * shape the browser (and the usage meter) already parse. The visible answer
 * text and the final usage are forwarded, plus the model's reasoning summary
 * as `{ storymode: { thinking } }` so the browser can show what it's working
 * on. The reasoning itself stays internal.
 */
function responsesToChatSse(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const send = (controller: TransformStreamDefaultController<Uint8Array>, obj: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };

  return upstream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: any;
        try { json = JSON.parse(payload); } catch { continue; }
        const type = json?.type;
        if (type === "response.output_text.delta" && typeof json.delta === "string") {
          send(controller, { choices: [{ delta: { content: json.delta } }] });
        } else if (type === "response.reasoning_summary_text.delta" && typeof json.delta === "string") {
          send(controller, { storymode: { thinking: json.delta } });
        } else if (type === "response.completed" || type === "response.incomplete") {
          const u = json?.response?.usage;
          if (u) {
            send(controller, {
              choices: [{ delta: {}, finish_reason: type === "response.incomplete" ? (json.response?.incomplete_details?.reason || "incomplete") : "stop" }],
              usage: {
                prompt_tokens: u.input_tokens ?? 0,
                completion_tokens: u.output_tokens ?? 0,
                prompt_tokens_details: { cached_tokens: u.input_tokens_details?.cached_tokens ?? 0 },
              },
            });
          }
        } else if (type === "error" || type === "response.failed") {
          console.error("story-chat responses stream error", payload.slice(0, 500));
          // Passed on so the usage meter records why the answer stopped.
          send(controller, { error: { message: String(json?.error?.message ?? json?.response?.error?.message ?? type).slice(0, 200) } });
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let reservedUserId: string | undefined;
  let reservationId: string | undefined;
  const startedAt = Date.now();
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { projectId, messages, activeChapterId, activeChapterTitle, hasSelection, prefab, reviewContext, reviewMetadata, speed: speedRaw,
      contextMode, benchTag, requestId } = await req.json();
    if (!projectId || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing projectId or messages" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve language from the requested project on every call. Never trust a
    // browser value here: tabs and mounted project views can briefly hold stale
    // state from another project, which previously leaked Portuguese into an
    // English project's status lines and answer.
    const { data: languageProject, error: languageError } = await supabase
      .from("projects")
      .select("ai_language")
      .eq("id", projectId)
      .maybeSingle();
    if (languageError || !languageProject) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiLanguage = languageProject.ai_language === "pt-BR" ? "pt-BR" : "en";

    const plan = planEditorRequest({ messages, hasSelection, prefab, reviewMetadata, speed: speedRaw });
    const { speed, scope, brainstorming, feature } = plan;

    const gate = await enforceAiGate(req, feature, corsHeaders);
    if (!gate.ok) return gate.response!;
    reservedUserId = gate.userId;
    reservationId = gate.reservationId;

    // Benchmarks can force the editor with or without project memory and label
    // the charge, for comparing the two. Admins only.
    const bench: { contextMode?: ContextMode; tag?: string } = {
      contextMode: contextMode === "text" || contextMode === "memory" ? contextMode : undefined,
      tag: typeof benchTag === "string" && benchTag ? benchTag.slice(0, 80) : undefined,
    };
    if (bench.contextMode || bench.tag) {
      const { data: admin } = await supabase
        .from("user_roles").select("role").eq("user_id", gate.userId).eq("role", "admin").maybeSingle();
      if (!admin) {
        return new Response(JSON.stringify({ error: "Benchmark options are for admins" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Optional, owner-private memory, fetched alongside the chapters. A missing
    // migration, disabled feature, or unindexed project leaves the established
    // context path unchanged.
    const memoryRequest: Promise<ProjectMemory | null> = Promise.resolve(
      supabase.rpc("read_project_memory", { _project_id: projectId }),
    ).then(({ data, error }) => (error || !data ? null : data as ProjectMemory), () => null);
    // The current speed tiers reach admins first, then everyone (editor_speed_tiers).
    const currentTiers: Promise<boolean> = Promise.resolve(supabase.rpc("can_use_feature", { _key: "editor_speed_tiers" }))
      .then(({ data }) => data === true, () => false);
    // Memory-first book answers have their own flag, so they can be compared and switched off.
    const focusAllowed: Promise<boolean> = scope === "book"
      ? Promise.resolve(supabase.rpc("can_use_feature", { _key: "memory_book_context" }))
        .then(({ data }) => data === true, () => false)
      : Promise.resolve(false);

    // Load chapters. In selection scope we only need the active chapter title,
    // so skip pulling every chapter's body out of the database.
    const { data: chapters } = scope === "selection"
      ? await supabase
          .from("story_chapters")
          .select("id, title, content, position, active_draft_id")
          .eq("project_id", projectId)
          .eq("id", activeChapterId ?? "00000000-0000-0000-0000-000000000000")
      : await supabase
          .from("story_chapters")
          .select("id, title, content, position, active_draft_id")
          .eq("project_id", projectId)
          .order("position", { ascending: true });

    // Chapters can have multiple drafts; the text the author is actually
    // reading is the ACTIVE DRAFT, not the chapter's base content column.
    // Without this the model reviews stale prose from an older draft.
    const chapterList: any[] = chapters || [];
    const draftIds = chapterList
      .map((c) => c.active_draft_id)
      .filter((id): id is string => Boolean(id));
    if (draftIds.length > 0) {
      const { data: drafts } = await supabase
        .from("story_chapter_drafts")
        .select("id, title, content")
        .in("id", draftIds);
      const byId = new Map((drafts || []).map((d: any) => [d.id, d]));
      for (const c of chapterList) {
        const d = c.active_draft_id ? byId.get(c.active_draft_id) : null;
        // Only prefer the draft when it actually has prose. An empty draft row
        // (e.g. created before the author pasted text) must never blank out the
        // chapter the author is looking at.
        if (d && typeof d.content === "string" && d.content.trim().length > 0) c.content = d.content;
      }
    }

    // Folios: notebook titles for the index, with their text when the question touches lore or canon.
    const { data: grids } = await supabase
      .from("notebook_grids")
      .select("id, title")
      .eq("project_id", projectId);
    const gridIds = (grids || []).map((g) => g.id);
    // Fixed column lists, so the query stays typed; text only when the question needs it.
    const notepads = () => supabase.from("notepads");
    const { data: notes } = gridIds.length === 0
      ? { data: [] as { title: string; grid_id: string; content?: string | null }[] }
      : plan.wantsFolios
        ? await notepads().select("title, content, grid_id").in("grid_id", gridIds)
        : await notepads().select("title, grid_id").in("grid_id", gridIds);
    const folios = (grids || []).map((g) => ({
      title: g.title,
      notes: (notes || []).filter((n) => n.grid_id === g.id).map((n) => ({ title: n.title, content: "content" in n ? String(n.content ?? "") : "" })),
    }));

    const { systemPrompt, contextMetadata } = buildEditorPrompt({
      plan,
      aiLanguage,
      prefab,
      chapters: chapterList.map((c) => ({ id: c.id, title: c.title || "", content: c.content || "" })),
      activeChapterId,
      activeChapterTitle,
      reviewContext,
      folios,
      memory: await memoryRequest,
      focusAllowed: await focusAllowed,
      contextMode: bench.contextMode,
      briefFast: await currentTiers,
      today: new Date().toISOString().slice(0, 10),
    });
    if (bench.tag) contextMetadata.bench = bench.tag;
    console.log(JSON.stringify({ event: "story-chat-context", ...contextMetadata }));

    // Speed mode resolved above (it also decides how much chapter context loads).

    const byok = !!gate.byokOpenAiKey;
    const tiers = (await currentTiers) ? "current" : "earlier";
    // On OpenRouter the admin's model choices pick the model for the speed tier.
    const preferred = editorModel(speed, byok, { tiers, narrowToSelection: plan.narrowToSelection });
    const route = await chatRouteFor(speed, gate.byokOpenAiKey, preferred);
    // A writer's own OpenAI key addresses OpenAI's bare model names; keep the gateway id here.
    const model = byok ? preferred : route.model;
    contextMetadata.tiers = tiers;

    // gpt-6-astra is only served on the gateway Responses API. Creative mode
    // therefore talks to /v1/responses and the SSE it returns is translated
    // back into chat-completions chunks so the browser and the usage meter
    // keep the single format they already understand.
    // OpenRouter serves gpt-6-astra on chat completions, so only the Lovable gateway needs this.
    const useResponses = !byok && route.provider === "lovable" && model === "openai/gpt-6-astra";
    // Local line-level asks don't need deep reasoning; low effort cuts latency
    // dramatically on GPT-5 while keeping quality on a short passage.
    // "low" effort made GPT-5 drop the structured format on prefab reviews,
    // so only plain chapter questions get the fast path.
    // GPT-5.6 on chat completions only accepts reasoning_effort "none".
    const isGpt56 = route.model.includes("gpt-5.6");
    // Creative on OpenRouter reasons whichever family serves it (Gemini Pro, Claude Opus too).
    const creativeOnOpenRouter = route.provider === "openrouter" && speed === "creative";
    const reasoningBody = route.isOpenAi || model.startsWith("openai/") || creativeOnOpenRouter
      ? {
          reasoning_effort: isGpt56
            ? "none"
            : speed === "fast"
              ? "minimal"
              // Creative needs real analysis (see the Responses call below); "low" skims.
              : speed === "creative" || byok ? "medium" : (scope === "chapter" ? "low" : "medium"),
        }
      : {};

    const trimmedMessages = stripStaleSelections(messages.slice(-20));
    // Reasoning shares the output budget, so reasoning models get the bigger one.
    const maxOut = route.isOpenAi || useResponses || creativeOnOpenRouter
        || (route.provider === "openrouter" && model.startsWith("openai/"))
      ? (scope === "book" ? 24000 : 12000)
      : 8192;

    const resp = useResponses
      ? await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: route.headers,
          body: JSON.stringify({
            model: route.model,
            instructions: systemPrompt,
            input: trimmedMessages.map((m: any) => ({
              role: m?.role === "assistant" ? "assistant" : "user",
              content: [{
                type: m?.role === "assistant" ? "output_text" : "input_text",
                text: String(m?.content ?? ""),
              }],
            })),
            stream: true,
            store: false,
            // Creative reviews need real analysis; "low" made the model skim
            // the chapter and answer "everything works". "high" on a whole
            // chapter ran for minutes and could spend the whole output budget
            // thinking, returning nothing, so Creative uses "medium".
            reasoning: {
              effort: speed === "creative" ? "medium" : (scope === "book" ? "medium" : "low"),
              summary: "auto",
            },
            include: ["reasoning.encrypted_content"],

            max_output_tokens: maxOut,
          }),
        })
      : await fetch(route.url, {
          method: "POST",
          headers: route.headers,
          body: JSON.stringify(route.prepare({
            model: route.model,
            messages: [
              { role: "system", content: systemPrompt },
              ...trimmedMessages,
            ],
            // GPT-5 spends "reasoning tokens" against this same budget before
            // emitting any visible text. 4096 is too tight — reasoning can eat
            // the whole budget and leave the response empty.
            max_completion_tokens: maxOut,
            stream: true,
            ...reasoningBody,
            ...route.extraBody,
          })),
        });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 403) {
        const body = await resp.text();
        console.error("story-chat blocked 403", body);
        let message = "AI access is blocked for this workspace. Ask the workspace admin to enable AI or raise the credit limit.";
        try {
          const parsed = JSON.parse(body);
          const type = parsed?.type ?? parsed?.error?.type;
          if (type === "credit_limit_reached") {
            message = "The workspace AI credit limit has been reached. Ask the workspace admin to raise the limit or add credits.";
          } else if (typeof parsed?.message === "string" && parsed.message) {
            message = parsed.message;
          } else if (typeof parsed?.error?.message === "string" && parsed.error.message) {
            message = parsed.error.message;
          }
        } catch { /* keep default message */ }
        return new Response(JSON.stringify({ error: message, code: "ai_blocked" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("story-chat error", resp.status, t);
      return new Response(JSON.stringify({ error: "Chat failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Meter the stream as it passes through and charge once it completes,
    // so cost scales with how big the question and answer actually were.
    const promptTokens = estimateTokens(
      systemPrompt + messages.slice(-20).map((m: any) => String(m?.content ?? "")).join(""),
    );
    let body = useResponses && resp.body ? responsesToChatSse(resp.body) : resp.body;
    if (!gate.byokOpenAiKey && body && gate.reservationId) {
      const streamUserId = gate.userId!;
      const streamReservationId = gate.reservationId;
      body = meterSseStream(body, promptTokens, (usage, stream) => {
        const metadata = {
          ...contextMetadata,
          first_text_ms: stream.firstTextAt === null ? null : stream.firstTextAt - startedAt,
          total_ms: stream.endedAt - startedAt,
          answer_chars: stream.textChars,
          finish_reason: stream.finishReason,
          ...(stream.cachedTokens !== null ? { cached_tokens: stream.cachedTokens } : {}),
          ...(stream.error ? { stream_error: stream.error } : {}),
        };
        if (!stream.textChars) {
          console.error("story-chat empty answer", JSON.stringify({ model: route.model, finish_reason: stream.finishReason, error: stream.error, context: contextMetadata.context }));
        }
        void chargeUsage(streamUserId, streamReservationId, feature, { model: route.model, ...usage, cachedInputTokens: stream.cachedTokens ?? 0, metadata })
          .then((chargeId) => chargeId
            ? undefined
            : releaseAiReservation(streamUserId, streamReservationId, "story_chat_settlement_failed"));
      }, (usage, stream) => ({
        // The same sum chargeUsage settles, so the browser can show what the answer cost.
        storymode: { credits: creditsForUsage({ model: route.model, ...usage, cachedInputTokens: stream.cachedTokens ?? 0 }) },
      }));
      // The metered stream now owns settlement. Do not release it when this
      // handler returns the streaming response to the browser.
      reservationId = undefined;
    }

    // A copy of the stream is read to the end on the server whatever happens to
    // the browser, and saved as it grows, so a reload mid-answer can pick it up
    // (and the charge settles, freeing the one-request lock, instead of
    // waiting for the reservation to expire).
    if (body && typeof requestId === "string" && UUID_RE.test(requestId) && gate.userId) {
      const [toBrowser, toKeep] = body.tee();
      body = toBrowser;
      const kept = keepAnswer(toKeep, { id: requestId, userId: gate.userId, projectId });
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime;
      if (runtime) runtime.waitUntil(kept); else void kept;
    }

    // Forward the SSE stream straight through to the client.
    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Storymode-Scope": scope,
      },
    });
  } catch (err) {
    console.error("story-chat fatal", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (reservedUserId && reservationId) {
      await releaseAiReservation(reservedUserId, reservationId, "story_chat_request_not_started");
    }
  }
});
