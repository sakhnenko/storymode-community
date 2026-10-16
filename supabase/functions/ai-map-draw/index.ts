import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode, Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { enforceAiGate, chargeUsage, releaseAiReservation } from "../_shared/ai-gate.ts";
import { imageRoute } from "../_shared/ai-provider.ts";
import { pickImageModel } from "../_shared/model-choice.ts";
import { clusterBorderColors, findStickerInteriorTransparency, selectBackdropKeys } from "./bg-key.ts";
import { wantsRepeatedDiscreteSubjects } from "./repetition.ts";
import { featherEdge, findEdgeFringe } from "./halo.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  prompt: string;
  width: number;
  height: number;
  bgColor: string;
  selectedColor: string;
  palette?: string[];
  edges?: { top?: string; bottom?: string; left?: string; right?: string };
  style?: "painterly" | "flat" | "pixelart";
  mode?: "pixels" | "sticker";
  repeatSubjects?: boolean;
}

const MAX_DIM = 160;
const MIN_SHORT_DIM = 24;

// Broad map palette. The AI-generated image is quantized to these — kept
// intentionally wide (full spectrum, including vivid reds/yellows/oranges/
// purples and deep blacks) so colorful subjects like erupting volcanoes,
// lava, fire, flowers, and sunsets don't collapse to muddy browns during
// quantization. Style-appropriate restriction happens via the prompt, not
// by starving the palette.
const MAP_PALETTE = [
  // water — shallows to deep
  "#0a2540", "#153a5c", "#274b6d", "#2e6ea0", "#4a8fbf", "#7fb3d5", "#b5dcef",
  // sand / beach / dune
  "#f5e7c1", "#e3cfa0", "#c9b079", "#a68a5b",
  // grass / plains
  "#c9e0a2", "#a8c98a", "#8ab46b", "#6e9a52", "#557a3d",
  // forest / jungle
  "#3f6b3a", "#2e5230", "#1f3a23", "#12281a",
  // stone / mountain / cliff
  "#d5d5cd", "#b5b5ad", "#8a8a83", "#5f5f5a", "#3a3a37", "#1e1e1c",
  // snow / highlight / cloud
  "#ffffff", "#f4f4ea", "#efefe4", "#dfe6ec",
  // earth / path / wood / cabin roof
  "#c9a074", "#a37a55", "#7a4f30", "#4a2d1a", "#2a1810",
  // built / tech (solar panels, glass roofs, metal, night)
  "#050810", "#0d1830", "#1a2540", "#2a3a5c", "#4a5a7c", "#cfe6f5",
  // warm accents (terracotta, copper, autumn)
  "#e3a14a", "#c96f3b", "#a04a1e",
  // FIRE / LAVA / MAGMA — critical for volcanoes, dragons, forges, torches
  "#ffe066", "#ffb020", "#ff7a1a", "#ff3d0a", "#c9200a", "#7a1004", "#3a0602",
  // reds / roses / blood / rust
  "#ffb0a8", "#ff6a6a", "#d43838", "#9a1c1c", "#5c0a0a",
  // yellows / gold / flowers
  "#fff4a0", "#ffe54c", "#f5cc00", "#c9a300",
  // purples / magic / dusk / heather
  "#dcc1ef", "#a97fd0", "#7a4fb5", "#4a2870", "#2a1246",
  // pinks / cherry / coral flora
  "#ffc9d8", "#ff8fb4", "#e04a80", "#a41f52",
  // teals / cyans / ice / bioluminescence
  "#c2f0ea", "#6ad4c9", "#2a9a94", "#0e5a58",
  // deep neutrals / smoke / ash / charcoal
  "#807a72", "#524c46", "#2e2a26", "#100e0c",
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function dist2(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
// Returns saturation in 0..1 (max channel - min channel, normalized).
function saturation(rgb: [number, number, number]): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  if (max <= 0) return 0;
  return (max - min) / max;
}

function isWaterLikeColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return b > r + 22 && b > g + 10;
}

function isWaterLikeRgb(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb;
  return b > r + 22 && b > g + 10;
}

function promptAllowsWater(prompt: string, edges: Body["edges"] = {}): boolean {
  const lower = prompt.toLowerCase();
  const waterTerms = /\b(water|river|stream|creek|lake|pond|ocean|sea|shore|coast|beach|bay|canal|moat|waterfall|wetland|marsh|swamp|lagoon|harbor|harbour|dock|island|islands|ship|ships|boat|boats|flotilla|fleet|navy|sailing)\b/;
  if (waterTerms.test(lower)) return true;
  return Object.values(edges || {}).some((hex) => typeof hex === "string" && isWaterLikeColor(hex));
}

function promptWantsContainedComposition(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const containedTerms = [
    "greenhouse", "dome", "solar panel", "solar panels", "castle", "tower", "cabin",
    "house", "village", "temple", "ruins", "bridge", "fort", "fortress", "building",
    "city", "town", "farm", "outpost", "ship", "spaceship", "station", "observatory",
    "arena", "lab", "laboratory", "factory", "cathedral", "palace", "garden",
  ];
  const terrainTerms = [
    "forest", "mountain", "mountains", "river", "coast", "shore", "ocean", "sea",
    "swamp", "desert", "plains", "grassland", "jungle", "canyon", "cliff", "beach",
    "lake", "waterfall", "transition", "transitioning", "fade into", "blending into",
  ];

  const hasContained = containedTerms.some((term) => lower.includes(term));
  const hasTerrain = terrainTerms.some((term) => lower.includes(term));
  return hasContained && !hasTerrain;
}

function removeHaloArtifacts(
  cells: Array<{ r: number; c: number; color: string }>,
  iterations = 2,
) {
  let current = cells;
  for (let iter = 0; iter < iterations; iter++) {
    const occupied = new Set(current.map((c) => `${c.r},${c.c}`));
    const next: typeof current = [];
    for (const cell of current) {
      const rgb = hexToRgb(cell.color);
      const bright = (rgb[0] + rgb[1] + rgb[2]) / 3;
      const sat = saturation(rgb);
      // Dark, desaturated, and touching empty space = likely AI shadow/edge artifact
      if (bright < 150 && sat < 0.35) {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        let touchesEmpty = false;
        for (const [dr, dc] of dirs) {
          if (!occupied.has(`${cell.r + dr},${cell.c + dc}`)) {
            touchesEmpty = true;
            break;
          }
        }
        if (touchesEmpty) continue; // drop this artifact cell
      }
      next.push(cell);
    }
    if (next.length === current.length) break;
    current = next;
  }
  return current;
}

function removeRectangularFrameArtifacts(
  cells: Array<{ r: number; c: number; color: string }>,
) {
  if (cells.length === 0) return cells;

  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const cell of cells) {
    if (cell.r < minR) minR = cell.r;
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c < minC) minC = cell.c;
    if (cell.c > maxC) maxC = cell.c;
  }

  const boxW = maxC - minC + 1;
  const boxH = maxR - minR + 1;
  const rowColors = new Map<number, Map<string, number>>();
  const colColors = new Map<number, Map<string, number>>();
  for (const cell of cells) {
    if (!rowColors.has(cell.r)) rowColors.set(cell.r, new Map());
    if (!colColors.has(cell.c)) colColors.set(cell.c, new Map());
    rowColors.get(cell.r)!.set(cell.color, (rowColors.get(cell.r)!.get(cell.color) || 0) + 1);
    colColors.get(cell.c)!.set(cell.color, (colColors.get(cell.c)!.get(cell.color) || 0) + 1);
  }

  const frameKeys = new Set<string>();
  const markDominant = (colors: Map<string, number>, axis: "row" | "col", index: number, span: number) => {
    let dominant = "", dominantCount = 0, total = 0;
    colors.forEach((count, color) => {
      total += count;
      if (count > dominantCount) { dominant = color; dominantCount = count; }
    });
    if (!dominant) return;
    if (total >= span * 0.5 && dominantCount >= total * 0.55) {
      for (const cell of cells) {
        if (cell.color !== dominant) continue;
        if (axis === "row" && cell.r === index) frameKeys.add(`${cell.r},${cell.c}`);
        if (axis === "col" && cell.c === index) frameKeys.add(`${cell.r},${cell.c}`);
      }
    }
  };

  const edgeBandR = Math.max(2, Math.ceil(boxH * 0.24));
  const edgeBandC = Math.max(2, Math.ceil(boxW * 0.12));
  rowColors.forEach((colors, r) => {
    if (r - minR <= edgeBandR || maxR - r <= edgeBandR) markDominant(colors, "row", r, boxW);
  });
  colColors.forEach((colors, c) => {
    if (c - minC <= edgeBandC || maxC - c <= edgeBandC) markDominant(colors, "col", c, boxH);
  });

  if (frameKeys.size === 0) return cells;
  return cells.filter((cell) => !frameKeys.has(`${cell.r},${cell.c}`));
}

