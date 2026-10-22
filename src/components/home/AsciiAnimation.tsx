import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const FALLBACK_GIFS = ["/gifs/gif1.gif"];

const RAMP = " .:-=+*#%@";
const COLS = 100;
const FONT_PX = 10;
const WHITE_KEY = 245;
const CYCLE_INTERVAL = 5000;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

interface Bounds { x: number; y: number; w: number; h: number }

function findBounds(imgData: ImageData, w: number, h: number): Bounds {
  const d = imgData.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (!a) continue;
      if (r >= WHITE_KEY && g >= WHITE_KEY && b >= WHITE_KEY) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  const pad = 3;
  return {
    x: clamp(minX - pad, 0, w - 1),
    y: clamp(minY - pad, 0, h - 1),
    w: clamp(maxX + pad, 0, w - 1) - clamp(minX - pad, 0, w - 1) + 1,
    h: clamp(maxY + pad, 0, h - 1) - clamp(minY - pad, 0, h - 1) + 1,
  };
}

function toAscii(imgData: ImageData, W: number, _H: number, bounds: Bounds, targetCols: number): string {
  const d = imgData.data;
  const charAspect = 2.0;
  const rows = Math.max(12, Math.round(((bounds.h / bounds.w) * targetCols) / charAspect));
  const { x: sx, y: sy, w: sw, h: sh } = bounds;
  const lines: string[] = new Array(rows);

  for (let r = 0; r < rows; r++) {
    const y0 = sy + Math.floor((r * sh) / rows);
    let y1 = sy + Math.floor(((r + 1) * sh) / rows);
    if (y1 <= y0) y1 = y0 + 1;
    let line = "";
    for (let c = 0; c < targetCols; c++) {
      const x0 = sx + Math.floor((c * sw) / targetCols);
      let x1 = sx + Math.floor(((c + 1) * sw) / targetCols);
      if (x1 <= x0) x1 = x0 + 1;
      let sum = 0, cnt = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2], a0 = d[i + 3];
          if (!a0) continue;
          if (r0 >= WHITE_KEY && g0 >= WHITE_KEY && b0 >= WHITE_KEY) continue;
          sum += 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
          cnt++;
        }
      }
      if (!cnt) line += " ";
      else {
        const idx = Math.round(((255 - sum / cnt) / 255) * (RAMP.length - 1));
        line += RAMP[idx];
      }
    }
    lines[r] = line.replace(/\s+$/g, "");
  }
  return lines.join("\n");
}

interface DecodedFrame { imgData: ImageData; w: number; h: number; durMs: number }
type DecodedGif = { frames: DecodedFrame[]; bounds: Bounds };

async function decodeGifFrames(src: string): Promise<DecodedGif> {
  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  if (!("ImageDecoder" in window)) throw new Error("ImageDecoder not supported");
  const decoder = new (window as any).ImageDecoder({ data: buf, type: "image/gif" });
  await decoder.tracks.ready;
  const frameCount = decoder.tracks.selectedTrack.frameCount;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const frames: DecodedFrame[] = [];
  let gbMinX = 99999, gbMinY = 99999, gbMaxX = -1, gbMaxY = -1;

  for (let i = 0; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    canvas.width = image.displayWidth;
    canvas.height = image.displayHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const durMs = Math.max(20, Math.round((image.duration ?? 150_000) / 1000));
    const fb = findBounds(imgData, canvas.width, canvas.height);
    if (fb.x < gbMinX) gbMinX = fb.x;
    if (fb.y < gbMinY) gbMinY = fb.y;
    if (fb.x + fb.w - 1 > gbMaxX) gbMaxX = fb.x + fb.w - 1;
    if (fb.y + fb.h - 1 > gbMaxY) gbMaxY = fb.y + fb.h - 1;
    frames.push({ imgData, w: canvas.width, h: canvas.height, durMs });
    image.close();
  }

  const globalBounds: Bounds = gbMaxX < 0
    ? { x: 0, y: 0, w: canvas.width, h: canvas.height }
    : { x: gbMinX, y: gbMinY, w: gbMaxX - gbMinX + 1, h: gbMaxY - gbMinY + 1 };

  return { frames, bounds: globalBounds };
}

const gifCache = new Map<string, DecodedGif>();

