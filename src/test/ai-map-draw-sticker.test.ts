import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, cleanSticker } from "../../supabase/functions/ai-map-draw/sticker";

/**
 * AI Draw sticker cleanup runs inside the edge function's small CPU budget, so
 * it works on raw RGBA bytes. These pin what it must still do: key the magenta
 * backdrop, keep the painted subject, and fill an enclosed magenta courtyard.
 */
const W = 120, H = 120;
const MAGENTA = [255, 0, 255, 255];
const GRASS = [110, 160, 90, 255];

function picture() {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inSubject = x >= 20 && x < 100 && y >= 20 && y < 100;
      const inCourtyard = x >= 50 && x < 70 && y >= 50 && y < 70;
      rgba.set(inSubject && !inCourtyard ? GRASS : MAGENTA, (y * W + x) * 4);
    }
  }
  return rgba;
}
const alphaAt = (rgba: Uint8ClampedArray, x: number, y: number) => rgba[(y * W + x) * 4 + 3];

describe("AI Draw sticker cleanup", () => {
  const rgba = picture();
  cleanSticker(rgba, W, H);

  it("makes the magenta backdrop transparent", () => {
    expect(alphaAt(rgba, 2, 2)).toBe(0);
    expect(alphaAt(rgba, 110, 60)).toBe(0);
  });

  it("keeps the painted subject opaque", () => {
    expect(alphaAt(rgba, 30, 60)).toBe(255);
    expect(Array.from(rgba.slice((60 * W + 30) * 4, (60 * W + 30) * 4 + 3))).toEqual([110, 160, 90]);
  });

  it("fills an enclosed magenta courtyard instead of leaving a hole", () => {
    expect(alphaAt(rgba, 60, 60)).toBe(255);
  });

  it("round-trips base64 without losing bytes", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 37) % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("removes a flat dusty-pink backdrop and the white outline painted against it", () => {
    const PINK = [195, 151, 137, 255];
    const WHITE = [250, 250, 248, 255];
    const img = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const inSubject = x >= 30 && x < 90 && y >= 30 && y < 90;
      const inOutline = x >= 26 && x < 94 && y >= 26 && y < 94;
      img.set(inSubject ? GRASS : inOutline ? WHITE : PINK, (y * W + x) * 4);
    }
    cleanSticker(img, W, H);
    expect(alphaAt(img, 2, 2)).toBe(0);
    expect(alphaAt(img, 110, 60)).toBe(0);
    expect(alphaAt(img, 27, 60)).toBe(0);
    expect(alphaAt(img, 60, 60)).toBe(255);
  });

  it("keeps the gaps between panels around a dome see-through", () => {
    // A round dome with 12 radial panels around it; the wedges between the
    // panels open onto the background and must stay transparent.
    const S = 200, C = 100;
    const img = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - C, dy = y - C, r = Math.hypot(dx, dy);
      const ang = ((Math.atan2(dy, dx) / (2 * Math.PI)) * 12 + 12) % 1;
      const dome = r < 45;
      const panel = r >= 50 && r < 85 && ang < 0.45;
      const spoke = r >= 45 && r < 50 && ang > 0.15 && ang < 0.3;
      img.set(dome || panel || spoke ? GRASS : MAGENTA, (y * S + x) * 4);
    }
    cleanSticker(img, S, S);
    const a = (x: number, y: number) => img[(y * S + x) * 4 + 3];
    // Middle of the wedge between two panels, at 70px out.
    const gapAngle = (0.75 / 12) * 2 * Math.PI;
    expect(a(Math.round(C + 70 * Math.cos(gapAngle)), Math.round(C + 70 * Math.sin(gapAngle)))).toBe(0);
    expect(a(C, C)).toBe(255);
  });
});
