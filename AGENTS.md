# Agent rules

- AI Draw sticker cleanup lives in `supabase/functions/ai-map-draw/sticker.ts` and works on raw RGBA bytes with typed arrays, no per-pixel `getPixelAt`/`setPixelAt` or allocations — edge functions have a ~2s CPU budget and a megapixel image blew it ("CPU Time exceeded").
- AI Draw sticker edges (none/white/black) are drawn by the map at display time from the sticker's saved `edge` field, never painted into the image — so already-placed stickers can change look without redrawing.