function promptAllowsWarmGround(prompt: string): boolean {
  return /\b(desert|sand|sandy|dune|dunes|beach|shore|coast|coastal|road|roads|path|paths|trail|trails|dirt|earth|mud|canyon|mesa|badlands|cliff|quarry|mine|field|farm|farmland|wheat|village|town|city|ruins|castle|fort|fortress|building|house|cabin|temple|tavern|bridge)\b/i.test(prompt);
}

function promptRequestsWarmTerrain(prompt: string): boolean {
  return /\b(desert|sand|sandy|dune|dunes|beach|shore|coast|coastal|road|roads|path|paths|trail|trails|dirt|earth|mud|canyon|mesa|badlands|cliff|quarry|mine|field|farm|farmland|wheat)\b/i.test(prompt);
}

function isLikelyPlateRgb(rgb: [number, number, number], bgRgb: [number, number, number]) {
  const [r, g, b] = rgb;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
  const bgDist = dist2(rgb, bgRgb);
  if (bgDist < 900 || sat > 0.50) return false;

  const warmTan = r >= g - 10 && g >= b - 22 && r > 118 && g > 82 && b < r - 8 && sat >= 0.06;
  const mutedBrown = r > g + 6 && g >= b - 12 && r > 105 && g > 70 && sat >= 0.08 && sat <= 0.46;
  const palePlate = maxC > 165 && sat < 0.22 && r >= b - 4 && g >= b - 12;
  return warmTan || mutedBrown || palePlate;
}

function removeRectangularPlateArtifacts(
  cells: Array<{ r: number; c: number; color: string }>,
  bgRgb: [number, number, number],
  prompt: string,
) {
  if (cells.length < 12) return cells;
  if (promptRequestsWarmTerrain(prompt)) return cells;

  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const cell of cells) {
    if (cell.r < minR) minR = cell.r;
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c < minC) minC = cell.c;
    if (cell.c > maxC) maxC = cell.c;
  }

  const boxW = maxC - minC + 1;
  const boxH = maxR - minR + 1;
  if (boxW < 6 || boxH < 6) return cells;

  const plateKeys = new Set<string>();
  const cellByKey = new Map<string, { r: number; c: number; color: string }>();
  for (const cell of cells) {
    const key = `${cell.r},${cell.c}`;
    cellByKey.set(key, cell);
    if (isLikelyPlateRgb(hexToRgb(cell.color), bgRgb)) plateKeys.add(key);
  }
  if (plateKeys.size === 0) return cells;

  const bandR = Math.max(1, Math.ceil(boxH * 0.16));
  const bandC = Math.max(1, Math.ceil(boxW * 0.16));
  const sides = {
    top: { total: 0, plate: 0, capacity: bandR * boxW },
    bottom: { total: 0, plate: 0, capacity: bandR * boxW },
    left: { total: 0, plate: 0, capacity: bandC * boxH },
    right: { total: 0, plate: 0, capacity: bandC * boxH },
  };

  for (const cell of cells) {
    const key = `${cell.r},${cell.c}`;
    const isPlate = plateKeys.has(key);
    if (cell.r - minR < bandR) { sides.top.total++; if (isPlate) sides.top.plate++; }
    if (maxR - cell.r < bandR) { sides.bottom.total++; if (isPlate) sides.bottom.plate++; }
    if (cell.c - minC < bandC) { sides.left.total++; if (isPlate) sides.left.plate++; }
    if (maxC - cell.c < bandC) { sides.right.total++; if (isPlate) sides.right.plate++; }
  }

  const warmGroundAllowed = promptAllowsWarmGround(prompt);
  const minRatio = warmGroundAllowed ? 0.34 : 0.18;
  const minCoverage = warmGroundAllowed ? 0.16 : 0.08;
  const sideValues = Object.values(sides);
  const plateSideCount = sideValues.filter((side) => {
    const ratio = side.total ? side.plate / side.total : 0;
    const coverage = side.plate / Math.max(1, side.capacity);
    return side.plate >= 3 && (ratio >= minRatio || coverage >= minCoverage);
  }).length;
  const edgePlate = sideValues.reduce((sum, side) => sum + side.plate, 0);
  const edgeTotal = sideValues.reduce((sum, side) => sum + side.total, 0);
  const edgePlateRatio = edgeTotal ? edgePlate / edgeTotal : 0;
  const rectangularPlateDetected = warmGroundAllowed
    ? plateSideCount >= 3 && edgePlateRatio >= 0.22
    : plateSideCount >= 2 && edgePlateRatio >= 0.10;
  if (!rectangularPlateDetected) return cells;

  const removeKeys = new Set<string>();
  const queue: string[] = [];
  const enqueue = (key: string) => {
    if (removeKeys.has(key) || !plateKeys.has(key)) return;
    removeKeys.add(key);
    queue.push(key);
  };

  for (const key of plateKeys) {
    const cell = cellByKey.get(key)!;
    if (
      cell.r - minR < bandR || maxR - cell.r < bandR ||
      cell.c - minC < bandC || maxC - cell.c < bandC
    ) enqueue(key);
  }

  for (let qi = 0; qi < queue.length; qi++) {
    const [r, c] = queue[qi].split(",").map(Number);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        enqueue(`${r + dr},${c + dc}`);
      }
    }
  }

  if (removeKeys.size < Math.max(4, cells.length * 0.035)) return cells;
  return cells.filter((cell) => !removeKeys.has(`${cell.r},${cell.c}`));
}

function getForegroundCrop(img: Image, bgRgb: [number, number, number]) {
  const stride = Math.max(1, Math.floor(Math.min(img.width, img.height) / 256));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < img.height; y += stride) {
    for (let x = 0; x < img.width; x += stride) {
      const px = img.getPixelAt(x + 1, y + 1);
      const rgb: [number, number, number] = [(px >>> 24) & 0xff, (px >>> 16) & 0xff, (px >>> 8) & 0xff];
      const d = dist2(rgb, bgRgb);
      if (d > 2800) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x0: 0, y0: 0, x1: img.width, y1: img.height };
  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.06);
  return {
    x0: Math.max(0, minX - pad),
    y0: Math.max(0, minY - pad),
    x1: Math.min(img.width, maxX + pad + stride),
    y1: Math.min(img.height, maxY + pad + stride),
  };
}

// Crop the subject's bounding box, then EXPAND it (toward the original image
// bounds, padding with background where needed) so the crop matches the
// target output aspect ratio. This is the core fix that prevents long thin
// selections from being squished: the AI's square image gets cropped to
// a horizontal/vertical band BEFORE downsampling, instead of squashing the
// whole square into a thin strip.
function getAspectCorrectedCrop(
  img: Image,
  bgRgb: [number, number, number],
  targetAspect: number,
) {
  const base = getForegroundCrop(img, bgRgb);
  const bw = base.x1 - base.x0;
  const bh = base.y1 - base.y0;
  if (bw <= 0 || bh <= 0) return base;
  const curAspect = bw / bh;
  let x0 = base.x0, y0 = base.y0, x1 = base.x1, y1 = base.y1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  if (curAspect < targetAspect) {
    // need a wider crop — expand horizontally around the subject center
    const newW = Math.min(img.width, Math.round(bh * targetAspect));
    x0 = Math.max(0, Math.round(cx - newW / 2));
    x1 = Math.min(img.width, x0 + newW);
    x0 = Math.max(0, x1 - newW);
  } else if (curAspect > targetAspect) {
    // need a taller crop — expand vertically around the subject center
    const newH = Math.min(img.height, Math.round(bw / targetAspect));
    y0 = Math.max(0, Math.round(cy - newH / 2));
    y1 = Math.min(img.height, y0 + newH);
    y0 = Math.max(0, y1 - newH);
  }
  return { x0, y0, x1, y1 };
}

function insetCellsWithPadding(
  sourceCells: Array<{ r: number; c: number; color: string }>,
  width: number,
  height: number,
  padding: number,
) {
  if (sourceCells.length === 0) return sourceCells;

  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const cell of sourceCells) {
    if (cell.r < minR) minR = cell.r;
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c < minC) minC = cell.c;
    if (cell.c > maxC) maxC = cell.c;
  }

  const sourceW = maxC - minC + 1;
  const sourceH = maxR - minR + 1;
  const targetW = Math.max(1, width - padding * 2);
  const targetH = Math.max(1, height - padding * 2);
  const scale = Math.min(targetW / sourceW, targetH / sourceH, 1);
  const scaledW = Math.max(1, Math.round(sourceW * scale));
  const scaledH = Math.max(1, Math.round(sourceH * scale));
  const offsetC = Math.floor((width - scaledW) / 2);
  const offsetR = Math.floor((height - scaledH) / 2);

  const remapped = new Map<string, string>();
  for (const cell of sourceCells) {
    const normalizedR = sourceH <= 1 ? 0 : (cell.r - minR) / (sourceH - 1);
    const normalizedC = sourceW <= 1 ? 0 : (cell.c - minC) / (sourceW - 1);
    const rr = offsetR + Math.round(normalizedR * Math.max(0, scaledH - 1));
    const cc = offsetC + Math.round(normalizedC * Math.max(0, scaledW - 1));
    remapped.set(`${rr},${cc}`, cell.color);
  }

  return Array.from(remapped.entries()).map(([key, color]) => {
    const [r, c] = key.split(",").map(Number);
    return { r, c, color };
  });
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pickMostContrastingColor(candidates: string[], bgRgb: [number, number, number]) {
  let best = candidates[0];
  let bestD = -Infinity;
  for (const color of candidates) {
    const d = dist2(hexToRgb(color), bgRgb);
    if (d > bestD) {
      best = color;
      bestD = d;
    }
  }
  return best;
}

