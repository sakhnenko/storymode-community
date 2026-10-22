// Pure helper for cleaning the fringe the image model leaves around a sticker
// after the magenta background is keyed out. Dependency-free so it can be unit
// tested (src/test/ai-map-draw-halo.test.ts) without booting the edge function.

/** How a pixel reached from the keyed background might be leftover fringe. */
type Fringe = "background" | "outline" | "glow" | "haze" | "fog" | null;

function classify(r: number, g: number, b: number, a: number): Fringe {
  if (a === 0) return "background";
  // Anti-aliased / semi-transparent remnants of the chroma key.
  if (a < 240) return "background";
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
  // Residual magenta / pink / purple cast: leftover chroma key.
  if (b > 140 && r > 140 && g < Math.min(r, b) - 10) return "background";
  // Warm coral/red glow: red dominates, pastel, not a vivid subject color
  // (brick, fire, flags).
  const warmSpread = r - Math.max(g, b);
  if (warmSpread >= 12 && r > 150 && g > 100 && Math.abs(g - b) < 60 && !(sat > 0.55 && r > 170 && g < 110)) {
    return "glow";
  }
  // A near-pure white die-cut outline the model sometimes draws despite being
  // asked not to.
  if (minC > 232) return "outline";
  // Pale desaturated blur ring (whitish / greyish / cream fog).
  if (maxC > 200 && sat < 0.18) return "haze";
  // Mid-tone grey fog with almost no color. Also exactly the colour of a road,
  // a gravel yard or a stone wall, so it gets the shortest reach of all.
  if (sat < 0.08 && maxC > 120 && maxC < 235) return "fog";
  return null;
}

/**
 * Pixels to clear: fringe connected to the keyed-out background, flooded in
 * from the transparent border. Each kind of fringe only reaches so far in from
 * the background, because the same colours are also real subject colours: a
 * grey road, a gravel yard or a pale path that runs to the sticker's edge must
 * survive. Grey fog is anti-aliasing a few pixels wide, pale haze a little
 * wider; a warm glow and a white sticker outline can be wider still.
 *
 * `rgba` is row-major, 4 bytes per pixel. Returns a mask, 1 = clear.
 */
export function findEdgeFringe(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  const short = Math.min(width, height);
  const reach: Record<Exclude<Fringe, "background" | null>, number> = {
    fog: Math.max(3, Math.round(short * 0.004)),
    haze: Math.max(4, Math.round(short * 0.008)),
    outline: Math.max(6, Math.round(short * 0.018)),
    glow: Math.max(8, Math.round(short * 0.02)),
  };
  const clear = new Uint8Array(width * height);
  // Distance (in pixels) from the nearest keyed-background pixel along the flood.
  const depth = new Uint16Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;

  const kindAt = (i: number) => classify(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]);
  const seed = (x: number, y: number) => {
    const i = y * width + x;
    if (clear[i] || rgba[i * 4 + 3] !== 0) return;
    clear[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 0; y < height; y++) { seed(0, y); seed(width - 1, y); }

  // Breadth-first, so `depth` is the shortest way in from the background.
  // Neighbours are visited inline (no per-pixel arrays): this runs over every
  // background pixel of a megapixel image inside a tight CPU budget.
  const visit = (i: number, n: number) => {
    if (clear[n]) return;
    const kind = kindAt(n);
    if (!kind) return;
    const d = kind === "background" ? 0 : depth[i] + 1;
    if (kind !== "background" && d > reach[kind]) return;
    clear[n] = 1;
    depth[n] = d;
    queue[tail++] = n;
  };
  const total = width * height;
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) visit(i, i - 1);
    if (x + 1 < width) visit(i, i + 1);
    if (i >= width) visit(i, i - width);
    if (i + width < total) visit(i, i + width);
  }
  return clear;
}

/**
 * Softens the sticker's cut-out edge in place. Keying leaves every pixel fully
 * kept or fully cleared, so the silhouette is a hard stair-stepped line; this
 * averages alpha over a 2px band just inside it (two 3x3 passes), like
 * anti-aliasing. Cleared pixels stay cleared, so the sticker never grows, and
 * everything further in is untouched.
 */
export function featherEdge(rgba: { [i: number]: number; length: number }, width: number, height: number, passes = 2) {
  const n = width * height;
  const alphaAt = (a: ArrayLike<number>, x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : a[y * width + x];
  let alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = rgba[i * 4 + 3];

  // The band: kept pixels within `passes` pixels of a cleared one (Chebyshev
  // distance, counting outside the image as cleared). Found with two 1-D
  // distance sweeps instead of scanning a (2*passes+1)^2 window per pixel.
  const rowDist = new Uint16Array(n);
  const BIG = 0xffff;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let d = 0; // the left image edge counts as cleared
    for (let x = 0; x < width; x++) { d = alpha[row + x] ? Math.min(BIG, d + 1) : 0; rowDist[row + x] = d; }
    d = 0;
    for (let x = width - 1; x >= 0; x--) {
      d = alpha[row + x] ? Math.min(BIG, d + 1) : 0;
      if (d < rowDist[row + x]) rowDist[row + x] = d;
    }
  }
  // A pixel is in the band when some row within `passes` above or below has a
  // cleared pixel within `passes` columns, i.e. rowDist <= passes.
  const band: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!alpha[i]) continue;
      if (y < passes || y >= height - passes) { band.push(i); continue; }
      let near = false;
      for (let dy = -passes; dy <= passes; dy++) {
        if (rowDist[i + dy * width] <= passes) { near = true; break; }
      }
      if (near) band.push(i);
    }
  }

  for (let p = 0; p < passes; p++) {
    const next = alpha.slice();
    for (const i of band) {
      const x = i % width, y = (i - x) / width;
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += alphaAt(alpha, x + dx, y + dy);
      // Never fully clear a kept pixel: the edge softens, the shape stays.
      next[i] = Math.max(1, Math.round(sum / 9));
    }
    alpha = next;
  }
  for (const i of band) rgba[i * 4 + 3] = alpha[i];
}
