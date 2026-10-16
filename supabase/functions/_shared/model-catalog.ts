// Which models each AI provider family offers for each StoryMode tier, and how
// an admin's choices pick among them. Dependency-free so it can be unit tested
// (src/test/model-catalog.test.ts); model-choice.ts reads the choices.
//
// Only used with OpenRouter, which serves all three families under these ids
// and uses the admin's own provider key for a family when they've added one
// there. The Lovable gateway keeps each function's own model.

export type ModelFamily = "google" | "openai" | "anthropic";
export type ImageFamily = "google" | "openai";
/** Writing tiers, plus background work (memory, OCR, setup, progress text). */
export type ModelTier = "fast" | "thoughtful" | "creative" | "utility";

export interface ModelSettings {
  fast: ModelFamily;
  thoughtful: ModelFamily;
  creative: ModelFamily;
  images: ImageFamily;
}

/** The app as it has always been: Gemini for Fast and Thoughtful, GPT for Creative. */
export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  fast: "google",
  thoughtful: "google",
  creative: "openai",
  images: "google",
};

export const FAMILY_MODELS: Record<ModelFamily, { fast: string; thoughtful: string; creative: string }> = {
  google: {
    fast: "google/gemini-2.5-flash",
    thoughtful: "google/gemini-3.6-flash",
    creative: "google/gemini-3.1-pro-preview",
  },
  openai: {
    fast: "openai/gpt-5-mini",
    thoughtful: "openai/gpt-5.5",
    creative: "openai/gpt-6-astra",
  },
  anthropic: {
    fast: "anthropic/claude-haiku-5.5",
    thoughtful: "anthropic/claude-sonnet-5.5",
    creative: "anthropic/claude-opus-5.5",
  },
};

export const IMAGE_MODELS: Record<ImageFamily, string> = {
  google: "google/gemini-3.1-flash-image-preview",
  openai: "openai/gpt-5.4-image-2",
};

const FAMILIES: ModelFamily[] = ["google", "openai", "anthropic"];
const IMAGE_FAMILIES: ImageFamily[] = ["google", "openai"];

/** A stored settings row, with anything missing or unknown falling back to the defaults. */
export function normalizeModelSettings(row: Partial<Record<keyof ModelSettings, unknown>> | null | undefined): ModelSettings {
  const family = (value: unknown, fallback: ModelFamily) =>
    FAMILIES.includes(value as ModelFamily) ? value as ModelFamily : fallback;
  return {
    fast: family(row?.fast, DEFAULT_MODEL_SETTINGS.fast),
    thoughtful: family(row?.thoughtful, DEFAULT_MODEL_SETTINGS.thoughtful),
    creative: family(row?.creative, DEFAULT_MODEL_SETTINGS.creative),
    images: IMAGE_FAMILIES.includes(row?.images as ImageFamily) ? row?.images as ImageFamily : DEFAULT_MODEL_SETTINGS.images,
  };
}

/**
 * The model for a tier under the admin's choices. Background work follows the
 * Fast family; with Google it keeps the function's own model (`fallback`),
 * which was picked for that job.
 */
export function modelFor(tier: ModelTier, settings: ModelSettings, fallback: string): string {
  if (tier === "utility") {
    return settings.fast === "google" ? fallback : FAMILY_MODELS[settings.fast].fast;
  }
  return FAMILY_MODELS[settings[tier]][tier];
}

export function imageModelFor(settings: ModelSettings): string {
  return IMAGE_MODELS[settings.images];
}