function generateStreetAddressBuildingCells(width: number, height: number, bgHex: string) {
  const bgRgb = hexToRgb(bgHex);
  const roof = pickMostContrastingColor(["#7a4f30", "#c96f3b", "#2a3a5c", "#557a3d"], bgRgb);
  const outline = pickMostContrastingColor(["#4a2d1a", "#0d1830", "#1f3a23"], bgRgb);
  const trim = pickMostContrastingColor(["#a37a55", "#b5b5ad", "#e3a14a"], bgRgb);
  const path = pickMostContrastingColor(["#8a8a83", "#c9b079", "#5f5f5a"], bgRgb);
  const cells = new Map<string, string>();

  const put = (r: number, c: number, color: string) => {
    if (r < 0 || r >= height || c < 0 || c >= width) return;
    cells.set(`${r},${c}`, color);
  };
  const rect = (r0: number, c0: number, h: number, w: number, color: string) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) put(r, c, color);
  };

  const aspect = width / Math.max(1, height);
  const mainW = clampInt(width * (aspect > 1.35 ? 0.34 : 0.48), Math.min(width, 7), Math.max(7, width - 4));
  const mainH = clampInt(height * (aspect < 0.75 ? 0.38 : 0.48), Math.min(height, 8), Math.max(8, height - 5));
  const c0 = clampInt((width - mainW) / 2, 1, Math.max(1, width - mainW - 1));
  const r0 = clampInt((height - mainH) / 2 - height * 0.04, 1, Math.max(1, height - mainH - 2));

  // A deterministic top-down London row-house footprint. This avoids image-model
  // failures where street addresses become text fragments or web-page debris.
  rect(r0 - 1, c0 - 1, mainH + 2, mainW + 2, outline);
  rect(r0, c0, mainH, mainW, roof);

  const ridgeR = r0 + Math.floor(mainH / 2);
  rect(ridgeR, c0 + 1, 1, Math.max(1, mainW - 2), outline);

  const bayW = Math.max(2, Math.floor(mainW / 5));
  const bayH = Math.max(2, Math.floor(mainH / 6));
  rect(r0 + mainH - bayH, c0 + 2, bayH, bayW, trim);
  rect(r0 + mainH - bayH, c0 + mainW - bayW - 2, bayH, bayW, trim);

  const doorW = Math.max(2, Math.floor(mainW / 7));
  const doorC = c0 + Math.floor(mainW / 2) - Math.floor(doorW / 2);
  rect(r0 + mainH - 2, doorC, 2, doorW, outline);

  const chimneyW = Math.max(2, Math.floor(mainW / 9));
  rect(r0 + 1, c0 + 2, Math.max(2, Math.floor(mainH / 7)), chimneyW, outline);
  rect(r0 + 1, c0 + mainW - chimneyW - 2, Math.max(2, Math.floor(mainH / 7)), chimneyW, outline);

  if (height - (r0 + mainH) > 3) {
    const pathH = Math.min(height - r0 - mainH - 1, Math.max(3, Math.floor(height * 0.12)));
    rect(r0 + mainH, doorC, pathH, doorW, path);
  }

  if (r0 > 4 && mainW > 12) {
    const wingW = Math.max(4, Math.floor(mainW * 0.34));
    const wingH = Math.min(r0 - 1, Math.max(3, Math.floor(mainH * 0.24)));
    const wingC = c0 + Math.floor(mainW * 0.12);
    rect(r0 - wingH - 1, wingC - 1, wingH + 1, wingW + 2, outline);
    rect(r0 - wingH, wingC, wingH, wingW, roof);
  }

  return Array.from(cells.entries()).map(([key, color]) => {
    const [r, c] = key.split(",").map(Number);
    return { r, c, color };
  });
}

