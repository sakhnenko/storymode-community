// Admin check for one AI provider family on OpenRouter: sends a tiny request
// to the family's Fast model and says whether it worked and who paid. OpenRouter
// reports the upstream provider's cost only when the admin's own provider key
// (added in OpenRouter) served the request, so that's how "your own key" shows.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiProvider, chatRoute } from "../_shared/ai-provider.ts";
import { FAMILY_MODELS, IMAGE_MODELS, type ModelFamily } from "../_shared/model-catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await db.auth.getUser(authHeader.slice("Bearer ".length));
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Admins only" }, 403);

  const { family } = await req.json().catch(() => ({}));
  if (!(family in FAMILY_MODELS)) return json({ error: "Unknown provider family" }, 400);
  if (aiProvider() !== "openrouter") {
    return json({ ok: false, error: "This server isn't using OpenRouter, so model choices don't apply." });
  }

  const model = FAMILY_MODELS[family as ModelFamily].fast;
  try {
    const route = chatRoute(null, model);
    const resp = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify(route.prepare({
        model,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        max_completion_tokens: 16,
      })),
    });
    const body = await resp.json().catch(() => null);
    if (!resp.ok) {
      const message = body?.error?.message || `OpenRouter answered ${resp.status}`;
      return json({ ok: false, model, error: String(message).slice(0, 300) });
    }
    const upstream = Number(body?.usage?.cost_details?.upstream_inference_cost ?? 0);
    return json({
      ok: true,
      model,
      // Images come from the same provider key; say which model they'd use.
      imageModel: family in IMAGE_MODELS ? IMAGE_MODELS[family as keyof typeof IMAGE_MODELS] : null,
      ownKey: upstream > 0,
    });
  } catch (err) {
    return json({ ok: false, model, error: err instanceof Error ? err.message : "The check failed" });
  }
});
