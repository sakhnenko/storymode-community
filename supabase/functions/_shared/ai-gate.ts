// Shared AI gate for edge functions.
// Call `enforceAiGate` before contacting the model, then `chargeUsage` with the
// real token/image usage once the model has answered. Credits are a single
// pool and cost scales with how expensive the call actually was.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "./byok-crypto.ts";
import { creditsForUsage, type UsageSample } from "./ai-cost.ts";
import { selfHosted } from "./self-hosted.ts";

export type AiFeature =
  | "chat_flash"
  | "chat_gpt5"
  | "highlight"
  | "map_draw"
  | "ocr"
  | "draw_flavor";

// Minimum balance required to *start* a call. The real charge is computed
// from actual usage afterwards, so this is only a floor that stops someone
// at zero from kicking off an expensive job.
const MIN_BALANCE: Record<AiFeature, number> = {
  chat_flash: 1,
  draw_flavor: 1,
  chat_gpt5: 3,
  highlight: 2,
  ocr: 1,
  map_draw: 8,
};

/** A client acting as the signed-in user. */
function userClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

export interface GateResult {
  ok: boolean;
  response?: Response;
  userId?: string;
  supabase?: ReturnType<typeof userClient>;
  byokOpenAiKey?: string | null;
  reservationId?: string;
}

export async function enforceAiGate(
  req: Request,
  feature: AiFeature,
  corsHeaders: Record<string, string>,
): Promise<GateResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const supabase = userClient(authHeader);

  const token = authHeader.replace("Bearer ", "");
  let userId: string;
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
      };
    }
    userId = userData.user.id;
  } catch (_e) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Auth temporarily unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  // Self-hosted: signed in is enough. The server's own AI key serves everyone
  // (no per-writer keys), and no credits are reserved, so nothing is charged
  // afterwards (chargeUsage skips a call without a reservation).
  if (selfHosted()) {
    return { ok: true, userId, supabase, byokOpenAiKey: null };
  }

  // BYOK lookup: user-provided OpenAI keys bypass plan/quota checks.
  let byokOpenAiKey: string | null = null;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: keyRow } = await admin
      .from("user_api_keys")
      .select("openai_key_ciphertext, openai_key_iv")
      .eq("user_id", userId)
      .maybeSingle();
    if (keyRow?.openai_key_ciphertext && keyRow?.openai_key_iv) {
      byokOpenAiKey = await decryptSecret(keyRow.openai_key_ciphertext, keyRow.openai_key_iv);
    }
  } catch (e) {
    console.error("ai-gate byok lookup failed", e);
  }

  if (byokOpenAiKey) {
    // BYOK: skip both plan and quota gates. User pays OpenAI directly.
    return { ok: true, userId, supabase, byokOpenAiKey };
  }

  const minimum = MIN_BALANCE[feature] ?? 1;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: reservation, error: reservationError } = await admin.rpc("reserve_ai_credits", {
    _user_id: userId,
    _feature: feature,
    _minimum: minimum,
  });
  if (reservationError) {
    console.error("AI credit reservation failed", reservationError);
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Credits reservation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  if (!reservation?.ok && reservation?.reason === "busy") {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Another AI request is still running. Wait a few minutes and try again.",
          ai_request_in_progress: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  if (!reservation?.ok) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "You're out of AI credits. Upgrade your plan or buy more to keep using this feature.",
          credits_exhausted: true,
          feature,
          needed: reservation?.needed ?? minimum,
          remaining: reservation?.remaining ?? 0,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const reservationId = reservation?.reservation_id;
  if (typeof reservationId !== "string") {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Credits reservation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, userId, supabase, reservationId };
}

/**
 * Charges the user for what the call actually cost according to ai-cost.ts.
 * Safe to call fire-and-forget: never throws.
 */
export async function chargeUsage(
  userId: string,
  reservationId: string,
  feature: AiFeature,
  usage: UsageSample,
): Promise<string | null> {
  // Nothing was reserved (a self-hosted install), so there's nothing to settle.
  if (!reservationId) return null;
  try {
    const amount = creditsForUsage(usage);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await admin.rpc("settle_ai_credit_reservation", {
      _reservation_id: reservationId,
      _user_id: userId,
      _amount: amount,
      _reason: feature,
      _metadata: {
        ...usage.metadata,
        model: usage.model,
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
        images: usage.images ?? 0,
      },
    });
    if (error) { console.error("settle_ai_credit_reservation error", error); return null; }
    if (!(data as any)?.ok) {
      console.error("settle_ai_credit_reservation rejected", data);
      return null;
    }
    const ledgerId = (data as any)?.ledger_id;
    return typeof ledgerId === "string" ? ledgerId : null;
  } catch (err) {
    console.error("settle_ai_credit_reservation failed", err);
    return null;
  }
}

export async function releaseAiReservation(
  userId: string | undefined,
  reservationId: string | undefined,
  reason: string,
): Promise<void> {
  if (!userId || !reservationId) return;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { error } = await admin.rpc("release_ai_credit_reservation", {
      _reservation_id: reservationId,
      _user_id: userId,
      _reason: reason.slice(0, 200),
    });
    if (error) console.error("release_ai_credit_reservation error", error);
  } catch (err) {
    console.error("release_ai_credit_reservation failed", err);
  }
}
