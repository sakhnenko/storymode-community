// Resolves the chat/image endpoint + model to use for a given request.
// If the user provided their own OpenAI key (BYOK), calls go directly to
// OpenAI. Otherwise they go through the configured AI provider:
//
// - Lovable AI Gateway (LOVABLE_API_KEY), the hosted StoryMode default.
// - OpenRouter (OPENROUTER_API_KEY), for self-hosting with one key. It serves
//   the same "google/…" and "openai/…" model ids, so no model mapping is needed.
//
// AI_PROVIDER ("lovable" | "openrouter") picks one explicitly; otherwise
// whichever key is set wins, Lovable first.

export type AiProvider = "lovable" | "openrouter";

/** An edge-function secret. Read through globalThis so this module also type-checks (and is tested) outside Deno. */
const env = (key: string): string | undefined =>
  (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env.get(key);

export function aiProvider(): AiProvider {
  const chosen = (env("AI_PROVIDER") || "").trim().toLowerCase();
  if (chosen === "lovable" || chosen === "openrouter") return chosen;
  if (env("LOVABLE_API_KEY")) return "lovable";
  if (env("OPENROUTER_API_KEY")) return "openrouter";
  return "lovable";
}

/**
 * What every AI function tells the writer when the AI provider turns a request
 * down for lack of credit (HTTP 402). On OpenRouter (self-hosted installs)
 * that's the owner's OpenRouter balance, which is needed even with their own
 * provider key added there: OpenRouter's free plan can't use your own keys.
 * On the hosted app it's StoryMode's own gateway balance, nothing the writer
 * can fix (running out of their StoryMode credits is caught earlier, by the
 * AI gate), so it reads as an outage.
 */
export function outOfCreditMessage(): string {
  return aiProvider() === "openrouter"
    ? "Your OpenRouter account is out of credit. Buy credit at openrouter.ai/settings/credits: it's needed even if you've added your own OpenAI, Anthropic or Google key there."
    : "StoryMode's AI is temporarily unavailable. Please try again later.";
}

const PROVIDERS: Record<AiProvider, { base: string; keyName: string; headers?: () => Record<string, string> }> = {
  lovable: { base: "https://ai.gateway.lovable.dev/v1", keyName: "LOVABLE_API_KEY" },
  openrouter: {
    base: "https://openrouter.ai/api/v1",
    keyName: "OPENROUTER_API_KEY",
    // Optional attribution OpenRouter shows in its dashboard.
    headers: () => {
      const site = env("SITE_URL");
      return { "X-Title": "StoryMode", ...(site ? { "HTTP-Referer": site } : {}) };
    },
  },
};

/** Endpoint base and auth headers for the configured provider. */
function providerAccess(provider: AiProvider) {
  const { base, keyName, headers } = PROVIDERS[provider];
  const key = env(keyName);
  if (!key) throw new Error(`${keyName} is not configured`);
  return { base, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers?.() } };
}

/**
 * Adapts an OpenAI-style chat completions body to OpenRouter: `max_tokens`
 * instead of `max_completion_tokens`, `reasoning: { effort }` instead of
 * `reasoning_effort` (dropped for "none", which it doesn't take), and usage
 * reported in the stream so the answer can be metered. OpenAI models given no
 * effort think lightly: background jobs that pick one (a Fast family of
 * OpenAI) set none, and full reasoning can spend the whole output budget.
 */
function forOpenRouter(body: Record<string, unknown>): Record<string, unknown> {
  const { max_completion_tokens, reasoning_effort, stream_options: _streamOptions, ...rest } = body;
  const effort = typeof reasoning_effort === "string"
    ? reasoning_effort
    : typeof rest.model === "string" && rest.model.startsWith("openai/") ? "low" : undefined;
  return {
    ...rest,
    ...(max_completion_tokens !== undefined && rest.max_tokens === undefined ? { max_tokens: max_completion_tokens } : {}),
    ...(effort && effort !== "none" ? { reasoning: { effort } } : {}),
    usage: { include: true },
  };
}

function mapChatModelToOpenAi(preferred: string): string {
  if (preferred.startsWith("openai/")) return preferred.slice("openai/".length);
  const p = preferred.toLowerCase();
  // BYOK: bias toward the strongest OpenAI model. The user is paying per-token
  // themselves, so quality > cost here — the previous mapping quietly demoted
  // most calls to gpt-5-mini/nano and made BYOK feel dumber than Lovable AI.
  if (p.includes("pro")) return "gpt-5";
  if (p.includes("flash-lite") || p.includes("nano")) return "gpt-5-mini";
  // Everything else (flash-class general chat) → top tier.
  return "gpt-5";
}

export interface ChatRoute {
  url: string;
  headers: Record<string, string>;
  model: string;
  isOpenAi: boolean;
  /** Who serves the request (BYOK counts as OpenAI). */
  provider: AiProvider | "openai";
  // Extra fields to merge into the request body. On BYOK OpenAI we request
  // the priority serving tier so latency isn't stuck on standard-tier queues.
  extraBody: Record<string, unknown>;
  /** The finished request body in the provider's dialect (unchanged for OpenAI and Lovable). */
  prepare(body: Record<string, unknown>): Record<string, unknown>;
}