async function fetchGifUrls(): Promise<string[]> {
  try {
    const { data, error } = await supabase.storage
      .from('homepage-gifs')
      .list('', { sortBy: { column: 'name', order: 'asc' } });
    if (error || !data || data.length === 0) return FALLBACK_GIFS;
    const urls = data
      .filter(f => f.name.toLowerCase().endsWith('.gif'))
      .map(f => supabase.storage.from('homepage-gifs').getPublicUrl(f.name).data.publicUrl);
    return urls.length > 0 ? urls : FALLBACK_GIFS;
  } catch {
    return FALLBACK_GIFS;
  }
}

export function AsciiAnimation({ className = "" }: { className?: string }) {
  const preRef = useRef<HTMLPreElement>(null);
  const gifIndexRef = useRef(0);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'playing'>('loading');

  useEffect(() => {
    // Local stop flag per effect-run. Using a shared ref breaks under
    // StrictMode/remounts because a later mount would reset the flag to
    // false and unblock the previous tick loop, leaving toAscii running
    // forever on every other page.
    let stopped = false;
    let timeoutId: number | null = null;

    const playGif = (sources: string[], gifIdx: number) => {
      if (stopped) return;
      const src = sources[gifIdx];
      const gif = gifCache.get(src);
      if (!gif) {
        // Skip to next if this one failed
        gifIndexRef.current = (gifIndexRef.current + 1) % sources.length;
        timeoutId = window.setTimeout(() => playGif(sources, gifIndexRef.current), 100);
        return;
      }
      const { frames, bounds } = gif;
      let idx = 0;
      const startTime = Date.now();

      const tick = () => {
        if (stopped) return;
        if (Date.now() - startTime > CYCLE_INTERVAL) {
          gifIndexRef.current = (gifIndexRef.current + 1) % sources.length;
          playGif(sources, gifIndexRef.current);
          return;
        }
        const f = frames[idx];
        const ascii = toAscii(f.imgData, f.w, f.h, bounds, COLS);
        if (preRef.current) preRef.current.textContent = ascii;
        idx = (idx + 1) % frames.length;
        timeoutId = window.setTimeout(tick, f.durMs);
      };
      tick();
    };

    const run = async () => {
      // 1. Fetch the list of GIF URLs
      const sources = await fetchGifUrls();
      if (stopped) return;

      // 2. Decode ONLY the first GIF
      const firstSrc = sources[0];
      try {
        if (!gifCache.has(firstSrc)) {
          gifCache.set(firstSrc, await decodeGifFrames(firstSrc));
        }
      } catch { /* skip */ }

      if (stopped) return;

      // 3. Start playing the first GIF immediately
      setStatus('playing');
      playGif(sources, 0);

      // 4. Background-load the remaining GIFs (don't block playback)
      for (let i = 1; i < sources.length; i++) {
        if (stopped) return;
        const src = sources[i];
        if (!gifCache.has(src)) {
          try {
            gifCache.set(src, await decodeGifFrames(src));
          } catch { /* skip */ }
        }
      }
    };

    run();
    return () => {
      stopped = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden inline-block ${className}`}
      style={{
        backgroundColor: 'hsl(220, 20%, 10%)',
        border: '1px solid hsl(220, 15%, 18%)',
      }}
    >
      {status === 'loading' && (
        <div
          className="flex items-center justify-center animate-pulse"
          style={{
            width: `${COLS * FONT_PX * 0.6}px`,
            aspectRatio: '1',
            border: '1px solid hsl(220, 15%, 18%)',
            borderRadius: '8px',
            backgroundColor: 'hsl(220, 20%, 10%)',
          }}
        >
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: 'hsl(220, 15%, 35%)', fontFamily: "'Boulder Mono', monospace", fontWeight: 300 }}
          >
            loading…
          </span>
        </div>
      )}
      <pre
        ref={preRef}
        className="select-none whitespace-pre leading-none m-0 p-0 block"
        style={{
          fontSize: `${FONT_PX}px`,
          lineHeight: `${FONT_PX}px`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          color: "#fff",
          textShadow: "0 0 6px rgba(255, 255, 255, 0.12)",
          display: status === 'loading' ? 'none' : 'block',
        }}
      />
    </div>
  );
}
