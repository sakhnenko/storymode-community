// Pure helpers for the sticker background keyer.
// Kept dependency-free so they can be unit tested (see the regression test in
// src/test/ai-map-draw-bg-key.test.ts) without booting the edge function.

export type RGB = { r: number; g: number; b: number };
export type ColorCluster = RGB & { n: number };

/** Group border pixel colors into a handful of representative clusters. */
export function clusterBorderColors(
  pixels: RGB[],
  tolerance = 26,
  maxClusters = 12,
): ColorCluster[] {
  const clusters: ColorCluster[] = [];
  for (const { r, g, b } of pixels) {
    const hit = clusters.find((c) =>
      Math.abs(c.r - r) < tolerance &&
      Math.abs(c.g - g) < tolerance &&
      Math.abs(c.b - b) < tolerance
    );
    if (hit) {
      hit.r = (hit.r * hit.n + r) / (hit.n + 1);
      hit.g = (hit.g * hit.n + g) / (hit.n + 1);
      hit.b = (hit.b * hit.n + b) / (hit.n + 1);
      hit.n++;
    } else if (clusters.length < maxClusters) {
      clusters.push({ r, g, b, n: 1 });
    }
  }
  return clusters;
}

function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * A backdrop the model painted instead of the magenta key. We only ever key out
 * colors that cannot plausibly be artwork:
 *  - near-neutral greys/whites (the fake "transparency checkerboard"),
 *  - flat near-black backdrops (the model "cut out" the sticker onto black), or
 *  - leftover magenta/pink from the chroma key itself.
 * Anything chromatic (sand, grass, water, sky) is real paint and must survive.
 */
export function isKeyableBackdrop(c: RGB): boolean {
  const sat = saturation(c);
  const maxC = Math.max(c.r, c.g, c.b);
  const spread = maxC - Math.min(c.r, c.g, c.b);
  // Any near-neutral grey is a backdrop, at ANY brightness: white, mid grey,
  // dark grey gradient or black. Real map paint is chromatic; a colorless
  // border is always the model's fake "cut-out" backdrop. selectBackdropKeys
  // still requires the neutral clusters to cover most of the border.
  // Saturation is noisy at low luminance, so dark greys qualify on spread alone.
  const neutral = spread <= 26 && (maxC <= 90 || sat < 0.12);
  const magenta = c.b > 130 && c.r > 130 && c.g < Math.min(c.r, c.b) - 25;
  return neutral || magenta;

}


/**
 * Pick the clusters to key out. Returns [] when the border does not look like a
 * flat artificial backdrop, so a legitimately painted edge (a sandy beach, an
 * ocean, a grass field) is never erased.
 */
export function selectBackdropKeys(
  clusters: ColorCluster[],
  borderPixelCount: number,
  { minClusterShare = 0.01, minTotalCoverage = 0.7 } = {},
): ColorCluster[] {
  if (borderPixelCount <= 0) return [];
  const candidates = clusters.filter(
    (c) => c.n / borderPixelCount > minClusterShare && isKeyableBackdrop(c),
  );
  const coverage = candidates.reduce((sum, c) => sum + c.n, 0) / borderPixelCount;
  if (coverage < minTotalCoverage) return [];
  return candidates;
}

/**
 * The model sometimes paints a muted flat backdrop (dusty pink, beige paper)
 * instead of magenta. Any colour qualifies when the picture's whole edge is one
 * flat, untextured colour on every side: painted terrain has texture and never
 * runs evenly around all four sides of a cut-out, so a flat frame is backdrop.
 * `sides` holds the opaque border pixels of each side. Returns the colour, or null.
 */
export function findUniformBorderColor(
  sides: RGB[][],
  { tolerance = 16, minShare = 0.85, minSideShare = 0.7 } = {},
): RGB | null {
  const all = sides.flat();
  if (all.length < 16 || sides.some((s) => s.length === 0)) return null;
  const median = (key: keyof RGB) => {
    const hist = new Uint32Array(256);
    for (const p of all) hist[Math.max(0, Math.min(255, Math.round(p[key])))]++;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen * 2 >= all.length) return v;
    }
    return 255;
  };
  const c: RGB = { r: median("r"), g: median("g"), b: median("b") };
  const near = (p: RGB) =>
    Math.abs(p.r - c.r) <= tolerance && Math.abs(p.g - c.g) <= tolerance && Math.abs(p.b - c.b) <= tolerance;
  const share = (px: RGB[]) => px.filter(near).length / px.length;
  if (share(all) < minShare) return null;
  if (sides.some((s) => share(s) < minSideShare)) return null;
  return c;
}

/**
 * Return transparent pixels that are fully enclosed by the opaque sticker.
 * Transparency connected to an image edge is the removable outer background;
 * every other transparent pixel is an accidental hole in the sticker.
 */
export function findEnclosedTransparentPixels(
  alpha: Uint8Array,
  width: number,
  height: number,
  transparentThreshold = 8,
): number[] {
  if (width <= 0 || height <= 0 || alpha.length !== width * height) return [];

  const outside = new Uint8Array(alpha.length);
  const queue: number[] = [];
  const seed = (index: number) => {
    if (!outside[index] && alpha[index] <= transparentThreshold) {
      outside[index] = 1;
      queue.push(index);
    }
  };

  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) seed(current - 1);
    if (x + 1 < width) seed(current + 1);
    if (y > 0) seed(current - width);
    if (y + 1 < height) seed(current + width);
  }

  const enclosed: number[] = [];
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] <= transparentThreshold && !outside[i]) enclosed.push(i);
  }
  return enclosed;
}

/**
 * Return every transparent pixel that is genuinely *inside* the sticker: paint
 * brackets it BOTH horizontally and vertically. Requiring both axes is what
 * separates a real interior hole (a courtyard, a pool, a gap between two
 * buildings) from a concave notch that opens onto the outside background —
 * e.g. the sky wedges between tree crowns, which are bracketed left/right by
 * the trees but have nothing painted above them. Filling those notches used to
 * smear a grey gradient over the top of the sticker.
 */
export function findStickerInteriorTransparency(
  alpha: Uint8Array,
  width: number,
  height: number,
  transparentThreshold = 239,
): number[] {
  if (width <= 0 || height <= 0 || alpha.length !== width * height) return [];

  const horizontal = new Uint8Array(alpha.length);
  const vertical = new Uint8Array(alpha.length);

  for (let y = 0; y < height; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > transparentThreshold) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0) {
      for (let x = first + 1; x < last; x++) {
        const index = y * width + x;
        if (alpha[index] <= transparentThreshold) horizontal[index] = 1;
      }
    }
  }

  for (let x = 0; x < width; x++) {
    let first = -1;
    let last = -1;
    for (let y = 0; y < height; y++) {
      if (alpha[y * width + x] > transparentThreshold) {
        if (first < 0) first = y;
        last = y;
      }
    }
    if (first >= 0) {
      for (let y = first + 1; y < last; y++) {
        const index = y * width + x;
        if (alpha[index] <= transparentThreshold) vertical[index] = 1;
      }
    }
  }

  const pixels: number[] = [];
  for (let i = 0; i < alpha.length; i++) {
    if (horizontal[i] && vertical[i]) pixels.push(i);
  }
  return pixels;
}
