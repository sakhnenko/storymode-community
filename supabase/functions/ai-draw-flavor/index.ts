import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enforceAiGate, chargeUsage, releaseAiReservation } from "../_shared/ai-gate.ts";
import { usageFromResponse, estimateTokens } from "../_shared/ai-cost.ts";
import { languageDirective } from "../_shared/ai-language.ts";
import { chatRouteFor } from "../_shared/model-choice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let reservedUserId: string | undefined;
  let reservationId: string | undefined;
  try {
    const gate = await enforceAiGate(req, "draw_flavor", corsHeaders);
    if (!gate.ok) return gate.response!;
    reservedUserId = gate.userId;
    reservationId = gate.reservationId;

    const { prompt, aiLanguage } = (await req.json()) as { prompt: string; aiLanguage?: string };
    const p = (prompt || "").trim();
    if (!p) return new Response(JSON.stringify({ flavor: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sys = `You narrate, in present continuous tense, what a cartographer is doing right now to render a small fantasy-map illustration of the user's request. Write EXACTLY two short poetic lines (max ~7 words each), no quotes, no punctuation at the end of the last line, no labels. Be evocative and concrete to the subject. Examples:
Request: "draw a castle" -> "Raising the keep's stone walls\nFilling the moat with dark water"
Request: "a small forest" -> "Scattering seeds across the clearing\nCoaxing pines toward the sky"
Request: "a winding river" -> "Carving a path through the valley\nLetting the current find its voice"${languageDirective(aiLanguage, "flavor-poem")}`;

    const route = await chatRouteFor("utility", gate.byokOpenAiKey, "google/gemini-2.5-flash-lite");
    const resp = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify(route.prepare({
        model: route.model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Request: "${p}"` },
        ],
        ...route.extraBody,
      })),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("ai-draw-flavor error", resp.status, t.slice(0, 300));
      return new Response(JSON.stringify({ flavor: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!gate.byokOpenAiKey) {
      const u = usageFromResponse(data) ?? {
        inputTokens: estimateTokens(sys + p),
        outputTokens: estimateTokens(text),
      };
      const chargeId = await chargeUsage(gate.userId!, gate.reservationId!, "draw_flavor", { model: route.model, ...u });
      if (chargeId) reservationId = undefined;
    }
    return new Response(JSON.stringify({ flavor: text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-draw-flavor fatal", err);
    return new Response(JSON.stringify({ flavor: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } finally {
    if (reservedUserId && reservationId) {
      await releaseAiReservation(reservedUserId, reservationId, "draw_flavor_request_not_completed");
    }
  }
});
