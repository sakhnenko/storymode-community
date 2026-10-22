// Sticker cleanup after the image model paints a subject on magenta: key the
// backdrop to transparency, clear the fringe, repair interior holes and soften
// the cut-out edge. Works directly on the RGBA bytes with typed arrays and no
// per-pixel allocations, because the edge function has a small CPU budget and
// a 1408x768 picture is over a million pixels. Dependency-free so it can be
// unit tested (src/test/ai-map-draw-sticker.test.ts).
import { clusterBorderColors, findEnclosedTransparentPixels, findUniformBorderColor, selectBackdropKeys } from "./bg-key.ts";
import { featherEdge, findEdgeFringe } from "./halo.ts";

type Bytes = Uint8Array | Uint8ClampedArray;

const clampByte = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

function clearPixel(rgba: Bytes, i: number) {
  const o = i * 4;
  rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 0;
}

/** Remove pure magenta and un-matte anti-aliased magenta edge pixels. */
export function keyMagenta(rgba: Bytes, width: number, height: number) {
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    if (r > 190 && b > 190 && g < 145 && Math.abs(r - b) < 75) {
      clearPixel(rgba, i);
      continue;
    }
    const magentaDominance = Math.min(r, b) - g;
    if (Math.abs(r - b) < 90 && magentaDominance > 18) {
      const matte = Math.max(0, Math.min(0.96, magentaDominance / 210));
      const alpha = 1 - matte;
      if (alpha <= 0.08) {
        clearPixel(rgba, i);
      } else {
        rgba[o] = clampByte((r - 255 * matte) / alpha);
        rgba[o + 1] = clampByte(g / alpha);
        rgba[o + 2] = clampByte((b - 255 * matte) / alpha);
        rgba[o + 3] = clampByte(alpha * 255);
      }
    }
  }
}

/**
 * Fallback keyer: the model sometimes ignores magenta and paints a grey/white
 * checkerboard, another flat neutral backdrop, or a flat muted colour (dusty
 * pink, beige paper). Key the neutral colours occupying the border, or else a
 * single flat colour running evenly around all four sides, flooding in from
 * the edges. Textured painted terrain at the edge survives.
 * Returns true when it keyed anything.
 */
export function keyFlatBackdrop(rgba: Bytes, width: number, height: number): boolean {
  const sideIdx: number[][] = [[], [], [], []];
  for (let x = 0; x < width; x++) { sideIdx[0].push(x); sideIdx[1].push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { sideIdx[2].push(y * width); sideIdx[3].push(y * width + width - 1); }
  const borderIdx = sideIdx.flat();

  let clear = 0;
  const sides: { r: number; g: number; b: number }[][] = [[], [], [], []];
  sideIdx.forEach((idx, s) => {
    for (const i of idx) {
      const o = i * 4;
      if (rgba[o + 3] === 0) clear++;
      else sides[s].push({ r: rgba[o], g: rgba[o + 1], b: rgba[o + 2] });
    }
  });
  if (borderIdx.length === 0 || clear / borderIdx.length >= 0.4) return false;
  const opaque = sides.flat();

  let keys: { r: number; g: number; b: number }[] = selectBackdropKeys(clusterBorderColors(opaque), opaque.length);
  // Neutral backdrops can be gradients, so they get a wide tolerance; a flat
  // coloured frame is matched tightly so similar subject paint survives.
  let TOL = 42;
  if (!keys.length) {
    const flat = findUniformBorderColor(sides);
    if (!flat) return false;
    keys = [flat];
    TOL = 30;
  }
  const kr = Int16Array.from(keys, (k) => Math.round(k.r));
  const kg = Int16Array.from(keys, (k) => Math.round(k.g));
  const kb = Int16Array.from(keys, (k) => Math.round(k.b));
  const isBg = (i: number) => {
    const o = i * 4;
    if (rgba[o + 3] < 240) return true;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    for (let k = 0; k < kr.length; k++) {
      if (Math.abs(kr[k] - r) < TOL && Math.abs(kg[k] - g) < TOL && Math.abs(kb[k] - b) < TOL) return true;
    }
    return false;
  };

  const n = width * height;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const visit = (i: number) => {
    if (visited[i] || !isBg(i)) return;
    visited[i] = 1;
    clearPixel(rgba, i);
    queue[tail++] = i;
  };
  for (const i of borderIdx) visit(i);
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < n) visit(i + width);
  }
  return tail > 0;
}

/**
 * A sticker is one opaque composition: fill accidental interior transparency
 * (courtyards, pools) from its nearest opaque neighbours. Only holes that are
 * cut off from the outside count: any gap that opens onto the background, even
 * a winding or diagonal one like the notches between solar panels around a
 * dome, stays transparent. (A row-and-column "is it bracketed by paint" test
 * used to fill those notches with pale paint.)
 */
export function fillInteriorHoles(rgba: Bytes, width: number, height: number) {
  const n = width * height;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = rgba[i * 4 + 3];
  let pending = Int32Array.from(findEnclosedTransparentPixels(alpha, width, height, 239));
  while (pending.length) {
    const next: number[] = [];
    for (let p = 0; p < pending.length; p++) {
      const i = pending[p];
      const x = i % width;
      let count = 0, sr = 0, sg = 0, sb = 0;
      const take = (j: number) => {
        const o = j * 4;
        if (rgba[o + 3] >= 240) { count++; sr += rgba[o]; sg += rgba[o + 1]; sb += rgba[o + 2]; }
      };
      if (x > 0) take(i - 1);
      if (x + 1 < width) take(i + 1);
      if (i >= width) take(i - width);
      if (i + width < n) take(i + width);
      if (!count) { next.push(i); continue; }
      const o = i * 4;
      rgba[o] = Math.round(sr / count);
      rgba[o + 1] = Math.round(sg / count);
      rgba[o + 2] = Math.round(sb / count);
      rgba[o + 3] = 255;
    }
    if (next.length === pending.length) break;
    pending = Int32Array.from(next);
  }
}

/** The full sticker cleanup, in place. Each step is isolated so one failure keeps the rest. */
export function cleanSticker(rgba: Bytes, width: number, height: number) {
  keyMagenta(rgba, width, height);
  // Key a non-magenta backdrop first, so the fringe cleanup below also clears
  // whatever outline or glow the model painted against that backdrop.
  try {
    keyFlatBackdrop(rgba, width, height);
  } catch (e) {
    console.error("[ai-map-draw] fallback background key failed:", e);
  }
  try {
    const fringe = findEdgeFringe(rgba, width, height);
    for (let i = 0; i < fringe.length; i++) if (fringe[i]) clearPixel(rgba, i);
  } catch (e) {
    console.error("[ai-map-draw] halo flood-fill failed:", e);
  }
  try {
    fillInteriorHoles(rgba, width, height);
  } catch (e) {
    console.error("[ai-map-draw] enclosed transparency repair failed:", e);
  }
  try {
    featherEdge(rgba, width, height);
  } catch (e) {
    console.error("[ai-map-draw] edge feathering failed:", e);
  }
}

/** base64 -> bytes without a per-character callback. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** bytes -> base64, in chunks instead of one character at a time. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(""));
}
