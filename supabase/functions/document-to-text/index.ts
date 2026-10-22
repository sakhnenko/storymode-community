import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import mammoth from "npm:mammoth@1.8.0";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { plainTextFromHtml } from "../_shared/ai-json.ts";

// Reads an uploaded Word (.docx) or PDF file and returns its text. Word files
// also come back as simple HTML so italics, bold and headings survive import.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

/** Cuts HTML at the last paragraph boundary before `max` characters. */
function truncateHtml(html: string, max: number) {
  if (html.length <= max) return html;
  const cut = html.lastIndexOf("</p>", max);
  return cut > 0 ? html.slice(0, cut + 4) : html.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: userData } = await auth.auth.getUser(authHeader.slice("Bearer ".length));
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return json({ error: "No file uploaded." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "That file is too large. The limit is 8 MB." }, 413);

    const name = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (name.endsWith(".docx")) {
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      const html = truncateHtml(value.replace(/<img\b[^>]*>/gi, ""), MAX_TEXT_CHARS * 2);
      const text = plainTextFromHtml(html).slice(0, MAX_TEXT_CHARS);
      return json({ text, html, truncated: value.length > html.length });
    }

    if (name.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const full = String(text ?? "").trim();
      return json({ text: full.slice(0, MAX_TEXT_CHARS), truncated: full.length > MAX_TEXT_CHARS });
    }

    return json({ error: "Only Word (.docx) and PDF files can be read here." }, 415);
  } catch (err) {
    console.error("document-to-text failed", err instanceof Error ? err.message : "unknown error");
    return json({ error: "We couldn't read that file. Try pasting the text instead." }, 422);
  }
});
