import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** How often a growing answer is saved, ms. */
const SAVE_EVERY_MS = 1000;
/** Saved answers are only for picking up after a reload; older ones go. */
const KEEP_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * Reads a copy of the answer stream to the end, whatever happens to the
 * browser, and saves the answer to ai_chat_answers as it grows. Reading to the
 * end is what lets the usage meter settle the charge (and free the one-request
 * lock) even when the writer reloads mid-answer; saving it is what lets them
 * pick the answer back up.
 */
export async function keepAnswer(
  stream: ReadableStream<Uint8Array>,
  ids: { id: string; userId: string; projectId: string },
): Promise<void> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const table = () => admin.from("ai_chat_answers");
  let content = "";
  let credits: number | null = null;
  let saving: Promise<unknown> = Promise.resolve();
  let savedAt = 0;
  const save = (status: "running" | "done" | "failed") => {
    savedAt = Date.now();
    saving = saving.then(() =>
      table().update({ content, credits, status, updated_at: new Date().toISOString() }).eq("id", ids.id)
    ).catch((err) => console.error("keepAnswer save failed", err));
    return saving;
  };

  try {
    await table().delete().eq("user_id", ids.userId).lt("created_at", new Date(Date.now() - KEEP_FOR_MS).toISOString());
    const { error } = await table().upsert({ id: ids.id, user_id: ids.userId, project_id: ids.projectId });
    if (error) console.error("keepAnswer insert failed", error);
  } catch (err) {
    console.error("keepAnswer setup failed", err);
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") content += delta;
          if (typeof json?.storymode?.credits === "number") credits = json.storymode.credits;
        } catch { /* not every event is JSON we care about */ }
      }
      if (Date.now() - savedAt >= SAVE_EVERY_MS) void save("running");
    }
    await save("done");
  } catch (err) {
    console.error("keepAnswer stream failed", err);
    await save("failed");
  }
}
