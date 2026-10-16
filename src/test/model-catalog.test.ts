import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_SETTINGS, FAMILY_MODELS, imageModelFor, modelFor, normalizeModelSettings,
} from "../../supabase/functions/_shared/model-catalog";

/**
 * The model choices a self-hosted admin makes on OpenRouter: which provider
 * family serves each tier.
 */
describe("model choices", () => {
  it("default to the models the app has always used", () => {
    expect(modelFor("fast", DEFAULT_MODEL_SETTINGS, "x")).toBe("google/gemini-2.5-flash");
    expect(modelFor("thoughtful", DEFAULT_MODEL_SETTINGS, "x")).toBe("google/gemini-3.6-flash");
    expect(modelFor("creative", DEFAULT_MODEL_SETTINGS, "x")).toBe("openai/gpt-6-astra");
    expect(imageModelFor(DEFAULT_MODEL_SETTINGS)).toBe("google/gemini-3.1-flash-image-preview");
  });

  it("pick each tier's model from the chosen family", () => {
    const claude = { fast: "anthropic", thoughtful: "anthropic", creative: "anthropic", images: "openai" } as const;
    expect(modelFor("fast", claude, "x")).toBe("anthropic/claude-haiku-5.5");
    expect(modelFor("thoughtful", claude, "x")).toBe("anthropic/claude-sonnet-5.5");
    expect(modelFor("creative", claude, "x")).toBe("anthropic/claude-opus-5.5");
    expect(imageModelFor(claude)).toBe("openai/gpt-5.4-image-2");
    expect(modelFor("creative", { ...claude, creative: "google" }, "x")).toBe("google/gemini-3.1-pro-preview");
  });

  it("send background work to the Fast family, keeping each job's own Gemini model", () => {
    expect(modelFor("utility", DEFAULT_MODEL_SETTINGS, "google/gemini-3-flash-preview")).toBe("google/gemini-3-flash-preview");
    expect(modelFor("utility", { ...DEFAULT_MODEL_SETTINGS, fast: "openai" }, "google/gemini-3-flash-preview")).toBe(FAMILY_MODELS.openai.fast);
    expect(modelFor("utility", { ...DEFAULT_MODEL_SETTINGS, fast: "anthropic" }, "google/gemini-2.5-flash-lite")).toBe(FAMILY_MODELS.anthropic.fast);
  });

  it("fall back to the defaults for missing or unknown stored values", () => {
    expect(normalizeModelSettings(null)).toEqual(DEFAULT_MODEL_SETTINGS);
    expect(normalizeModelSettings({ fast: "mistral", creative: "anthropic", images: "anthropic" })).toEqual({
      ...DEFAULT_MODEL_SETTINGS,
      creative: "anthropic",
    });
  });
});
