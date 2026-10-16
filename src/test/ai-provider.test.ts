import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The AI provider switch for edge functions: the Lovable gateway (hosted
 * default) or OpenRouter (self-hosting with one key). Lovable requests must
 * stay exactly as they were.
 */

let env: Record<string, string> = {};
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] } };

async function load(vars: Record<string, string>) {
  env = vars;
  vi.resetModules();
  return import("../../supabase/functions/_shared/ai-provider");
}

afterEach(() => { env = {}; });

const body = {
  model: "openai/gpt-6-astra",
  messages: [{ role: "user", content: "hi" }],
  max_completion_tokens: 12000,
  reasoning_effort: "medium",
  stream: true,
};

describe("choosing the AI provider", () => {
  it("uses the Lovable gateway when its key is set, as before", async () => {
    const { chatRoute, aiProvider } = await load({ LOVABLE_API_KEY: "lov", OPENROUTER_API_KEY: "or" });
    expect(aiProvider()).toBe("lovable");
    const route = chatRoute(null, "google/gemini-2.5-flash");
    expect(route.url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(route.headers.Authorization).toBe("Bearer lov");
    expect(route.prepare(body)).toEqual(body);
  });

  it("uses OpenRouter when it's the only key", async () => {
    const { chatRoute } = await load({ OPENROUTER_API_KEY: "or" });
    const route = chatRoute(null, "google/gemini-2.5-flash");
    expect(route.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(route.headers.Authorization).toBe("Bearer or");
    expect(route.model).toBe("google/gemini-2.5-flash");
    expect(route.provider).toBe("openrouter");
  });

  it("follows AI_PROVIDER over the keys", async () => {
    const { aiProvider } = await load({ AI_PROVIDER: "openrouter", LOVABLE_API_KEY: "lov", OPENROUTER_API_KEY: "or" });
    expect(aiProvider()).toBe("openrouter");
  });

  it("says which key is missing", async () => {
    const { chatRoute } = await load({ AI_PROVIDER: "openrouter" });
    expect(() => chatRoute(null, "google/gemini-2.5-flash")).toThrow("OPENROUTER_API_KEY is not configured");
  });

  it("still sends a personal OpenAI key straight to OpenAI", async () => {
    const { chatRoute } = await load({ OPENROUTER_API_KEY: "or" });
    const route = chatRoute("sk-mine", "google/gemini-2.5-flash");
    expect(route.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(route.prepare(body)).toEqual(body);
  });
});

describe("OpenRouter request bodies", () => {
  it("translates token limits and reasoning, and asks for usage", async () => {
    const { chatRoute } = await load({ OPENROUTER_API_KEY: "or" });
    const prepared = chatRoute(null, "openai/gpt-6-astra").prepare(body);
    expect(prepared).toEqual({
      model: "openai/gpt-6-astra",
      messages: body.messages,
      stream: true,
      max_tokens: 12000,
      reasoning: { effort: "medium" },
      usage: { include: true },
    });
  });

  it("drops a reasoning effort of none", async () => {
    const { chatRoute } = await load({ OPENROUTER_API_KEY: "or" });
    const prepared = chatRoute(null, "openai/gpt-5.6-sol").prepare({ ...body, reasoning_effort: "none" });
    expect(prepared).not.toHaveProperty("reasoning");
    expect(prepared).not.toHaveProperty("reasoning_effort");
  });

  it("gives OpenAI models light reasoning when the caller sets none", async () => {
    const { chatRoute } = await load({ OPENROUTER_API_KEY: "or" });
    expect(chatRoute(null, "openai/gpt-5-mini").prepare({ model: "openai/gpt-5-mini", messages: [] }))
      .toMatchObject({ reasoning: { effort: "low" } });
    expect(chatRoute(null, "anthropic/claude-haiku-5.5").prepare({ model: "anthropic/claude-haiku-5.5", messages: [] }))
      .not.toHaveProperty("reasoning");
  });

  it("keeps tools and JSON mode as they are", async () => {
    const { chatRoute } = await load({ OPENROUTER_API_KEY: "or" });
    const tools = [{ type: "function", function: { name: "plan" } }];
    const prepared = chatRoute(null, "google/gemini-2.5-flash").prepare({ tools, response_format: { type: "json_object" } });
    expect(prepared.tools).toEqual(tools);
    expect(prepared.response_format).toEqual({ type: "json_object" });
  });
});

describe("images", () => {
  it("asks OpenRouter's chat endpoint for an image at the selection's shape", async () => {
    const { imageRoute } = await load({ OPENROUTER_API_KEY: "or" });
    const route = imageRoute(null);
    expect(route.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(route.buildBody("a castle", { w: 1600, h: 900 })).toMatchObject({
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "16:9" },
    });
  });

  it("reads the image from either response shape", async () => {
    const openRouter = (await load({ OPENROUTER_API_KEY: "or" })).imageRoute(null);
    expect(openRouter.readImage({
      choices: [{ message: { images: [{ type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }] } }],
    })).toBe("QUJD");
    expect(openRouter.readImage({ choices: [{ message: { content: "no image, sorry" } }] })).toBeNull();

    const lovable = (await load({ LOVABLE_API_KEY: "lov" })).imageRoute(null);
    expect(lovable.url).toBe("https://ai.gateway.lovable.dev/v1/images/generations");
    expect(lovable.readImage({ data: [{ b64_json: "QUJD" }] })).toBe("QUJD");
  });
});

describe("typed decisions (Lovable's System One)", () => {
  it("are only available on the Lovable gateway", async () => {
    expect((await load({ LOVABLE_API_KEY: "lov" })).typedDecisionRoute()?.url).toBe("https://ai.gateway.lovable.dev/v1/systemone");
    expect((await load({ OPENROUTER_API_KEY: "or" })).typedDecisionRoute()).toBeNull();
  });
});
