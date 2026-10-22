import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enforceAiGate, chargeUsage, releaseAiReservation, type GateResult } from '../_shared/ai-gate.ts';
import { usageFromResponse, estimateTokens } from '../_shared/ai-cost.ts';
import { chatRouteFor } from '../_shared/model-choice.ts';
import { MAX_MEMORY_CHAPTER_CHARS, MEMORY_EXTRACTION_PROMPT, MEMORY_VERSION, knownEntitiesFrom, knownFactsFor, memoryEntityPreview,
  memoryNameKey, memorySourceText, memoryStreamReader, mergeMemoryEntities, parseMemoryReply, splitMemorySource,
  validateMemoryExtraction, type MemoryClaim, type MemoryEntity, type WritingKind } from '../_shared/project-memory.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Non-reasoning model: with a thinking model, reasoning tokens share the output
// budget, and long passages were cut off mid-JSON and had to be retried.
const MODEL = 'google/gemini-3.6-flash';
const MAX_OUTPUT_TOKENS = 16_000;

/** Progress sent to the Codex while a chapter is read, as server-sent events. */
type MemoryEvent =
  | { type: 'start'; passages: number }
  | { type: 'passage'; index: number }
  | { type: 'entity'; name: string; kind: string; sameAs: string[] }
  | { type: 'fact'; subject: string; kind: string; statement: string }
  | { type: 'done'; count: number; rejected: number }
  | { type: 'error'; error: string };
interface Usage { inputTokens: number; outputTokens: number }
interface Outcome { status: number; body: Record<string, unknown> }
/** The service-role client. */
const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
type Admin = ReturnType<typeof adminClient>;
/** Supabase's edge runtime: work handed to `waitUntil` keeps the function running after its reply ends. */
const runtime = (globalThis as { EdgeRuntime?: { waitUntil(work: Promise<unknown>): void } }).EdgeRuntime;

/**
 * Whether this is the free reading of a new member's first chapter: the
 * project they made while signing up, with nothing in it read before.
 */