// Rough human-readable label for a hex color, for use in the AI prompt.
function describeColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.12) {
    if (max > 220) return "snow / light stone";
    if (max > 140) return "light grey stone";
    if (max > 70) return "dark stone";
    return "deep shadow / void";
  }
  if (b > r && b > g) return "blue water";
  if (g > r && g > b) {
    if (g < 110) return "dark forest green";
    return "grass green";
  }
  if (r > g && r > b) {
    if (g > 140 && b > 120) return "sand / beach";
    if (r > 160 && g > 100) return "warm brown earth";
    return "rocky red-brown";
  }
  if (r > 150 && g > 130) return "sandy earth";
  return "earth tone";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let reservedUserId: string | undefined;
  let reservationId: string | undefined;
  try {
    const gate = await enforceAiGate(req, "map_draw", corsHeaders);
    if (!gate.ok) return gate.response!;
    reservedUserId = gate.userId;
    reservationId = gate.reservationId;

    const body = (await req.json()) as Body;
    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawW = Math.max(1, Math.floor(body.width || 1));
    const rawH = Math.max(1, Math.floor(body.height || 1));
    // Guard: extreme aspect ratios cannot be honored by any image model we
    // support (gpt-image-1 caps at 3:2, Gemini generates ~square regardless).
    // Fail fast with a friendly message so the client shows an actual error
    // instead of returning a squished sticker or an opaque upstream 400.
    const aspectGuard = Math.max(rawW, rawH) / Math.max(1, Math.min(rawW, rawH));
    if (aspectGuard > 4) {
      return new Response(JSON.stringify({
        error: "AI Draw needs a more square-ish area. This selection is too narrow — try a wider or taller region.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // We always sample at the user's TRUE selection aspect ratio. The AI
    // image gets aspect-cropped before sampling, so we never squish a square
    // composition into a thin strip.
    const aspectRaw = rawW / rawH;
    const scale = Math.min(1, MAX_DIM / Math.max(rawW, rawH));
    let W = Math.max(4, Math.round(rawW * scale));
    let H = Math.max(4, Math.round(rawH * scale));
    if (aspectRaw >= 3 && H < MIN_SHORT_DIM) {
      H = Math.min(MIN_SHORT_DIM, rawH);
      W = Math.min(MAX_DIM * 4, Math.round(H * aspectRaw));
    } else if (aspectRaw <= 1 / 3 && W < MIN_SHORT_DIM) {
      W = Math.min(MIN_SHORT_DIM, rawW);
      H = Math.min(MAX_DIM * 4, Math.round(W / aspectRaw));
    }
    const style: Body["style"] = body.style === "flat" || body.style === "pixelart" ? body.style : "painterly";
    const mode: NonNullable<Body["mode"]> = body.mode === "sticker" ? "sticker" : "pixels";

    // 1) Have an image model actually PAINT the scene as a top-down map tile.
    const bgHexForPrompt = (body.bgColor || "#cfe0bf").startsWith("#") ? (body.bgColor || "#cfe0bf") : `#${body.bgColor}`;
    const bgRefForPrompt = mode === "sticker" ? "#ff00ff (pure magenta)" : bgHexForPrompt;
    const e = body.edges || {};
    const edgeLines: string[] = [];
    if (e.top && e.top.toLowerCase() !== bgHexForPrompt.toLowerCase())
      edgeLines.push(`- TOP edge of the tile borders existing ${describeColor(e.top)} (${e.top}) — the top of your drawing should naturally transition into / blend with that terrain.`);
    if (e.bottom && e.bottom.toLowerCase() !== bgHexForPrompt.toLowerCase())
      edgeLines.push(`- BOTTOM edge borders existing ${describeColor(e.bottom)} (${e.bottom}) — blend into it.`);
    if (e.left && e.left.toLowerCase() !== bgHexForPrompt.toLowerCase())
      edgeLines.push(`- LEFT edge borders existing ${describeColor(e.left)} (${e.left}) — blend into it.`);
    if (e.right && e.right.toLowerCase() !== bgHexForPrompt.toLowerCase())
      edgeLines.push(`- RIGHT edge borders existing ${describeColor(e.right)} (${e.right}) — blend into it.`);
    const edgeContext = edgeLines.length
      ? `\n\nSurrounding terrain context (CRITICAL — respect this so your tile fits the existing map):\n${edgeLines.join("\n")}\nUse this to decide WHERE features go inside the tile. For example, if the user asks for "mountain transitioning into sparse forest" and only the LEFT edge is rocky/stone while the other edges are grass, the mountains must sit on the LEFT side fading into forest/grass toward the right and top/bottom — do not place mountains touching grass edges.`
      : "";

    const containedComposition = promptWantsContainedComposition(prompt);
    const allowsWater = promptAllowsWater(prompt, e);
    const wantsRepeatedDiscrete = wantsRepeatedDiscreteSubjects(prompt, body.repeatSubjects);
    const longThinSelection = aspectRaw >= 3 || aspectRaw <= 1 / 3;
    // Named building references (addresses, famous landmarks, "the X house",
    // street names). These render best as a CLEAN readable roof footprint,
    // NOT a detailed architectural rendering or a side/perspective view.
    const isNamedBuildingPrompt = /\b(\d+[a-z]?\s+[a-z]+\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|place|pl|square|sq)|baker street|downing street|buckingham|kremlin|white house|eiffel|colosseum|parthenon|taj mahal|notre dame|westminster|pentagon|louvre|hogwarts|221b|sherlock)\b/i.test(prompt);
    const namedBuildingPrompt = isNamedBuildingPrompt
      ? `\n- NAMED / REAL-WORLD BUILDING: render as a CLEAN, READABLE simplified roof footprint — like a stylized fantasy-map building icon, NOT an architectural blueprint or photo. CRITICAL: the silhouette, shape, color and rooftop details must clearly identify WHAT KIND OF BUILDING this is so different buildings look VISIBLY DIFFERENT from one another. A police station is NOT the same as a Victorian townhouse is NOT the same as a tavern is NOT the same as a cathedral is NOT the same as a museum. Use characteristic type-specific cues:\n  • Police station / precinct: blocky rectangular civic footprint, blue-grey or municipal red roof, a small badge/star/light on the roof, wider entrance.\n  • Victorian townhouse / row house: narrow tall rectangle, warm dark slate or terracotta roof, 2 chimneys on the ridge, small front door with a stoop.\n  • Cathedral / church: cruciform footprint with a nave and transepts, a small cross or spire, stone-grey roof.\n  • Tavern / pub / bar: squat wooden footprint, warm brown roof, hanging sign, chimney with smoke.\n  • Manor / mansion: L-shape or H-shape footprint, ornamental garden squares, symmetric wings.\n  • Shop / storefront: small footprint with an awning strip along the front, colored trim.\n  • Museum / library: colonnaded front (small columns rendered as top-down dots or bars), pale stone roof, small dome or skylight.\n  • Fire / ambulance station: red roof, vehicle bay door on the front side.\n  Pick a warm distinctive roof color CLEARLY DIFFERENT from the background ${bgHexForPrompt}. The silhouette must be a compact geometric shape with hard clean edges. Do NOT draw a side view, front elevation, isometric view, or pitched-roof-with-visible-gable — TOP-DOWN ROOF only.`
      : "";
    const repeatedDiscretePrompt = wantsRepeatedDiscrete
      ? `\n- This is a REPEATED DISCRETE SUBJECTS request. Draw 3-5 SEPARATE instances, fully formed, with visible pure ${bgRefForPrompt} background between them. Vary size and orientation slightly. Do NOT merge them. ${aspectRaw >= 1.6 ? "Lay them out as a HORIZONTAL ROW, each subject WIDER than tall, all on the same horizontal baseline, marching left-to-right across the full width of the canvas." : aspectRaw <= 0.625 ? "Stack them as a VERTICAL COLUMN, each subject TALLER than wide, all on the same vertical centerline, marching top-to-bottom down the full height of the canvas." : "Arrange them on a single line across the long axis of the canvas."} Each subject should use roughly ${aspectRaw >= 1.6 ? Math.min(45, Math.round(80 / Math.max(3, Math.min(5, Math.round(aspectRaw * 1.2))))) + "% of the canvas WIDTH" : "30-45% of the canvas HEIGHT"} per instance.`
      : "";
    const containmentPrompt = containedComposition
      ? `\n- This request is for a SELF-CONTAINED subject. Keep the ENTIRE composition inside the frame on pure ${bgRefForPrompt} background. ${wantsRepeatedDiscrete && longThinSelection ? "Because this is a narrow repeated-subject strip, use only modest padding so each subject stays tall and readable; do NOT compress them into a thin smear." : "Keep LARGE visible padding (at least 15-20% of the canvas) on all sides."} Nothing — not even faint outer elements, radial extensions, or scattered details — may touch or cross the left, right, top, or bottom edge. The outer ring of the canvas MUST be solid background color so the tile fades naturally into the surrounding map.\n- Built, natural, magical, historical, futuristic, or abstract subjects must be painted as filled material-colored shapes with readable silhouettes. Do not make important interiors the same color as the background, and do not rely on empty outlines to define the subject.`
      : "";

    // Universal opacity rule — applies to every prompt regardless of subject.
    // Users draw maps of any era/style/location, so we cannot keyword-detect
    // "this prompt mentions glass/solar/water/ice". We always tell the model:
    // every painted shape is fully opaque and color-distinct from the bg.
    const opacityPrompt = `\n- OPAQUE RENDERING — UNIVERSAL RULE: every shape you paint is FULLY OPAQUE. Never render anything as transparent, semi-transparent, frosted, see-through, glassy, reflective, mirrored, or "ghosted". Glass roofs, domes, ice, water, crystal, chrome, polished metal — paint them all as SOLID opaque color blocks with painted-on highlights, never as alpha or as the background color showing through. Every pixel of the subject must use a color CLEARLY DISTINCT from the background color ${bgRefForPrompt}; do NOT tint subject pixels toward ${bgRefForPrompt} to suggest transparency or fade. Edges of the subject end with a clean hard or softly-feathered boundary against ${bgRefForPrompt} — no scattered translucent halo, no faded speckles, no "tinted" outer ring.`;

    // Describe canvas aspect so the AI orients linear features (mountain ranges,
    // rivers, coastlines) along the long axis instead of always drawing a
    // diagonal/square composition.
    const aspect = W / H;
    let orientationLine: string;
    if (aspect >= 1.6) {
      orientationLine = `The target canvas is WIDE / HORIZONTAL (${W} x ${H}, roughly ${aspect.toFixed(2)}:1 landscape). COMPOSE THE IMAGE AT THIS WIDE ASPECT. Linear features (mountain ranges, rivers, roads, coastlines, fleets/rows of ships) MUST run LEFT-TO-RIGHT, span the full width, and be substantially WIDER than they are tall. Do NOT draw a square or vertical composition that will need to be squished.`;
    } else if (aspect <= 0.625) {
      orientationLine = `The target canvas is TALL / VERTICAL (${W} x ${H}, roughly 1:${(1 / aspect).toFixed(2)} portrait). COMPOSE THE IMAGE AT THIS TALL ASPECT. Linear features and stacked subjects MUST run TOP-TO-BOTTOM, span the full height, and be substantially TALLER than they are wide. Do NOT draw a square or horizontal composition that will need to be squished.`;
    } else {
      orientationLine = `The target canvas is roughly SQUARE (${W} x ${H}). Use the orientation cues in the prompt (e.g. "top to bottom", "east to west") to decide direction.`;
    }

    const styleBlock = (() => {
      if (style === "flat") {
        return {
          opener: "A top-down fantasy map MARKER rendered as a soft ILLUSTRATED CARTOON MAP in the style of a modern children's book aerial map or a casual mobile game overworld (think illustrated bird's-eye storybook maps — soft rounded shapes, gentle organic outlines, hand-illustrated feel). This marker is placed on a real map to identify a location.",
          rules: [
            "STRICT TOP-DOWN AERIAL view — the camera is looking straight down at 90°. Absolutely NO isometric, NO 3/4 view, NO angled perspective, NO visible building side/front/gable, NO horizon. Buildings appear ONLY as their roof footprint; trees as fluffy round canopies from above; vehicles from directly overhead.",
            "ILLUSTRATED CARTOON style: soft rounded organic shapes with gentle, slightly wobbly hand-drawn edges. Shapes are filled with flat-ish color but tastefully shaded with soft light-and-shadow to give a friendly illustrated depth — like a picture-book aerial map, NOT a sterile vector infographic and NOT clipart.",
            "Use gentle tonal shading: a base color, a soft slightly darker shade on one side for volume, and small lighter highlights. Shading is smooth and soft, not airbrushed and not harsh. Small painted texture is welcome (subtle stippling on grass, soft ripples on water) — as long as edges stay clean.",
            "Warm, harmonious, slightly desaturated illustrated palette — friendly foliage greens, gentle water blues, warm ochre roads, soft terracotta/cream/sage rooftops. NEVER neon, NEVER pure primary colors, NEVER Material-Design flat blocks.",
            "Outlines: soft, thin, slightly darker than the fill (not black, not white). May be gently hand-drawn / uneven. Do NOT use thick uniform vector outlines or sticker-style bold contours.",
            "CRITICAL: do NOT draw outlined shapes with empty / white / transparent interiors. Every silhouette must be a fully-painted colored shape. NO blueprints, NO clipart look, NO geometric infographic icons.",
            "Reference feel: soft top-down illustrated storybook / casual game map — rounded blobby forest clusters, gently curving rivers with soft banks, small charming rooftops with a touch of shading, tiny painted details that give personality.",
          ],
        };
      }
      if (style === "pixelart") {
        return {
          opener: "A charming fantasy map MARKER rendered as crisp 16-bit PIXEL ART (SNES JRPG / Stardew Valley overworld). This marker is placed on a real map to identify a location.",
          rules: [
            "MOSTLY TOP-DOWN pixel-sprite framing with just a hint of character: buildings/objects may show only a VERY SLIGHT sliver of their front face (no more than ~5-8° tilt) so a door or sign reads at a glance. This is NOT a full isometric or 3/4 view — the roof is still overwhelmingly the dominant shape. Terrain (grass, water, paths, trees) stays fully top-down.",
            "Charming, characterful little sprites — a police station has a blue lamp on top, a townhouse has a warm-lit door, a tavern has a wooden sign. Personality over realism.",
            "PIXEL ART style: blocky pixel shapes, hard edges, no anti-aliasing or soft blurs, dithered shading at most. Limited palette per material (3-4 shades).",
            "Each subject is a small recognizable pixel sprite with clear silhouette. Use 1-pixel darker outlines.",
            "Vibrant retro game palette — bright greens, deep blues, warm browns — never washed out.",
            "DENSITY / DETAIL: pack the scene with MANY small distinct pixel sprites (dozens of individual tree canopies, rocks, planks, flowers, path stones, ripples, tiny props). Do NOT render just a couple of large simplified shapes — a good reference has 30-80+ readable little elements crammed into the tile like a Stardew Valley / Chrono Trigger overworld screenshot. Every tree is its own sprite with visible trunk and layered leaf clusters, every roof shows individual shingle/thatch rows, every water tile shows small ripple pixels.",
            "RESOLUTION FEEL: aim for a native pixel grid of roughly 96-160 pixels across the tile (i.e. very small individual sprites tiled densely), NOT a low-count 32x32 chunky look with 4-5 blobs.",
            "CRITICAL: every shape is SOLIDLY FILLED with opaque pixels. Do NOT use dithering, stippling, checkerboard patterns, scatter dots, or partial-transparency edges to suggest shape. Repeating/radial features must be solid filled forms, not sparse clouds of dots over the background. Enclosed structures must be filled shapes, not outlines with empty interiors. Background pixels appear ONLY outside the subject silhouette, never inside or around its edges as fade-out.",
            "NO faded, semi-transparent, or background-tinted edges. The subject silhouette ends with a hard pixel boundary against the background.",
          ],
        };
      }
      // Painterly has to say plainly what it is NOT: with only "soft brushwork"
      // to go on, and the flat-shape rules every style shares (opaque fills,
      // die-cut silhouette, roof footprints), the model drew clean illustrated
      // estate plans that looked like the Flat style.
      return {
        opener: "A top-down fantasy map MARKER, richly HAND-PAINTED like a gouache or oil painting of a place seen from a high bird's-eye view (like a painted concept-art aerial view). This marker is placed on a real map to identify a location.",
        rules: [
          "STRICT TOP-DOWN ORTHOGRAPHIC view — the camera is looking straight down at 90°. Absolutely NO isometric, NO 3/4 view, NO angled perspective, NO visible building side/front/gable, NO horizon. Buildings appear ONLY as their roof footprint; trees as circular canopies from above.",
          "Distinctive, characterful silhouettes so different subjects look VISIBLY DIFFERENT (a tavern ≠ a temple ≠ a townhouse ≠ a police station).",
          "PAINTERLY style: VISIBLE BRUSH STROKES and layered paint texture everywhere. Every surface has tonal variation — grass, fields and lawns are mottled with lighter and darker strokes, never one flat fill; water has painted ripples and depth; paths and roads show worn tracks and edges.",
          "DEPTH from light and shadow: a single warm light from the top-left. Tree canopies are rounded, lit on the top-left and darker on the bottom-right, each casting a soft shadow on the ground beside it. Roofs have a lit plane and a shaded plane, and buildings, walls and hedges cast soft shadows. Ambient occlusion where things meet the ground.",
          "Rich, natural painted palette with warm and cool variation inside each colour (sunlit greens vs shadowed blue-greens), clear colour identity for each feature.",
          "NOT flat vector shapes, NOT clean line art or ink outlines filled with flat colour, NOT a watercolour plan, architectural site plan or garden-design drawing, NOT a cartoon or children's-book map. Outlines, if any, are painted and soft, never uniform ink lines.",
        ],
      };
    })();

    // Chroma-key approach: image models often bake a checkerboard "transparency
    // indicator" into the PNG when asked for a transparent background. Instead
    // we ask for a solid pure-magenta background (a color that basically never
    // appears in map illustrations) and strip it to alpha ourselves.
    const CHROMA_KEY = "#ff00ff";
    const stickerPrompt = mode === "sticker"
      ? `\n\nSTICKER MODE — CRITICAL: render the subject as ONE SELF-CONTAINED, CONTIGUOUS die-cut STICKER on a SOLID, FLAT, UNIFORM ${CHROMA_KEY} (pure magenta / bright pink) background that completely fills every pixel outside the sticker. The sticker's outer silhouette may be irregular, but its entire interior MUST be fully painted and opaque: NO magenta holes, gaps, cutouts, channels, negative space, or transparent areas anywhere inside the outer silhouette. If the subject contains several buildings, trees, water, beach, or other separated elements, join them with the requested painted ground/terrain so they form one continuous opaque composition. Magenta may appear ONLY outside the single outer perimeter. Do NOT draw a transparency checkerboard pattern. Do NOT use grey-and-white checkers. Do NOT use a card, baseplate, rounded tile, gradient, texture, glow, or shadow-plate behind the subject — the background is a single flat ${CHROMA_KEY} color and nothing else. The subject itself must never use magenta, pink, red-purple, or purple edge pixels (that color is reserved for the background and will be removed). Do NOT add a white (or any colour) die-cut outline, border or stroke around the subject: its own painted edge meets ${CHROMA_KEY} directly. ABSOLUTELY NO GLOW, AURA, HALO, OR OUTER RING of ANY color around the subject — no red, coral, orange, pink, warm, cream, yellow, blue, purple, or "atmospheric" fade. No colored shadow. No airbrushed spray, no soft feathered light, no radial gradient bleeding out from the subject into the background. The pixel immediately outside the subject silhouette must be pure ${CHROMA_KEY} with a HARD edge — a single-pixel transition from subject to ${CHROMA_KEY}, not a gradual fade. Any shadow, if present at all, must be a very faint NEUTRAL GREY directly under the subject only, never around it. Every remaining non-subject pixel must be pure ${CHROMA_KEY}.`
      : "";
    // Image models love to dress anything "map"-like as a finished map, with a
    // compass, legend, title and labels. The writer's map already has its own,
    // so this is said early and plainly, and again at the end.
    const pictureOnlyPrompt = `\n\nPICTURE ONLY — CRITICAL: this is one illustration that will be placed on the writer's own map, which already has its own labels, compass and legend. Paint ONLY the place itself. NEVER add map furniture of any kind: no compass rose or north arrow, no legend or key box, no scale bar, no title, cartouche, banner, ribbon or label plate, no place names, road names, captions or any other text, lettering or numbers (not even names given in the subject), no border, frame or neatline, no grid, no parchment or paper edge, no decorative corners. If the subject names a place, show it — never write it.`;
    const imgPrompt = `${styleBlock.opener}${pictureOnlyPrompt}${stickerPrompt}

MAP MARKER FRAMING — VERY IMPORTANT: this drawing will be placed onto an existing map as a MARKER identifying a location. It must be:
  1) IDENTIFIABLE at a glance — the silhouette instantly communicates what the place is (a police station vs. a tavern vs. a townhouse vs. a park must be visually distinct).
  2) INTERESTING and characterful — small storytelling details that make each subject feel unique. Never fall back on a generic "house shape" for every named building.
  3) ${mode === "sticker" ? "A CLEAN cut-out — the subject has a crisp bounded silhouette against pure magenta, with no white outline; NOT a rectangular tile that fills the whole frame." : `BLENDED into the map — the outer edge of the illustration softly meets the surrounding background color ${bgHexForPrompt} without a hard frame, plate, card, or contrasting halo.`}
  4) DIFFERENT from other markers — if the same building type has appeared before, this instance should still have its own recognizable identity via color, small details, or footprint variation.

Subject (draw ONLY this — do not add anything that wasn't asked for; names in it tell you what to paint and are never written on the image): ${prompt}

CANVAS SHAPE — CRITICAL: ${orientationLine} Compose so the subject matches this aspect ratio. If the user asks for a "long mountain range from top to bottom", the ridge MUST be a vertical spine running from the top edge to the bottom edge of the image, NOT a diagonal blob.

Strict requirements:
- ${styleBlock.rules.join("\n- ")}
- Draw ONLY what was requested. Do NOT add extra surrounding scenery, landscape, mountains, rivers, forests, towns, roads, or decorative elements that weren't asked for. If the user asked for a castle, draw a castle — not a castle inside a landscape.${namedBuildingPrompt}
- The full requested subject MUST fit completely inside the canvas. Never crop, cut off, or let important features run out through the image edges.
- Use most of the canvas, but keep a small safety margin so the subject remains fully visible. Aim for roughly 5-10% breathing room inside the frame.
- For terrain-only prompts (forest, mountain range, coast, river, swamp, grassland, desert, etc.), the terrain may continue naturally to the tile edges and softly feather into the background.
- For discrete built or named features (greenhouse, solar panel field, castle, tower, cabin, village, ruins, bridge, temple, etc.), keep every major element fully inside the frame with clear padding. Do not clip structures or repeating elements at the borders.
- If a design has a central object with surrounding radial or repeated elements, include the ENTIRE radial layout inside the frame instead of cutting the outer ring off.${opacityPrompt}${containmentPrompt}${repeatedDiscretePrompt}
- TRUE TOP-DOWN orthographic view. No side-view, no horizon, no perspective. Structures (walls, towers, buildings, cabins) are seen straight from above as their roof footprint with subtle shading.
- Use a RICH, SATURATED, COLORFUL palette — not washed-out grays. Water is clearly BLUE. Forest is clearly GREEN. Earth/paths are warm BROWN. Stone roofs and walls can be grey but should be accented with brown, green moss, or warm shadow tones — never a uniform sea of grey. Moats specifically must be BLUE water, with earthy brown or mossy green banks.
- Do NOT add water, rivers, lakes, ponds, moats, blue pools, beaches, or white shoreline rings unless the subject explicitly asks for water/coast/ships or the surrounding terrain context is water. A forest with a cabin on green background must be trees, earth, and cabin only — no water around it.
- MOUNTAINS specifically: rocky GREY and warm BROWN ridges with optional WHITE snow caps along the highest spine. Do NOT use blue inside a mountain range unless the user explicitly asked for water, rivers, or lakes — blue speckles inside a mountain read as water and ruin the silhouette.
${mode === "sticker"
  ? `- Background: fill EVERY non-subject pixel with pure #ff00ff magenta — nothing else. Do NOT paint the map's terrain color, do NOT paint a card/tile/pedestal, do NOT fill the whole rectangle with the subject. The subject occupies only its own silhouette; the rest of the canvas is 100% pure magenta so it can be chroma-keyed to transparency.
- ABSOLUTELY NO BASE PLATE, tile, card, or rectangular background of any color behind the subject — only pure magenta outside the silhouette.`
  : `- Background: fill the entire image background with the solid color ${bgHexForPrompt} (this is the existing map's terrain color — it could be grass green, water blue, sand, stone grey, brown earth, snow white, anything). The subject must FADE gently into this background color at its outer edges only where appropriate so it blends seamlessly. No hard rectangular cutout, no contrasting border, no different-colored frame around the subject.
- ABSOLUTELY NO BASE PLATE: do NOT paint a sand-colored, cream, beige, tan, grey, or any other "ground plate" / "platform" / "pedestal" / "card" / "tile background" rectangle or rounded rectangle UNDER the subject. The subject sits DIRECTLY on the pure ${bgHexForPrompt} background. The only color visible behind or around the subject is exactly ${bgHexForPrompt} — nothing else. If the user asked for forest, the ground between/around the trees is ${bgHexForPrompt}, not sand.`}
- NO text, labels or lettering of any kind, NO compass rose or north arrow, NO legend or key, NO scale bar, NO title or cartouche, NO border frame, NO grid lines, NO UI elements.${edgeContext}`;

    const iRoute = imageRoute(gate.byokOpenAiKey, gate.byokOpenAiKey ? null : await pickImageModel());
    const imgResp = await fetch(iRoute.url, {
      method: "POST",
      headers: iRoute.headers,
      body: JSON.stringify(iRoute.buildBody(imgPrompt, { w: rawW, h: rawH })),
    });

    if (!imgResp.ok) {
      if (imgResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (imgResp.status === 402) return new Response(JSON.stringify({ error: "AI image generation is temporarily unavailable. Please try again later.", service_unavailable: true }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await imgResp.text();
      console.error("ai-map-draw img error", imgResp.status, t.slice(0, 400));
      if (imgResp.status === 403 && t.includes("credit_limit_reached")) {
        return new Response(JSON.stringify({ error: "AI image generation is temporarily unavailable. Please try again later.", service_unavailable: true }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Content moderation: the provider refused the prompt. Tell the user
      // plainly instead of failing with a generic error.
      const lowered = t.toLowerCase();
      if (
        lowered.includes("prohibited_content") ||
        lowered.includes("content_policy_violation") ||
        lowered.includes("moderation_blocked") ||
        lowered.includes("safety") ||
        lowered.includes("content blocked")
      ) {
        return new Response(JSON.stringify({
          error: "That prompt was blocked by the image model's content rules. Try rephrasing it without explicit, violent or real-person content.",
          content_blocked: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: `AI image generation failed (${imgResp.status}). Try again or rephrase the prompt.` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const imgData = await imgResp.json();
    const b64 = iRoute.readImage(imgData);
    if (!b64) {
      console.error("ai-map-draw no image", JSON.stringify(imgData).slice(0, 400));
      // A 200 with no image is almost always a silent refusal (copyrighted
      // characters, real people, explicit content). Detect it and say so.
      const refusalText = JSON.stringify(imgData ?? {}).toLowerCase();
      const refused =
        refusalText.includes("copyright") ||
        refusalText.includes("trademark") ||
        refusalText.includes("intellectual property") ||
        refusalText.includes("can't create") ||
        refusalText.includes("cannot create") ||
        refusalText.includes("can't generate") ||
        refusalText.includes("cannot generate") ||
        refusalText.includes("unable to generate") ||
        refusalText.includes("not able to") ||
        refusalText.includes("policy") ||
        refusalText.includes("safety") ||
        refusalText.includes("data\":null");
      return new Response(JSON.stringify({
        error: refused
          ? "The image model refused that prompt. It won't draw copyrighted or trademarked characters, real people, or explicit content. Try describing an original character or scene instead."
          : "The AI didn't return an image. Try again or rephrase the prompt.",
        content_blocked: refused,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sticker mode: skip pixelation entirely and return the raw high-res image
    // so the client can place it as a movable sticker on top of the map.
    if (mode === "sticker") {
      const chargeId = gate.byokOpenAiKey ? null : await chargeUsage(gate.userId!, gate.reservationId!, "map_draw", { model: iRoute.model, images: 1 });
      if (chargeId) reservationId = undefined;
      // Chroma-key the magenta background to transparent alpha.
      let outDataUrl = `data:image/png;base64,${b64}`;
      try {
        const stBin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const stDecoded = await decode(stBin);
        const stImg: Image = (stDecoded as any) instanceof Image
          ? (stDecoded as Image)
          : ((stDecoded as any).frames?.[0] as Image);
        const iw = stImg.width, ih = stImg.height;
        const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
        // Magenta threshold: remove both pure chroma-key pixels and anti-aliased
        // edge pixels. For partially-matted pixels, subtract the magenta matte
        // from the RGB before preserving alpha so no pink/red fringe remains.
        for (let y = 1; y <= ih; y++) {
          for (let x = 1; x <= iw; x++) {
            const px = stImg.getPixelAt(x, y);
            const r = (px >>> 24) & 0xff;
            const g = (px >>> 16) & 0xff;
            const b = (px >>> 8) & 0xff;
            const isMagenta = r > 190 && b > 190 && g < 145 && Math.abs(r - b) < 75;
            if (isMagenta) {
              stImg.setPixelAt(x, y, 0x00000000);
            } else {
              const magentaDominance = Math.min(r, b) - g;
              const balancedPink = Math.abs(r - b) < 90;
              if (balancedPink && magentaDominance > 18) {
                const matte = Math.max(0, Math.min(0.96, magentaDominance / 210));
                const alpha = 1 - matte;
                if (alpha <= 0.08) {
                  stImg.setPixelAt(x, y, 0x00000000);
                } else {
                  const rr = clampByte((r - 255 * matte) / alpha);
                  const gg = clampByte(g / alpha);
                  const bb = clampByte((b - 255 * matte) / alpha);
                  const a = clampByte(alpha * 255);
                  stImg.setPixelAt(x, y, (rr << 24) | (gg << 16) | (bb << 8) | a);
                }
              }
            }
          }
        }
        // Edge-connected fringe removal. The model often paints a warm coral
        // glow or a pale/grey fog ring around the sticker that the chroma key
        // above doesn't catch. Flood in from the transparent border and clear
        // it, but only a short way in: grey roads, gravel yards and pale paths
        // that run to the sticker's edge are subject, not fog (see halo.ts).
        try {
          const fringe = findEdgeFringe(stImg.bitmap, iw, ih);
          for (let i = 0; i < fringe.length; i++) {
            if (fringe[i]) stImg.setPixelAt((i % iw) + 1, Math.floor(i / iw) + 1, 0x00000000);
          }
        } catch (e) {
          console.error("[ai-map-draw] halo flood-fill failed:", e);
        }
        // Fallback keyer: sometimes the model ignores the magenta instruction
        // and paints a grey/white "transparency checkerboard" (or any other
        // flat backdrop). In that case almost no border pixel is transparent,
        // so key out whatever colors actually occupy the border instead.
        try {
          let borderTotal = 0, borderClear = 0;
          const borderPixels: number[] = [];
          const pushBorder = (x: number, y: number) => {
            const px = stImg.getPixelAt(x, y);
            borderTotal++;
            if ((px & 0xff) === 0) borderClear++;
            else borderPixels.push(px);
          };
          for (let x = 1; x <= iw; x++) { pushBorder(x, 1); pushBorder(x, ih); }
          for (let y = 1; y <= ih; y++) { pushBorder(1, y); pushBorder(iw, y); }

          if (borderTotal > 0 && borderClear / borderTotal < 0.4) {
            // Cluster the border colors so both squares of a checkerboard
            // (and its grid lines) become keys. Only neutral/magenta backdrops
            // are keyable — painted terrain (sand, grass, water) must survive.
            const clusters = clusterBorderColors(
              borderPixels.map((px) => ({
                r: (px >>> 24) & 0xff,
                g: (px >>> 16) & 0xff,
                b: (px >>> 8) & 0xff,
              })),
            );
            const keys = selectBackdropKeys(clusters, borderPixels.length);
            if (keys.length) {
              const TOL = 42;
              const isBg = (r: number, g: number, b: number, a: number) => {
                if (a < 240) return true;
                return keys.some((c) =>
                  Math.abs(c.r - r) < TOL && Math.abs(c.g - g) < TOL && Math.abs(c.b - b) < TOL);
              };

              const visited2 = new Uint8Array(iw * ih);
              const stack2: number[] = [];
              const idx2 = (x: number, y: number) => (y - 1) * iw + (x - 1);
              const seed = (x: number, y: number) => {
                const px = stImg.getPixelAt(x, y);
                const r = (px >>> 24) & 0xff, g = (px >>> 16) & 0xff, b = (px >>> 8) & 0xff, a = px & 0xff;
                if (visited2[idx2(x, y)]) return;
                if (a === 0 || isBg(r, g, b, a)) {
                  visited2[idx2(x, y)] = 1;
                  stImg.setPixelAt(x, y, 0x00000000);
                  stack2.push(x, y);
                }
              };
              for (let x = 1; x <= iw; x++) { seed(x, 1); seed(x, ih); }
              for (let y = 1; y <= ih; y++) { seed(1, y); seed(iw, y); }
              while (stack2.length) {
                const y = stack2.pop()!;
                const x = stack2.pop()!;
                for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                  if (nx < 1 || ny < 1 || nx > iw || ny > ih) continue;
                  const nIdx = idx2(nx, ny);
                  if (visited2[nIdx]) continue;
                  const npx = stImg.getPixelAt(nx, ny);
                  const nr = (npx >>> 24) & 0xff, ng = (npx >>> 16) & 0xff, nb = (npx >>> 8) & 0xff, na = npx & 0xff;
                  if (isBg(nr, ng, nb, na)) {
                    visited2[nIdx] = 1;
                    stImg.setPixelAt(nx, ny, 0x00000000);
                    stack2.push(nx, ny);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error("[ai-map-draw] fallback background key failed:", e);
        }

        // A sticker is one opaque composition: alpha is allowed around its
        // outside border, never in an enclosed interior. Models occasionally
        // paint the key color between buildings, pools, or trees; after keying,
        // fill those accidental holes from their nearest opaque edge colors.
        try {
          const alpha = new Uint8Array(iw * ih);
          for (let y = 1; y <= ih; y++) {
            for (let x = 1; x <= iw; x++) {
              alpha[(y - 1) * iw + (x - 1)] = stImg.getPixelAt(x, y) & 0xff;
            }
          }
          const holes = findStickerInteriorTransparency(alpha, iw, ih);
          const remaining = new Set(holes);
          while (remaining.size) {
            let filled = 0;
            for (const pixelIndex of [...remaining]) {
              const x = pixelIndex % iw + 1;
              const y = Math.floor(pixelIndex / iw) + 1;
              const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
              const opaque: number[] = [];
              for (const [nx, ny] of neighbors) {
                if (nx < 1 || ny < 1 || nx > iw || ny > ih) continue;
                const px = stImg.getPixelAt(nx, ny);
                if ((px & 0xff) >= 240) opaque.push(px);
              }
              if (!opaque.length) continue;
              const average = (shift: number) => Math.round(
                opaque.reduce((sum, px) => sum + ((px >>> shift) & 0xff), 0) / opaque.length,
              );
              stImg.setPixelAt(x, y, (average(24) << 24) | (average(16) << 16) | (average(8) << 8) | 0xff);
              remaining.delete(pixelIndex);
              filled++;
            }
            if (!filled) break;
          }
        } catch (e) {
          console.error("[ai-map-draw] enclosed transparency repair failed:", e);
        }

        // Anti-alias the cut-out so the silhouette isn't a jagged hard edge.
        try {
          featherEdge(stImg.bitmap, iw, ih);
        } catch (e) {
          console.error("[ai-map-draw] edge feathering failed:", e);
        }

        const outBytes = await stImg.encode();
        // Convert to base64
        let bin = "";
        for (let i = 0; i < outBytes.length; i++) bin += String.fromCharCode(outBytes[i]);
        outDataUrl = `data:image/png;base64,${btoa(bin)}`;
      } catch (e) {
        console.error("[ai-map-draw] sticker chroma-key failed, returning raw:", e);
      }
      return new Response(JSON.stringify({
        sticker: { dataUrl: outDataUrl },
        rectWidth: rawW,
        rectHeight: rawH,
        chargeId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Decode the generated image.
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const decoded = await decode(bin);
    const img: Image = (decoded as any) instanceof Image
      ? (decoded as Image)
      : ((decoded as any).frames?.[0] as Image);
    const bgHex = (body.bgColor || "#cfe0bf").startsWith("#") ? (body.bgColor || "#cfe0bf") : `#${body.bgColor}`;
    const bgRgb = hexToRgb(bgHex);
    // Always aspect-correct the crop so a square AI image isn't squished into
    // a thin strip when the user selected a long horizontal/vertical region.
    const targetAspect = W / H;
    const crop = getAspectCorrectedCrop(img, bgRgb, targetAspect);
    const srcW = crop.x1 - crop.x0;
    const srcH = crop.y1 - crop.y0;

    // 3) Downsample by averaging each cell block, then quantize to the user's
    //    actual map palette so the result blends with what's already on their map.
    const blockW = srcW / W;
    const blockH = srcH / H;
    const userPalette = (body.palette || []).filter((c) => typeof c === "string" && /^#?[0-9a-fA-F]{6}$/.test(c)).map((c) => c.startsWith("#") ? c : `#${c}`);
    const filteredUserPalette = userPalette;
    const filteredMapPalette = MAP_PALETTE;
    // ALWAYS merge curated map palette so we have full color variety (blues for water,
    // greens for forest, browns for earth) even when the user's recent palette is mostly
    // grey from drawing terrain. Without this, a colorful AI image gets quantized to grey.
    const effectivePalette = Array.from(new Set([...filteredUserPalette, ...filteredMapPalette]));
    const palRgb = effectivePalette.map(hexToRgb);
    const palSat = palRgb.map(saturation);
    const sampled = new Array<{
      avg: [number, number, number];
      bgD: number;
      best: number;
      subjectBest: number;
      bgLike: boolean;
      waterLike: boolean;
    } | null>(W * H).fill(null);
    // If the map background is very light (cream/snow/pale sand), building
    // walls painted in a light grey are naturally CLOSE to the bg color and
    // would get flagged as "background-like" and dropped — leaving a sparse,
    // hollowed-out silhouette. Tighten the drop threshold when bg is light.
    const bgBrightness = (bgRgb[0] + bgRgb[1] + bgRgb[2]) / 3;
    const lightBg = bgBrightness > 200;
    const bgDropRatio = style === "pixelart" ? 0.5 : (lightBg ? 0.5 : 0.65);
    const bgDropAbs = style === "pixelart" ? 1200 : (lightBg ? 900 : 1800);
    const visibleSubjectMinD = style === "pixelart" ? 900 : 1300;

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const x0 = Math.floor(c * blockW);
        const y0 = Math.floor(r * blockH);
        const x1 = Math.min(srcW, Math.max(x0 + 1, Math.floor((c + 1) * blockW)));
        const y1 = Math.min(srcH, Math.max(y0 + 1, Math.floor((r + 1) * blockH)));
        const stepX = Math.max(1, Math.floor((x1 - x0) / 4));
        const stepY = Math.max(1, Math.floor((y1 - y0) / 4));
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let y = y0; y < y1; y += stepY) {
          for (let x = x0; x < x1; x += stepX) {
            // imagescript getPixelAt is 1-indexed.
              const px = img.getPixelAt(crop.x0 + x + 1, crop.y0 + y + 1);
            sr += (px >>> 24) & 0xff;
            sg += (px >>> 16) & 0xff;
            sb += (px >>> 8) & 0xff;
            n++;
          }
        }
        if (n === 0) continue;
        const avg: [number, number, number] = [sr / n, sg / n, sb / n];

        // Quantize to nearest color in the combined palette.
        // Saturation-aware: if the source pixel is clearly colorful (saturated),
        // disqualify near-grey palette entries — they make blue water and green
        // foliage collapse into a sea of grey. This is the main fix for "why is
        // everything grey?" when the user's recent colors happen to be greys.
        const srcSat = saturation(avg);
        const colorful = srcSat > 0.18;
        const bgD = dist2(avg, bgRgb);
        const waterLike = isWaterLikeRgb(avg);
        let best = 0, bestD = Infinity;
        let subjectBest = -1, subjectBestD = Infinity;
        let foundPalette = false;
        for (let i = 0; i < palRgb.length; i++) {
          if (colorful && palSat[i] < 0.12) continue; // skip grey entries for colorful pixels
          const d = dist2(avg, palRgb[i]);
          if (d < bestD) { bestD = d; best = i; foundPalette = true; }
          if (dist2(palRgb[i], bgRgb) >= visibleSubjectMinD && d < subjectBestD) {
            subjectBestD = d;
            subjectBest = i;
          }
        }
        if (!foundPalette) {
          for (let i = 0; i < palRgb.length; i++) {
            const d = dist2(avg, palRgb[i]);
            if (d < bestD) { bestD = d; best = i; foundPalette = true; }
            if (dist2(palRgb[i], bgRgb) >= visibleSubjectMinD && d < subjectBestD) {
              subjectBestD = d;
              subjectBest = i;
            }
          }
          if (!foundPalette) continue;
        }
        // Treat as background ONLY when the background color is meaningfully
        // closer to this pixel than the best palette match. Otherwise keep the
        // palette color — this is what preserves snowy whites, sandy beaches,
        // and other features whose color happens to be vaguely near the bg.
        // Drop pixels close to the background color so the tile fades naturally
        // into the surrounding map instead of producing a hard square outline.
        // Pixel art uses hard edges by design — be much stricter about dropping
        // bg-similar pixels so solid filled shapes don't get hollowed out.
        // Universal bgDrop: only drop pixels whose averaged color is VERY close
        // to the background AND meaningfully closer to bg than to any palette
        // color. We deliberately keep this strict so subjects that the AI
        // happened to paint in a hue near the background (glass, ice, water,
        // distant terrain, faint smoke, anything) are preserved as opaque
        // shapes instead of being silently turned transparent.
        const comparisonD = subjectBestD < Infinity ? subjectBestD : bestD;
        const bgLike = bgD < comparisonD * bgDropRatio && bgD < bgDropAbs;
        sampled[r * W + c] = { avg, bgD, best, subjectBest, bgLike, waterLike };
      }
    }

    // Drop only the background-like pixels that are connected to the tile edge.
    // Near-background pixels inside an enclosed subject are usually intentional
    // material color (glass, mist, highlights, pale roofs, etc.); deleting them
    // makes the drawing look transparent. This is subject-agnostic and preserves
    // the outer fade without hollowing out interiors.
    const exteriorBg = new Uint8Array(W * H);
    const queue: number[] = [];
    // Detect halo-like averaged cells: warm coral/brown fog, pale desaturated
    // rings, mid-grey blur — the same categories the sticker chroma-key
    // strips. Applied only via edge-connected flood so subject interiors are
    // protected. This kills the dirty brown ring the model paints around
    // subjects when blending into a colored map background.
    const isHaloAvg = (avg: [number, number, number]) => {
      const [r, g, b] = avg;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const bgDist = dist2(avg, bgRgb);
      // Never flag a color that IS effectively the background — those are
      // handled by the bgLike path and we don't want to accidentally re-tag
      // subject-colored pixels.
      const stronglySaturated = sat > 0.45 && (maxC - minC) > 90;
      if (stronglySaturated) return false;
      // Warm coral/brown/tan pastel halo (r dominant, muted).
      const warmSpread = r - Math.max(g, b);
      if (
        warmSpread >= 6 && r > 120 && g > 70 && Math.abs(g - b) < 90 &&
        !(sat > 0.55 && r > 170 && g < 110)
      ) return true;
      // Muted khaki / beige / tan plate (warm order r≥g≥b, moderate sat,
      // clearly not the map bg color). Catches the tan pedestal gpt-image-1
      // paints around subjects even when it's more neutral than "warm coral".
      if (
        r >= g - 4 && g >= b - 4 && r > 140 && b < r - 8 &&
        sat >= 0.08 && sat <= 0.40 && bgDist > 1500
      ) return true;
      // Pale desaturated blur ring.
      if (maxC > 200 && sat < 0.18) return true;
      // Mid-tone grey fog.
      if (sat < 0.10 && maxC > 110 && maxC < 235) return true;
      // Residual magenta/pink cast.
      if (b > 140 && r > 140 && g < Math.min(r, b) - 10) return true;
      return false;
    };
    // For painterly contained subjects (volcanoes, ships, dragons, etc.)
    // the "halo" heuristic eats legitimate paint — smoke plumes, lava glow,
    // pale desaturated highlights around the subject. Skip it entirely so
    // colorful/atmospheric edges survive; still drop true background pixels.
    const preserveContainedEdges = containedComposition && style === "painterly";
    const isTraversableBg = (idx: number) => {
      const s = sampled[idx];
      if (!s) return true;
      if (s.bgLike) return true;
      if (preserveContainedEdges) return false;
      return isHaloAvg(s.avg);
    };
    const enqueue = (idx: number) => {
      if (idx < 0 || idx >= sampled.length || exteriorBg[idx] || !isTraversableBg(idx)) return;
      exteriorBg[idx] = 1;
      queue.push(idx);
    };
    for (let c = 0; c < W; c++) {
      enqueue(c);
      enqueue((H - 1) * W + c);
    }
    for (let r = 1; r < H - 1; r++) {
      enqueue(r * W);
      enqueue(r * W + W - 1);
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const idx = queue[qi];
      const r = Math.floor(idx / W);
      const c = idx % W;
      if (r > 0) enqueue(idx - W);
      if (r < H - 1) enqueue(idx + W);
      if (c > 0) enqueue(idx - 1);
      if (c < W - 1) enqueue(idx + 1);
    }

    const exactBgAbs = style === "pixelart" ? 48 : 96;
    const cells: Array<{ r: number; c: number; color: string }> = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const idx = r * W + c;
        const s = sampled[idx];
        if (!s) continue;
        if (s.bgLike && exteriorBg[idx]) continue;
        if (s.bgLike && s.bgD < exactBgAbs) continue;
        // Drop edge-connected halo cells too (warm brown/coral fog) — but
        // not for painterly contained subjects, where the "halo" is usually
        // real smoke/glow/mist the user wants to keep.
        if (!preserveContainedEdges && exteriorBg[idx] && isHaloAvg(s.avg)) continue;
        const colorIndex = s.bgLike && s.subjectBest >= 0 ? s.subjectBest : s.best;
        cells.push({ r, c, color: effectivePalette[colorIndex] });
      }
    }

    // Halo removal strips isolated stragglers, but it also eats legitimate
    // hard-edged pixels (panel rings, dome rims, sprite outlines). Pixel art
    // skips it entirely; other styles get a light single pass so subjects
    // whose silhouette uses bg-adjacent hues are not hollowed out.
    // Skip the post-pass halo scrub for painterly contained subjects so
    // eruption plumes, lava splatter, and rim glow aren't eroded away.
    const haloIterations = style === "pixelart"
      ? 0
      : preserveContainedEdges
        ? 0
        : (containedComposition ? 2 : 1);
    const cleanedCells = removeRectangularFrameArtifacts(
      removeRectangularPlateArtifacts(
        haloIterations > 0 ? removeHaloArtifacts(cells, haloIterations) : cells,
        bgRgb,
        prompt,
      ),
    );
    // For long-thin selections or repeated-subject layouts, skip the central
    // inset — it scales subjects down to fit a tiny short axis and ruins the
    // proportions. Only inset when the subject is a single contained object
    // in a roughly-square frame.
    const shouldInset = containedComposition && !longThinSelection && !wantsRepeatedDiscrete;
    const finalCells = shouldInset
      ? removeRectangularFrameArtifacts(
          removeRectangularPlateArtifacts(
            style === "pixelart" || preserveContainedEdges
              ? insetCellsWithPadding(cleanedCells, W, H, Math.max(3, Math.round(Math.min(W, H) * 0.12)))
              : removeHaloArtifacts(insetCellsWithPadding(cleanedCells, W, H, Math.max(3, Math.round(Math.min(W, H) * 0.12))), 1),
            bgRgb,
            prompt,
          ),
        )
      : cleanedCells;

    if (finalCells.length === 0) {
      return new Response(JSON.stringify({ error: "The generated image was too close to the map background. Try a more specific prompt." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chargeId = gate.byokOpenAiKey ? null : await chargeUsage(gate.userId!, gate.reservationId!, "map_draw", { model: iRoute.model, images: 1 });
    if (chargeId) reservationId = undefined;
    return new Response(JSON.stringify({ cells: finalCells, labels: [], rectWidth: W, rectHeight: H, chargeId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-map-draw fatal", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (reservedUserId && reservationId) {
      await releaseAiReservation(reservedUserId, reservationId, "map_draw_request_not_completed");
    }
  }
});
