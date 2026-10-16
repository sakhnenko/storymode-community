import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enforceAiGate, chargeUsage, releaseAiReservation } from "../_shared/ai-gate.ts";
import { usageFromResponse, estimateTokens } from "../_shared/ai-cost.ts";
import { chatRouteFor } from "../_shared/model-choice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let reservedUserId: string | undefined;
  let reservationId: string | undefined;
  try {
    const gate = await enforceAiGate(req, "ocr", corsHeaders);
    if (!gate.ok) return gate.response!;
    reservedUserId = gate.userId;
    reservationId = gate.reservationId;
    console.log("Authenticated user:", gate.userId);

    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Starting OCR extraction...");

    // Prefer a vision-capable model. On BYOK OpenAI we use gpt-4o-class via chatRoute mapping.
    const route = await chatRouteFor("utility", gate.byokOpenAiKey, "google/gemini-3-flash-preview");
    const ocrResponse = await fetch(route.url, {
      method: "POST",
      headers: route.headers,
      body: JSON.stringify(route.prepare({
        model: route.model,
        messages: [
          {
            role: "system",
            content: `You are an OCR expert. Extract ALL text from the provided image exactly as it appears, then return it as clean Markdown.

Rules:
- Preserve every word exactly — do not add, remove, paraphrase or summarize.
- Use Markdown for structure: # / ## / ### for visible headings, - or 1. for lists, **bold** / *italic* only where clearly emphasized, > for quotes, fenced blocks for code.
- Fix obvious OCR spacing/linebreak glitches; keep paragraph breaks.
- If parts are unreadable, write [illegible].
- If the image contains no text, respond with exactly: [No text found in image].
- Output ONLY the Markdown — no preamble, no commentary.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this image and return it as clean Markdown."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        ...route.extraBody,
      })),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error("OCR extraction error:", ocrResponse.status, errorText);
      let parsed: any = null;
      try { parsed = JSON.parse(errorText); } catch { /* not JSON */ }
      const gwMessage: string | undefined = parsed?.message || parsed?.error?.message;
      const gwType: string | undefined = parsed?.type || parsed?.error?.type;
      let friendly = "We couldn't read the text from this image. Please try a clearer image.";
      if (ocrResponse.status === 429) {
        friendly = "We're being rate-limited by the AI provider. Please wait a minute and try again.";
      } else if (ocrResponse.status === 402 || gwType === "credit_limit_reached") {
        friendly = "This workspace has run out of AI credits. Ask the workspace owner to top up to keep scanning documents.";
      } else if (ocrResponse.status === 403) {
        friendly = gwMessage
          ? `AI provider refused the request: ${gwMessage}`
          : "The AI provider refused the request (403). Check your workspace credits or API access.";
      } else if (ocrResponse.status >= 500) {
        friendly = "The AI provider is having trouble right now. Please try again in a moment.";
      } else if (gwMessage) {
        friendly = gwMessage;
      }
      return new Response(
        JSON.stringify({ error: friendly, providerStatus: ocrResponse.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ocrData = await ocrResponse.json();
    const formattedText = ocrData.choices?.[0]?.message?.content || "";

    console.log("OCR + formatting complete in single call");

    if (!gate.byokOpenAiKey) {
      const u = usageFromResponse(ocrData) ?? {
        inputTokens: 1500,
        outputTokens: estimateTokens(formattedText),
      };
      const chargeId = await chargeUsage(gate.userId!, gate.reservationId!, "ocr", { model: route.model, ...u });
      if (chargeId) reservationId = undefined;
    }
    return new Response(
      JSON.stringify({ text: formattedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("OCR error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: `Scan failed unexpectedly: ${msg}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    if (reservedUserId && reservationId) {
      await releaseAiReservation(reservedUserId, reservationId, "ocr_request_not_completed");
    }
  }
});
