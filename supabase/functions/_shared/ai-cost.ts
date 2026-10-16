// Usage-metered credit pricing: a call costs what the model actually cost,
// converted to credits at USD_PER_CREDIT (see pricing.ts). Heavy work
// (whole-book analysis, image generation) naturally uses more credits than a
// short chapter question.

import { USD_PER_CREDIT } from "./pricing.ts";
export { USD_PER_CREDIT };

interface Price { in: number; out: number } // USD per 1M tokens

const MODEL_PRICES: Record<string, Price> = {
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "google/gemini-2.5-flash": { in: 0.30, out: 2.50 },
  "google/gemini-3-flash-preview": { in: 0.50, out: 3.00 },
  "google/gemini-3.6-flash": { in: 0.50, out: 3.00 },
  "openai/gpt-5": { in: 1.25, out: 10.00 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.00 },
  "openai/gpt-5.5": { in: 1.25, out: 10.00 },
  "openai/gpt-5.6-sol": { in: 1.25, out: 10.00 },
  "openai/gpt-6-astra": { in: 1.25, out: 10.00 },
  "gpt-5": { in: 1.25, out: 10.00 },
  "gpt-5-mini": { in: 0.25, out: 2.00 },
};

const DEFAULT_PRICE: Price = { in: 0.50, out: 3.00 };

/**
 * Share of the input price charged for input the provider served from its
 * prompt cache. Providers charge 10-25% for it, but Lovable's AI gateway
 * doesn't say whether it passes that on, so cached input costs the full rate
 * until it does; lower this once confirmed and writers pay less for it.
 */
export const CACHED_INPUT_SHARE = 1;

// Flat per-image cost for the gateway image model.
export const IMAGE_USD = 0.04;

export function priceFor(model: string): Price {
  return MODEL_PRICES[model] ?? MODEL_PRICES[model?.toLowerCase?.()] ?? DEFAULT_PRICE;
}

/** Rough token estimate when the provider doesn't report usage. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function usdForTokens(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}

export function creditsForUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 1;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

export interface UsageSample {
  model: string;
  inputTokens?: number;
  /** Of inputTokens, those served from the provider's prompt cache. */
  cachedInputTokens?: number;
  outputTokens?: number;
  images?: number;
  /** Recorded with the charge, e.g. how the request's context was built. */
  metadata?: Record<string, unknown>;
}

export function creditsForUsage(u: UsageSample): number {
  const input = u.inputTokens ?? 0;
  const cached = Math.min(u.cachedInputTokens ?? 0, input);
  const tokenUsd = usdForTokens(u.model, input - cached + cached * CACHED_INPUT_SHARE, u.outputTokens ?? 0);
  const imageUsd = (u.images ?? 0) * IMAGE_USD;
  return creditsForUsd(tokenUsd + imageUsd);
}

/** Pulls `usage` out of a non-streaming chat completion response body. */
export function usageFromResponse(json: any): { inputTokens: number; outputTokens: number } | null {
  const u = json?.usage;
  if (!u) return null;
  const inTok = u.prompt_tokens ?? u.input_tokens;
  const outTok = u.completion_tokens ?? u.output_tokens;
  if (typeof inTok !== "number" || typeof outTok !== "number") return null;
  return { inputTokens: inTok, outputTokens: outTok };
}

/**
 * Passes an SSE stream through untouched while measuring it. Prefers a
 * provider-reported `usage` chunk; falls back to counting emitted characters.
 * `onDone` fires once the upstream stream ends. `trailer`, when given, adds one
 * last SSE event built from the same measurements (e.g. the credits charged).
 */
export function meterSseStream(
  body: ReadableStream<Uint8Array>,
  fallbackInputTokens: number,
  onDone: (
    usage: { inputTokens: number; outputTokens: number },
    stream: {
      firstTextAt: number | null; endedAt: number; textChars: number; finishReason: string | null; error: string | null;
      /** Input tokens the provider served from its prompt cache, when it says. */
      cachedTokens: number | null;
    },
  ) => void,
  trailer?: (usage: { inputTokens: number; outputTokens: number }, stream: { cachedTokens: number | null }) => unknown,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let outChars = 0;
  let firstTextAt: number | null = null;
  let finishReason: string | null = null;
  let error: string | null = null;
  let cachedTokens: number | null = null;
  let reported: { inputTokens: number; outputTokens: number } | null = null;
  let buffer = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      try {
        buffer += decoder.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const json = JSON.parse(payload);
          const u = usageFromResponse(json);
          if (u) reported = u;
          const cached = json?.usage?.prompt_tokens_details?.cached_tokens ?? json?.usage?.input_tokens_details?.cached_tokens;
          if (typeof cached === "number") cachedTokens = cached;
          const finish = json?.choices?.[0]?.finish_reason;
          if (typeof finish === "string") finishReason = finish;
          if (json?.error) error = String(json.error.message ?? json.error).slice(0, 200);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            if (delta && firstTextAt === null) firstTextAt = Date.now();
            outChars += delta.length;
          }
        }
      } catch (_e) {
        // Measurement must never break the stream.
      }
    },
    flush(controller) {
      const usage = reported ?? {
        inputTokens: fallbackInputTokens,
        outputTokens: estimateTokens("x".repeat(outChars)),
      };
      onDone(usage, { firstTextAt, endedAt: Date.now(), textChars: outChars, finishReason, error, cachedTokens });
      if (!trailer) return;
      try {
        const event = trailer(usage, { cachedTokens });
        if (event !== undefined) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch (_e) {
        // The trailer is extra; it must never break the stream.
      }
    },
  });

  return body.pipeThrough(transform);
}