export function chatRoute(byokKey: string | null | undefined, preferredModel: string): ChatRoute {
  if (byokKey) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${byokKey}`, "Content-Type": "application/json" },
      model: mapChatModelToOpenAi(preferredModel),
      isOpenAi: true,
      provider: "openai",
      extraBody: { service_tier: "priority" },
      prepare: (body) => body,
    };
  }
  const provider = aiProvider();
  const { base, headers } = providerAccess(provider);
  return {
    url: `${base}/chat/completions`,
    headers,
    model: preferredModel,
    isOpenAi: false,
    provider,
    extraBody: {},
    prepare: provider === "openrouter" ? forOpenRouter : (body) => body,
  };
}

export interface ImageRoute {
  url: string;
  headers: Record<string, string>;
  isOpenAi: boolean;
  /** The image model, recorded with the charge. */
  model: string;
  // Build the request body for a given prompt/size.
  buildBody(prompt: string, size: { w: number; h: number }): Record<string, unknown>;
  /** The generated image as base64 PNG, from this provider's response. */
  readImage(json: unknown): string | null;
}

export interface TypedDecisionRoute {
  url: string;
  headers: Record<string, string>;
  model: string;
}

/**
 * Lovable's managed System One endpoint for typed decisions such as Jev. Only
 * Lovable has it; elsewhere this returns null and the feature says so.
 */
export function typedDecisionRoute(model = "typesafe/jev-latest"): TypedDecisionRoute | null {
  if (aiProvider() !== "lovable") return null;
  const { base, headers } = providerAccess("lovable");
  return { url: `${base}/systemone`, headers, model };
}

function nearestOpenAiImageSize(w: number, h: number): "1024x1024" | "1536x1024" | "1024x1536" {
  const ratio = w / h;
  // Bias hard toward the largest available canvas. Stickers benefit from every
  // pixel we can get out of gpt-image-1, so anything close to square goes to
  // 1024x1024 and only clearly landscape/portrait requests use the 1536 edge.
  if (ratio >= 1.5) return "1536x1024";
  if (ratio <= 1 / 1.5) return "1024x1536";
  return "1024x1024";
}

/** The Gemini image aspect ratio closest to the selection's. */
function nearestGeminiAspect(w: number, h: number): string {
  const ratios: [string, number][] = [
    ["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3],
    ["4:5", 4 / 5], ["5:4", 5 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9],
  ];
  const target = Math.log(w / h);
  return ratios.reduce((best, r) => (Math.abs(Math.log(r[1]) - target) < Math.abs(Math.log(best[1]) - target) ? r : best))[0];
}

/** OpenAI images API shape, which the Lovable gateway also answers in. */
const readImagesApi = (json: unknown): string | null => {
  const b64 = (json as { data?: { b64_json?: unknown }[] } | null)?.data?.[0]?.b64_json;
  return typeof b64 === "string" && b64 ? b64 : null;
};

/** OpenRouter answers image models through chat: the picture is a data URL on the message. */
const readChatImage = (json: unknown): string | null => {
  const message = (json as { choices?: { message?: { images?: { image_url?: { url?: unknown } }[] } }[] } | null)
    ?.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url;
  if (typeof url !== "string") return null;
  const comma = url.indexOf(",");
  return url.startsWith("data:") && comma > 0 ? url.slice(comma + 1) : null;
};

const GEMINI_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

/**
 * The route for generating an image. On OpenRouter `model` picks the image
 * model (see model-choice.ts); elsewhere the provider's own default is used.
 */
export function imageRoute(byokKey: string | null | undefined, model?: string | null): ImageRoute {
  if (byokKey) {
    return {
      url: "https://api.openai.com/v1/images/generations",
      headers: { Authorization: `Bearer ${byokKey}`, "Content-Type": "application/json" },
      isOpenAi: true,
      model: "gpt-image-1",
      buildBody: (prompt, size) => ({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: nearestOpenAiImageSize(size.w, size.h),
        // Push quality to the top — the default "auto" often lands on "low"
        // for gpt-image-1 and looked noticeably worse than Nano Banana.
        quality: "high",
      }),
      readImage: readImagesApi,
    };
  }
  const provider = aiProvider();
  const { base, headers } = providerAccess(provider);
  if (provider === "openrouter") {
    const imageModel = model || GEMINI_IMAGE_MODEL;
    return {
      url: `${base}/chat/completions`,
      headers,
      isOpenAi: false,
      model: imageModel,
      buildBody: (prompt, size) => ({
        model: imageModel,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
        // Gemini takes an aspect ratio; other image models compose to the prompt.
        ...(imageModel.startsWith("google/") ? { image_config: { aspect_ratio: nearestGeminiAspect(size.w, size.h) } } : {}),
      }),
      readImage: readChatImage,
    };
  }
  return {
    url: `${base}/images/generations`,
    headers,
    isOpenAi: false,
    model: GEMINI_IMAGE_MODEL,
    buildBody: (prompt) => ({
      model: GEMINI_IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
    readImage: readImagesApi,
  };
}