async function isWelcomeReading(admin: Admin, userId: string, projectId: string) {
  const [{ data: onboarding }, { count, error }] = await Promise.all([
    admin.from('user_onboarding').select('project_id').eq('user_id', userId).maybeSingle(),
    admin.from('project_memory_jobs').select('chapter_id', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);
  return !error && onboarding?.project_id === projectId && count === 0;
}

/** Collects a streamed chat completion, passing each piece of text on as it arrives. */
async function readCompletion(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void) {
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage: Usage | null = null;
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        usage = usageFromResponse(json) || usage;
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) { content += delta; onDelta(delta); }
      } catch { /* a malformed event line should not end the read */ }
    }
  }
  return { content, usage };
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  let userId: string | undefined;
  let reservationId: string | undefined;
  let lease: string | undefined;
  let chapterId: string | undefined;
  let streaming = false;
  const admin = adminClient();
  const cleanup = async () => {
    if (lease && chapterId) {
      const { error } = await admin.rpc('fail_project_memory', { _chapter_id: chapterId, _token: lease });
      if (error) console.error('project-memory lease cleanup failed', error.code);
    }
    await releaseAiReservation(userId, reservationId, 'project_memory_finished');
  };
  // Do not log manuscript text, provider output, or raw database payloads.
  // Our own error messages never contain manuscript text; cap length anyway.
  const logFailure = (error: unknown) => console.error('project-memory analysis failed',
    error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'unknown');
  try {
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'unauthorized' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return reply({ error: 'unauthorized' }, 401);
    userId = auth.user.id;
    const body = await req.json();
    const projectId = body?.projectId;
    chapterId = body?.chapterId;
    if (!uuid.test(projectId || '') || !uuid.test(chapterId || '') || body?.acceptUsage !== true) return reply({ error: 'invalidRequest' }, 400);
    // Sent by onboarding, which reads the chapter a new member gave once, free. Never charged instead.
    const welcome = body?.welcome === true;
    if (welcome && !(await isWelcomeReading(admin, userId, projectId))) return reply({ error: 'forbidden' }, 403);

    const { data: started, error: startError } = await admin.rpc('begin_project_memory', {
      _user_id: userId, _project_id: projectId, _chapter_id: chapterId, _version: MEMORY_VERSION,
    });
    if (startError) return reply({ error: startError.code === '42501' ? 'forbidden' : 'unavailable' }, startError.code === '42501' ? 403 : 503);
    if (started?.cached) return reply({ cached: true });
    if (started?.busy) return reply({ error: 'busy' }, 409);
    lease = started?.token;
    const source = started?.source;
    if (!lease || !source) throw new Error('Invalid lease');
    const text = memorySourceText(String(source.content || ''));
    if (text.length < 40) return reply({ error: 'empty' }, 200);
    if (text.length > MAX_MEMORY_CHAPTER_CHARS) return reply({ error: 'tooLong', limit: MAX_MEMORY_CHAPTER_CHARS }, 400);

    const gate: GateResult = welcome ? { ok: true, byokOpenAiKey: null } : await enforceAiGate(req, 'chat_flash', cors);
    if (!gate.ok) return gate.response!;
    reservationId = gate.reservationId;
    const { data: project, error: projectError } = await client.from('projects').select('ai_language').eq('id', projectId).single();
    if (projectError) throw projectError;
    const prompt = MEMORY_EXTRACTION_PROMPT + `\nWrite statements, scope and genre in ${project.ai_language === 'pt-BR' ? 'Brazilian Portuguese' : 'English'}. Quotes and names stay in the original language.`;
    // Names recorded in the project's other chapters, so this chapter reuses them.
    const { data: others } = await admin.from('project_memory_chapters')
      .select('entities, claims').eq('project_id', projectId).neq('chapter_id', chapterId);
    const knownElsewhere = knownEntitiesFrom(others || []);
    const route = await chatRouteFor("utility", gate.byokOpenAiKey, MODEL);

    /** One model call; with `onDelta`, streamed so the reply can be shown while it is written. */
    const call = async (strict: boolean, title: string, passage: string, note: string, known: unknown[], facts: unknown[],
      onDelta?: (text: string) => void): Promise<{ content: string; usage: Usage } | null> => {
      const system = prompt + note + (strict ? '\nYour previous reply was not valid JSON. Reply with ONE complete JSON object only, no prose, no code fence. Keep statements short so the object is complete.' : '');
      const user = JSON.stringify({ title, ...(known.length ? { knownEntities: known } : {}),
        ...(facts.length ? { knownFacts: facts } : {}), manuscript: passage });
      const request = { model: route.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_completion_tokens: MAX_OUTPUT_TOKENS, response_format: { type: 'json_object' },
        ...(route.isOpenAi ? { reasoning_effort: 'minimal' } : {}), ...route.extraBody };
      // A provider that does not report usage is billed on an estimate of what was sent and written.
      const usageOf = (reported: Usage | null, content: string) =>
        reported || { inputTokens: estimateTokens(system + user), outputTokens: estimateTokens(content) };
      if (onDelta) {
        const response = await fetch(route.url, { method: 'POST', headers: route.headers,
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify(route.prepare({ ...request, stream: true, ...(route.isOpenAi ? { stream_options: { include_usage: true } } : {}) })) });
        if (response.ok && response.body) {
          const { content, usage } = await readCompletion(response.body, onDelta);
          return { content, usage: usageOf(usage, content) };
        }
        // Streaming was refused before anything was written; ask again without it.
      }
      const response = await fetch(route.url, { method: 'POST', headers: route.headers,
        signal: AbortSignal.timeout(120_000), body: JSON.stringify(route.prepare(request)) });
      if (!response.ok) return null;
      const output = await response.json();
      const content = String(output?.choices?.[0]?.message?.content || '');
      return { content, usage: usageOf(usageFromResponse(output), content) };
    };

    const analyze = async (emit?: (event: MemoryEvent) => void): Promise<Outcome> => {
      const total: Usage = { inputTokens: 0, outputTokens: 0 };
      let used = false;
      const charge = async () => {
        if (welcome || gate.byokOpenAiKey || !used) return true;
        return await chargeUsage(userId!, reservationId!, 'chat_flash', { model: route.model, ...total });
      };
      const preview = memoryEntityPreview(String(source.content || ''));
      const shown = new Set<string>();
      const chunks = splitMemorySource(text);
      const perChunk = Math.max(4, Math.floor(25 / chunks.length));
      const merged: MemoryClaim[] = [];
      const entityLists: MemoryEntity[][] = [];
      const seen = new Set<string>();
      const kinds: Record<string, number> = {};
      const genres: Record<string, number> = {};
      let rejected = 0;
      let anyParsed = false;
      emit?.({ type: 'start', passages: chunks.length });
      for (let i = 0; i < chunks.length; i++) {
        emit?.({ type: 'passage', index: i });
        const label = chunks.length > 1 ? `${source.title} (passage ${i + 1} of ${chunks.length})` : source.title;
        const limitNote = chunks.length > 1 ? `\nThis is passage ${i + 1} of ${chunks.length} of one chapter. Return at most ${perChunk} claims for this passage.` : '';
        // Later passages also see the names found in this chapter's earlier passages.
        const known = entityLists.length
          ? knownEntitiesFrom([{ entities: mergeMemoryEntities(entityLists) }, ...(others || [])])
          : knownElsewhere;
        // Lasting facts already recorded about who this passage mentions, so it adds only what is new.
        const knownFacts = knownFactsFor([{ claims: merged }, ...(others || [])], chunks[i]);
        const show = (name: string, kind: string, sameAs: string[]) => {
          const key = `${kind}|${memoryNameKey(name)}`;
          if (shown.has(key)) return;
          shown.add(key);
          emit?.({ type: 'entity', name, kind, sameAs });
        };
        let parsed: unknown = null;
        for (const strict of [false, true]) {
          // Each entity is shown once, as soon as the model has written it; facts only on the first try.
          const read = emit && memoryStreamReader((list, value) => {
            if (list === 'entities') {
              const entity = preview(value);
              if (entity) show(entity.name, entity.kind, entity.sameAs);
            } else if (!strict && typeof value.subject === 'string' && value.subject) {
              // Shown as a preview until the passage is validated and saved.
              emit({ type: 'fact', subject: value.subject.slice(0, 120), kind: String(value.kind ?? ''),
                statement: typeof value.statement === 'string' ? value.statement.slice(0, 300) : '' });
            }
          });
          const output = await call(strict, label, chunks[i], limitNote, known, knownFacts, read);
          if (!output) {
            // Bill what earlier calls used; with nothing used, the reservation is released instead.
            if (used) {
              await charge();
              if (!gate.byokOpenAiKey) reservationId = undefined;
            }
            return { status: 502, body: { error: 'provider' } };
          }
          used = true;
          total.inputTokens += output.usage.inputTokens;
          total.outputTokens += output.usage.outputTokens;
          parsed = parseMemoryReply(output.content);
          if (parsed) break;
        }
        if (parsed === null) continue;
        anyParsed = true;
        try {
          const part = await validateMemoryExtraction(parsed, source.content, known);
          rejected += part.rejected;
          entityLists.push(part.entities);
          kinds[part.writingKind] = (kinds[part.writingKind] || 0) + 1;
          if (part.genre) genres[part.genre] = (genres[part.genre] || 0) + 1;
          for (const claim of part.claims.slice(0, perChunk)) {
            if (seen.has(claim.key)) continue;
            seen.add(claim.key);
            merged.push(claim);
          }
        } catch { rejected += 1; /* one passage without valid citations should not sink the chapter */ }
      }
      if (!(await charge())) return { status: 503, body: { error: 'billing' } };
      if (!gate.byokOpenAiKey) reservationId = undefined;
      if (!anyParsed) return { status: 502, body: { error: 'malformed' } };
      if (!merged.length && rejected > 0) return { status: 422, body: { error: 'citations' } };
      const writingKind = (Object.entries(kinds).filter(([k]) => k !== 'general').sort((a, b) => b[1] - a[1])[0]?.[0]
        || 'general') as WritingKind;
      const extraction = { claims: merged.slice(0, 25), entities: mergeMemoryEntities(entityLists), writingKind, rejected };
      const { error: finishError } = await admin.rpc('finish_project_memory', {
        _user_id: userId, _project_id: projectId, _chapter_id: chapterId, _token: lease,
        _revision: source.revision, _claims: extraction.claims, _writing_kind: extraction.writingKind,
        _entities: extraction.entities, _version: MEMORY_VERSION,
      });
      if (finishError) return { status: 409, body: { error: finishError.message.includes('Source changed') ? 'sourceChanged' : 'publish' } };
      lease = undefined;
      // A project without a genre gets the one its chapters show; an author's choice is never replaced.
      const genre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (genre) {
        const { error: genreError } = await admin.from('project_writing_profiles').update({ genre })
          .eq('project_id', projectId).eq('genre', '');
        if (genreError) console.error('project-memory genre update failed', genreError.code);
      }
      return { status: 200, body: { count: extraction.claims.length, rejected: extraction.rejected } };
    };

    if (body?.stream !== true) {
      const outcome = await analyze();
      return reply(outcome.body, outcome.status);
    }
    // The Codex asked to watch: send progress as it happens, then the outcome.
    // Reading and saving carry on if the page goes away. Server-sent events,
    // because proxies pass them through at once; other streamed types (such as
    // NDJSON) were held back and compressed until the reply ended.
    streaming = true;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // `at` is milliseconds since reading began, so the page's network panel shows
        // whether finds left the server spread out or together.
        const began = Date.now();
        const emit = (event: MemoryEvent) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, at: Date.now() - began })}\n\n`)); } catch { /* reader left */ }
        };
        // Opens the stream right away, before the first model call returns.
        controller.enqueue(encoder.encode(': reading\n\n'));
        const work = (async () => {
          try {
            const outcome = await analyze(emit);
            emit(outcome.status === 200
              ? { type: 'done', count: Number(outcome.body.count), rejected: Number(outcome.body.rejected) }
              : { type: 'error', error: String(outcome.body.error) });
          } catch (error) {
            logFailure(error);
            emit({ type: 'error', error: 'failed' });
          } finally {
            await cleanup();
            try { controller.close(); } catch { /* already closed */ }
          }
        })();
        runtime?.waitUntil(work);
      },
    });
    return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no' } });
  } catch (error) {
    logFailure(error);
    return reply({ error: 'failed' }, 500);
  } finally {
    if (!streaming) await cleanup();
  }
});
