// The admin's model choices (ai_model_settings), applied when the AI provider
// is OpenRouter. With the Lovable gateway every function keeps its own model.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiProvider, chatRoute, type ChatRoute } from "./ai-provider.ts";
import {
  DEFAULT_MODEL_SETTINGS, imageModelFor, modelFor, normalizeModelSettings,
  type ModelSettings, type ModelTier,
} from "./model-catalog.ts";

const CACHE_MS = 30_000;
let cached: { at: number; settings: ModelSettings } | null = null;

/** The stored choices (cached briefly per function instance); defaults if unreadable. */
export async function modelSettings(): Promise<ModelSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.settings;
  let settings = DEFAULT_MODEL_SETTINGS;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data } = await admin.from("ai_model_settings").select("fast, thoughtful, creative, images").maybeSingle();
    settings = normalizeModelSettings(data);
  } catch (err) {
    console.error("model settings unreadable; using defaults", err);
  }
  cached = { at: Date.now(), settings };
  return settings;
}

/** The model for a tier: the admin's choice on OpenRouter, otherwise `fallback`. */
export async function pickModel(tier: ModelTier, fallback: string): Promise<string> {
  if (aiProvider() !== "openrouter") return fallback;
  return modelFor(tier, await modelSettings(), fallback);
}

/** The image model on OpenRouter, or null to keep the provider's default. */
export async function pickImageModel(): Promise<string | null> {
  if (aiProvider() !== "openrouter") return null;
  return imageModelFor(await modelSettings());
}

/**
 * chatRoute for a tier. A writer's own OpenAI key (BYOK) still goes straight
 * to OpenAI with its own model mapping, so the choices don't apply to it.
 */
export async function chatRouteFor(tier: ModelTier, byokKey: string | null | undefined, fallback: string): Promise<ChatRoute> {
  return chatRoute(byokKey, byokKey ? fallback : await pickModel(tier, fallback));
}
