import { describe, expect, it } from "vitest";
import { featherEdge, findEdgeFringe } from "../../supabase/functions/ai-map-draw/halo";

/**
 * AI Draw stickers: the fringe cleanup after the magenta key must clear the
 * thin fog the model paints around a subject, but never eat into subject
 * colours that happen to look like fog (grey roads, gravel yards) just because
 * they run to the sticker's edge.
 */

const W = 200, H = 200;
type RGBA = [number, number, number, number];

function sticker(paint: (x: number, y: number) => RGBA | null) {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = paint(x, y) ?? [0, 0, 0, 0];
      rgba.set(px, (y * W + x) * 4);
    }
  }
  return rgba;
}

const GRASS: RGBA = [110, 160, 90, 255];
const ROAD: RGBA = [128, 128, 128, 255];
const HAZE: RGBA = [225, 225, 222, 255];

// A grass estate from 30 to 170, a pale 3px fog ring around it, a grey road
// from the left edge of the canvas into the middle, and a grey yard on the road.
const estate = sticker((x, y) => {
  const onRoad = y >= 95 && y < 105 && x < 120;
  const inYard = x >= 110 && x < 140 && y >= 80 && y < 120;
  if (onRoad || inYard) return ROAD;
  if (x >= 30 && x < 170 && y >= 30 && y < 170) return GRASS;
  if (x >= 27 && x < 173 && y >= 27 && y < 173) return HAZE;
  return null;
});

const cleared = (mask: Uint8Array, x: number, y: number) => mask[y * W + x] === 1;

describe("AI Draw sticker fringe cleanup", () => {
  const mask = findEdgeFringe(estate, W, H);

  it("clears the pale fog ring around the subject", () => {
    expect(cleared(mask, 28, 60)).toBe(true);
    expect(cleared(mask, 100, 171)).toBe(true);
  });

  it("keeps the subject itself", () => {
    expect(cleared(mask, 60, 60)).toBe(false);
  });

  it("keeps a grey road that runs to the edge, and the yard it leads to", () => {
    // Along its middle the whole road survives, even where it crosses open background.
    const roadCleared = Array.from({ length: 120 }, (_, x) => cleared(mask, x, 100)).filter(Boolean).length;
    expect(roadCleared).toBe(0);
    expect(cleared(mask, 125, 100)).toBe(false);
    // At most a few pixels of its sides next to the background go, like anti-aliasing.
    const sideCleared = Array.from({ length: 10 }, (_, i) => cleared(mask, 10, 95 + i)).filter(Boolean).length;
    expect(sideCleared).toBeLessThanOrEqual(6);
  });

  it("clears a white sticker outline the model drew anyway", () => {
    const WHITE: RGBA = [250, 250, 248, 255];
    const outlined = sticker((x, y) => {
      if (x >= 40 && x < 160 && y >= 40 && y < 160) return GRASS;
      if (x >= 35 && x < 165 && y >= 35 && y < 165) return WHITE;
      return null;
    });
    const outlineMask = findEdgeFringe(outlined, W, H);
    for (const x of [35, 37, 39]) expect(cleared(outlineMask, x, 100)).toBe(true);
    expect(cleared(outlineMask, 41, 100)).toBe(false);
  });
});

describe("AI Draw sticker edge feathering", () => {
  const square = () => sticker((x, y) => (x >= 50 && x < 150 && y >= 50 && y < 150 ? GRASS : null));
  const alpha = (rgba: Uint8Array, x: number, y: number) => rgba[(y * W + x) * 4 + 3];

  it("softens the silhouette's edge", () => {
    const rgba = square();
    featherEdge(rgba, W, H);
    expect(alpha(rgba, 50, 50)).toBeLessThan(alpha(rgba, 50, 100));
    expect(alpha(rgba, 50, 100)).toBeLessThan(255);
    expect(alpha(rgba, 50, 100)).toBeGreaterThan(0);
  });

  it("never grows the sticker or touches its inside", () => {
    const rgba = square();
    featherEdge(rgba, W, H);
    expect(alpha(rgba, 49, 100)).toBe(0);
    expect(alpha(rgba, 100, 100)).toBe(255);
    expect(alpha(rgba, 53, 100)).toBe(255);
  });
});
