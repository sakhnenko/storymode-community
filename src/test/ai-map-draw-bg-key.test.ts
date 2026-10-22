import { describe, expect, it } from "vitest";
import {
  clusterBorderColors,
  findEnclosedTransparentPixels,
  findStickerInteriorTransparency,
  findUniformBorderColor,
  isKeyableBackdrop,
  selectBackdropKeys,
  type RGB,
} from "../../supabase/functions/ai-map-draw/bg-key";

/**
 * Regression tests for AI Draw sticker transparency.
 * Run these whenever the AI Draw prompts or sticker keying change:
 * a prompt tweak must never make the keyer eat painted terrain.
 */

const border = (colors: RGB[], count = 400): RGB[] =>
  Array.from({ length: count }, (_, i) => colors[i % colors.length]);

describe("sticker background keyer", () => {
  it("keys out a fake grey/white transparency checkerboard", () => {
    const pixels = border([
      { r: 255, g: 255, b: 255 },
      { r: 204, g: 204, b: 204 },
    ]);
    const keys = selectBackdropKeys(clusterBorderColors(pixels), pixels.length);
    expect(keys.length).toBe(2);
  });

  it("keys out leftover magenta chroma background", () => {
    const pixels = border([{ r: 255, g: 0, b: 255 }]);
    const keys = selectBackdropKeys(clusterBorderColors(pixels), pixels.length);
    expect(keys.length).toBe(1);
  });

  it("never erases painted sand / beach terrain", () => {
    const pixels = border([
      { r: 231, g: 205, b: 143 }, // sand
      { r: 219, g: 190, b: 128 },
    ]);
    const keys = selectBackdropKeys(clusterBorderColors(pixels), pixels.length);
    expect(keys).toEqual([]);
    expect(isKeyableBackdrop({ r: 231, g: 205, b: 143 })).toBe(false);
  });

  it("never erases grass, water or sky borders", () => {
    for (const c of [
      { r: 106, g: 158, b: 88 }, // grass
      { r: 74, g: 138, b: 168 }, // water
      { r: 168, g: 200, b: 235 }, // sky
    ]) {
      expect(isKeyableBackdrop(c)).toBe(false);
      const pixels = border([c]);
      expect(selectBackdropKeys(clusterBorderColors(pixels), pixels.length)).toEqual([]);
    }
  });

  it("leaves the sticker alone when the backdrop is mostly artwork", () => {
    // 30% neutral checker, 70% painted sand -> not enough coverage to key.
    const pixels = [
      ...Array.from({ length: 120 }, () => ({ r: 240, g: 240, b: 240 })),
      ...Array.from({ length: 280 }, () => ({ r: 231, g: 205, b: 143 })),
    ];
    const keys = selectBackdropKeys(clusterBorderColors(pixels), pixels.length);
    expect(keys).toEqual([]);
  });

  it("keys out a flat near-black backdrop the model painted instead of magenta", () => {
    const pixels = border([{ r: 12, g: 12, b: 14 }, { r: 20, g: 20, b: 22 }]);
    expect(isKeyableBackdrop({ r: 12, g: 12, b: 14 })).toBe(true);
    expect(selectBackdropKeys(clusterBorderColors(pixels), pixels.length).length).toBeGreaterThan(0);
  });

  it("keys out a mid-grey gradient backdrop at any brightness", () => {
    const shades = [40, 60, 80, 100, 130, 160].map((v) => ({ r: v, g: v, b: v + 2 }));
    for (const shade of shades) expect(isKeyableBackdrop(shade)).toBe(true);
    const pixels = border(shades);
    expect(selectBackdropKeys(clusterBorderColors(pixels), pixels.length).length).toBeGreaterThan(0);
  });

  it("keeps dark but chromatic paint (deep forest, night water)", () => {
    expect(isKeyableBackdrop({ r: 18, g: 52, b: 30 })).toBe(false);
    expect(isKeyableBackdrop({ r: 20, g: 40, b: 78 })).toBe(false);
  });


  it("detects transparency enclosed inside a sticker", () => {
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0,
      0, 255, 255, 255, 0,
      0, 255, 0, 255, 0,
      0, 255, 255, 255, 0,
      0, 0, 0, 0, 0,
    ]);
    expect(findEnclosedTransparentPixels(alpha, 5, 5)).toEqual([12]);
  });

  it("keeps transparency connected to the outer border", () => {
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0,
      0, 255, 0, 255, 0,
      0, 255, 0, 255, 0,
      0, 255, 255, 255, 0,
      0, 0, 0, 0, 0,
    ]);
    expect(findEnclosedTransparentPixels(alpha, 5, 5)).toEqual([]);
  });

  it("leaves a notch that opens onto the background transparent", () => {
    // The gap between two tree crowns: bracketed left/right by paint, but
    // nothing painted above it. Must stay transparent, never be inpainted.
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0, 0, 0,
      0, 255, 255, 0, 255, 255, 0,
      0, 255, 255, 0, 255, 255, 0,
      0, 255, 255, 0, 255, 255, 0,
      0, 255, 255, 255, 255, 255, 0,
      0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(findEnclosedTransparentPixels(alpha, 7, 6)).toEqual([]);
    expect(findStickerInteriorTransparency(alpha, 7, 6)).toEqual([]);
  });

  it("solidifies a hole bracketed by paint on both axes", () => {
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0, 0, 0,
      0, 255, 255, 255, 255, 255, 0,
      0, 255, 255, 0, 255, 255, 0,
      0, 255, 255, 0, 255, 255, 0,
      0, 255, 255, 255, 255, 255, 0,
      0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(findStickerInteriorTransparency(alpha, 7, 6)).toEqual([17, 24]);
  });


  it("never expands alpha beyond the sticker's outer painted envelope", () => {
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0,
      0, 0, 255, 0, 0,
      0, 255, 0, 255, 0,
      0, 0, 255, 0, 0,
      0, 0, 0, 0, 0,
    ]);
    expect(findStickerInteriorTransparency(alpha, 5, 5)).toEqual([12]);
  });

  it("makes semi-transparent pixels inside the sticker fully solid", () => {
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0,
      0, 255, 255, 255, 0,
      0, 255, 128, 255, 0,
      0, 255, 255, 255, 0,
      0, 0, 0, 0, 0,
    ]);
    expect(findStickerInteriorTransparency(alpha, 5, 5)).toEqual([12]);
  });

  it("finds a flat dusty-pink frame the model painted instead of magenta", () => {
    const pink = { r: 195, g: 151, b: 137 };
    const side = () => Array.from({ length: 200 }, (_, i) => ({ r: pink.r + (i % 3) - 1, g: pink.g, b: pink.b + (i % 2) }));
    const found = findUniformBorderColor([side(), side(), side(), side()]);
    expect(found).not.toBeNull();
    expect(Math.abs(found!.r - 195)).toBeLessThanOrEqual(2);
  });

  it("never treats textured painted terrain at the edge as a flat frame", () => {
    // Sand with the texture a painted beach has (+-30 per channel).
    const sand = () => Array.from({ length: 200 }, (_, i) => {
      const n = ((i * 53) % 61) - 30;
      return { r: 231 + n * 0.8, g: 205 + n, b: 143 + n * 0.6 };
    });
    expect(findUniformBorderColor([sand(), sand(), sand(), sand()])).toBeNull();
  });

  it("needs the flat colour on every side, not just most of the border", () => {
    const flat = () => Array.from({ length: 200 }, () => ({ r: 195, g: 151, b: 137 }));
    const grass = Array.from({ length: 200 }, () => ({ r: 106, g: 158, b: 88 }));
    expect(findUniformBorderColor([flat(), flat(), flat(), grass])).toBeNull();
  });

  it("leaves a winding gap that opens onto the background transparent", () => {
    // Every pixel of the gap at the top-left is bracketed by paint on both
    // axes, like the notches between solar panels around a dome, but the gap
    // winds round to the open right side, so it is outside, not a hole.
    const alpha = new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 255, 255, 255, 255, 255, 255, 0,
      0, 255, 0, 0, 0, 0, 255, 0,
      0, 255, 0, 255, 255, 0, 255, 0,
      0, 255, 0, 255, 255, 255, 255, 0,
      0, 255, 0, 0, 0, 0, 0, 0,
      0, 255, 255, 255, 255, 255, 255, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(findStickerInteriorTransparency(alpha, 8, 8).length).toBeGreaterThan(0);
    expect(findEnclosedTransparentPixels(alpha, 8, 8, 239)).toEqual([]);
  });
});
