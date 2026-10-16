/**
 * Pre-built pixel art map templates — top-down topographic style.
 * Large maps with organic, natural-looking borders and rich color palettes.
 * Labels mark key landmarks on each map.
 */

type CellData = Record<string, string>;

interface TemplateLabel {
  id: string;
  text: string;
  theme: string;
  themeBg: string;
  themeFg: string;
  grid_r: number;
  grid_c: number;
  _type: 'label';
}

// ── Expanded Palette ──

// Water — tropical & vivid
const OCEAN_ABYSS   = '#0d2b45';
const OCEAN_DEEP    = '#14556b';
const OCEAN_MID     = '#1f8ea3';
const OCEAN_LIGHT   = '#3ec5d6';
const OCEAN_SHALLOW = '#6ddee8';
const OCEAN_FOAM    = '#b0f0f0';
const LAGOON        = '#2ec4a6';
const LAGOON_DEEP   = '#1a9a7e';

// Sand & Shore — warm tropical
const BEACH_WET     = '#c9a87c';
const BEACH         = '#eed8b0';
const BEACH_WHITE   = '#faf0d8';
const CORAL_SAND    = '#f0c9a0';

// Tropical Vegetation
const PALM_LIGHT    = '#a0d840';
const PALM          = '#68b830';
const JUNGLE_LIGHT  = '#40a850';
const JUNGLE        = '#288040';
const JUNGLE_DEEP   = '#186830';
const JUNGLE_CANOPY = '#105020';
const FERN          = '#60b060';

// Temperate Vegetation
const GRASS_PALE    = '#c8e8a0';
const GRASS_LIGHT   = '#90c860';
const GRASS         = '#60a040';
const GRASS_DARK    = '#408830';
const FOREST        = '#286828';
const FOREST_DEEP   = '#184818';
const MOSS          = '#488838';

// Earth & Mountain
const EARTH_LIGHT   = '#c49a6c';
const EARTH         = '#8b6b3e';
const EARTH_DARK    = '#5c4228';
const VOLCANIC      = '#3a3a3a';

// Stone & Rock
const SNOW          = '#f0f4f8';
const SNOW_SHADOW   = '#d0dce8';
const STONE_LIGHT   = '#c0b8a8';
const STONE_MED     = '#908880';
const STONE_DARK    = '#606058';
const STONE_BLACK   = '#383830';

// Accents
const FLOWER_PINK   = '#e88ca0';
const FLOWER_RED    = '#d04050';
const FLOWER_VIOLET = '#9878c8';
const FLOWER_YELLOW = '#e8d040';
const FLOWER_ORANGE = '#e89040';
const LAVA          = '#e84830';
const LAVA_GLOW     = '#f8a040';
const GOLD          = '#c8a840';
const RUINS_STONE   = '#a8a088';

const CELL_SIZE = 28;

function dot(c: CellData, r: number, col: number, color: string) { c[`${r},${col}`] = color; }
function rect(c: CellData, r1: number, c1: number, r2: number, c2: number, color: string) {
  for (let r = r1; r <= r2; r++) for (let cc = c1; cc <= c2; cc++) c[`${r},${cc}`] = color;
}

function dist(r: number, c: number, cr: number, cc: number) {
  return Math.sqrt((r - cr) ** 2 + (c - cc) ** 2);
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function noise2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const sfx = fx * fx * (3 - 2 * fx);
  const sfy = fy * fy * (3 - 2 * fy);
  const a = noise2D(ix, iy, seed);
  const b = noise2D(ix + 1, iy, seed);
  const c = noise2D(ix, iy + 1, seed);
  const d = noise2D(ix + 1, iy + 1, seed);
  return a * (1 - sfx) * (1 - sfy) + b * sfx * (1 - sfy) + c * (1 - sfx) * sfy + d * sfx * sfy;
}

function fbm(x: number, y: number, octaves: number, scale: number, seed: number): number {
  let v = 0, amp = 1, s = scale, total = 0;
  for (let i = 0; i < octaves; i++) {
    v += smoothNoise(x, y, s, seed + i * 100) * amp;
    total += amp;
    amp *= 0.5;
    s *= 0.5;
  }
  return v / total;
}

function makeLabel(id: string, text: string, r: number, c: number, themeBg: string, themeFg: string, theme = 'clean-white'): TemplateLabel {
  return { id, text, theme, themeBg, themeFg, grid_r: r * CELL_SIZE, grid_c: c * CELL_SIZE, _type: 'label' };
}

/**
 * Organic edge mask — uses overlapping ellipses + noise to create natural-looking borders.
 * Returns a value 0..1 (0 = outside, 1 = fully inside).
 */
function edgeMask(r: number, c: number, H: number, W: number, shapes: { r: number; c: number; rx: number; ry: number; w: number }[]): number {
  let maxE = 0;
  for (const s of shapes) {
    const dr = (r - s.r) / s.ry;
    const dc = (c - s.c) / s.rx;
    const d = Math.sqrt(dr * dr + dc * dc);
    if (d < 1) {
      const e = s.w * (1 - d * d);
      maxE = Math.max(maxE, e);
    }
  }
  return maxE;
}

// ─── ISLAND MAP (200×250) ──────────────────────────────────
function buildIslandMap(): { cells: CellData; bg: string; labels: TemplateLabel[] } {
  const cells: CellData = {};
  const bg = OCEAN_MID;
  const W = 250, H = 200;

  // Main island shape using multiple overlapping ellipses
  const islandShapes = [
    { r: 95, c: 125, rx: 60, ry: 50, w: 1.0 },
    { r: 78, c: 95, rx: 40, ry: 35, w: 0.85 },
    { r: 105, c: 160, rx: 35, ry: 30, w: 0.75 },
    { r: 65, c: 135, rx: 28, ry: 24, w: 0.65 },
    { r: 120, c: 110, rx: 32, ry: 26, w: 0.7 },
    { r: 88, c: 75, rx: 24, ry: 22, w: 0.55 },
    { r: 115, c: 170, rx: 22, ry: 18, w: 0.5 },
    // Peninsula north
    { r: 50, c: 90, rx: 18, ry: 24, w: 0.45 },
    { r: 40, c: 85, rx: 12, ry: 16, w: 0.35 },
    // Peninsula south
    { r: 140, c: 140, rx: 15, ry: 20, w: 0.35 },
  ];

  // Small satellite islands
  const smallIslands = [
    { r: 38, c: 200, rx: 14, ry: 12 },
    { r: 42, c: 215, rx: 10, ry: 9 },
    { r: 160, c: 48, rx: 12, ry: 10 },
    { r: 165, c: 40, rx: 7, ry: 6 },
    { r: 28, c: 55, rx: 9, ry: 8 },
    { r: 155, c: 200, rx: 8, ry: 7 },
  ];

  const getIslandElev = (r: number, c: number): number => {
    let maxE = 0;
    for (const s of islandShapes) {
      const dr = (r - s.r) / s.ry;
      const dc = (c - s.c) / s.rx;
      const d = Math.sqrt(dr * dr + dc * dc);
      if (d < 1) {
        const e = s.w * (1 - d * d) * (1 - d * d);
        maxE = Math.max(maxE, e);
      }
    }
    // Add noise for organic edges
    const n = fbm(r, c, 2, 12, 42) * 0.12;
    return Math.max(0, maxE + n - 0.05);
  };

  const getSmallIslandElev = (r: number, c: number): number => {
    let maxE = 0;
    for (const s of smallIslands) {
      const dr = (r - s.r) / s.ry;
      const dc = (c - s.c) / s.rx;
      const d = Math.sqrt(dr * dr + dc * dc);
      if (d < 1) {
        const n = fbm(r, c, 2, 8, 77) * 0.08;
        const e = 0.4 * (1 - d * d) + n;
        maxE = Math.max(maxE, e);
      }
    }
    return maxE;
  };

  // Mountain peaks
  const peaks = [
    { r: 82, c: 118, h: 1.0, s: 14 },
    { r: 76, c: 108, h: 0.85, s: 12 },
    { r: 88, c: 125, h: 0.75, s: 10 },
    { r: 92, c: 105, h: 0.6, s: 9 },
    { r: 72, c: 122, h: 0.55, s: 8 },
  ];

  const getMtnElev = (r: number, c: number): number => {
    let v = 0;
    for (const p of peaks) {
      const d = dist(r, c, p.r, p.c);
      if (d < p.s * 2) v += p.h * Math.max(0, 1 - (d / (p.s * 1.5)) ** 2);
    }
    return v;
  };

  // River
  const riverPath = (r: number): number => 118 + Math.sin(r * 0.04) * 15 + Math.sin(r * 0.09) * 5 + (r - 80) * 0.2;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const elev = getIslandElev(r, c);
      const smallElev = getSmallIslandElev(r, c);
      const totalElev = Math.max(elev, smallElev);
      const mtn = getMtnElev(r, c);
      const n = fbm(r, c, 3, 15, 42);

      const isOnIsland = elev > 0.15;
      const riverC = riverPath(r);
      const riverDist = Math.abs(c - riverC);
      const isRiver = isOnIsland && r >= 78 && r <= 130 && riverDist < 2;
      const isRiverEdge = isOnIsland && r >= 78 && r <= 130 && riverDist >= 2 && riverDist < 3.5;

      let color: string;

      if (isRiver) {
        color = LAGOON_DEEP;
      } else if (isRiverEdge) {
        color = LAGOON;
      } else if (totalElev > 0.15) {
        const landElev = totalElev + mtn * 0.5 + n * 0.08;

        if (mtn > 0.8) color = SNOW;
        else if (mtn > 0.65) color = SNOW_SHADOW;
        else if (mtn > 0.5) color = STONE_LIGHT;
        else if (mtn > 0.35) color = STONE_MED;
        else if (mtn > 0.2) color = STONE_DARK;
        else if (landElev > 0.7) color = n > 0.55 ? JUNGLE_CANOPY : JUNGLE_DEEP;
        else if (landElev > 0.55) color = n > 0.5 ? JUNGLE_DEEP : JUNGLE;
        else if (landElev > 0.4) color = n > 0.6 ? JUNGLE : JUNGLE_LIGHT;
        else if (landElev > 0.3) color = n > 0.5 ? PALM : PALM_LIGHT;
        else if (totalElev > 0.22) color = n > 0.55 ? GRASS_LIGHT : GRASS_PALE;
        else if (totalElev > 0.19) color = BEACH;
        else color = BEACH_WHITE;
      } else if (totalElev > 0.1) {
        color = OCEAN_FOAM;
      } else if (totalElev > 0.06) {
        color = OCEAN_SHALLOW;
      } else {
        // Ocean — only draw near the island, skip far-out cells for organic edge
        const distToCenter = dist(r, c, 95, 125);
        if (distToCenter > 110) continue; // skip = no cell = organic fade
        
        const oceanN = fbm(r, c, 2, 25, 99);
        const depthFactor = (distToCenter / 100) * 0.6 + oceanN * 0.3;

        if (depthFactor > 0.7) color = OCEAN_ABYSS;
        else if (depthFactor > 0.55) color = OCEAN_DEEP;
        else if (depthFactor > 0.35) color = OCEAN_MID;
        else color = OCEAN_LIGHT;
      }
      dot(cells, r, c, color);
    }
  }

  // Lagoon on east coast
  const lagoonCenter = { r: 95, c: 172 };
  for (let r = lagoonCenter.r - 14; r <= lagoonCenter.r + 14; r++) {
    for (let c = lagoonCenter.c - 16; c <= lagoonCenter.c + 16; c++) {
      const d = dist(r, c, lagoonCenter.r, lagoonCenter.c);
      const n = fbm(r, c, 2, 8, 77);
      const threshold = 11 + n * 4;
      if (d < threshold - 2 && getIslandElev(r, c) > 0.2) {
        dot(cells, r, c, d < threshold - 6 ? LAGOON_DEEP : LAGOON);
      } else if (d < threshold && getIslandElev(r, c) > 0.18) {
        dot(cells, r, c, BEACH);
      }
    }
  }

  // Coral reefs
  const reefSpots = [
    { r: 50, c: 170, s: 9 }, { r: 135, c: 185, s: 7 },
    { r: 148, c: 85, s: 8 }, { r: 32, c: 75, s: 6 },
    { r: 55, c: 50, s: 7 },
  ];
  for (const reef of reefSpots) {
    for (let dr = -reef.s; dr <= reef.s; dr++) {
      for (let dc = -reef.s; dc <= reef.s; dc++) {
        const rr = reef.r + dr, cc = reef.c + dc;
        if (rr < 0 || rr >= H || cc < 0 || cc >= W) continue;
        const d = dist(rr, cc, reef.r, reef.c);
        if (d < reef.s && noise2D(rr, cc, 55) > 0.6) {
          const existing = cells[`${rr},${cc}`];
          if (existing === OCEAN_LIGHT || existing === OCEAN_SHALLOW || existing === OCEAN_FOAM) {
            dot(cells, rr, cc, noise2D(rr, cc, 88) > 0.5 ? CORAL_SAND : FLOWER_PINK);
          }
        }
      }
    }
  }

  // Volcano
  for (let r = 78; r <= 86; r++) {
    for (let c = 114; c <= 122; c++) {
      const d = dist(r, c, 82, 118);
      if (d < 2) dot(cells, r, c, LAVA);
      else if (d < 3) dot(cells, r, c, LAVA_GLOW);
      else if (d < 4.5) dot(cells, r, c, VOLCANIC);
    }
  }

  // Village on south coast
  const villageR = 122, villageC = 142;
  for (let i = 0; i < 8; i++) {
    const hr = villageR + Math.floor(i / 4) * 4;
    const hc = villageC + (i % 4) * 5;
    rect(cells, hr, hc, hr + 2, hc + 2, EARTH_LIGHT);
    dot(cells, hr - 1, hc + 1, FLOWER_RED);
  }
  for (let c = villageC; c < villageC + 12; c++) {
    dot(cells, villageR + 10, c, EARTH_DARK);
    dot(cells, villageR + 11, c, EARTH_DARK);
  }

  // Flowers
  const rng = seededRandom(123);
  for (let i = 0; i < 180; i++) {
    const fr = Math.floor(rng() * H);
    const fc = Math.floor(rng() * W);
    const existing = cells[`${fr},${fc}`];
    if (existing === JUNGLE_LIGHT || existing === PALM_LIGHT || existing === FERN) {
      const colors = [FLOWER_PINK, FLOWER_VIOLET, FLOWER_YELLOW, FLOWER_ORANGE];
      dot(cells, fr, fc, colors[Math.floor(rng() * colors.length)]);
    }
  }

  // Waterfall
  for (let r = 78; r <= 85; r++) {
    const wc = Math.round(riverPath(78));
    dot(cells, r, wc, OCEAN_FOAM);
    dot(cells, r, wc - 1, OCEAN_SHALLOW);
    dot(cells, r, wc + 1, OCEAN_SHALLOW);
  }

  const labels: TemplateLabel[] = [
    makeLabel('isl-volcano', '🌋 Volcano Peak', 68, 108, '#3a3a3a', '#f8a040'),
    makeLabel('isl-lagoon', '💎 Crystal Lagoon', 100, 175, '#1a9a7e', '#f0f4f8'),
    makeLabel('isl-village', '🏘️ Palm Village', 128, 140, '#eed8b0', '#5c4228'),
    makeLabel('isl-reef', '🪸 Coral Reef', 52, 165, '#f0c9a0', '#d04050'),
    makeLabel('isl-jungle', '🌴 Deep Jungle', 90, 85, '#186830', '#a0d840'),
    makeLabel('isl-peninsula', '🏖️ Sandy Point', 42, 78, '#faf0d8', '#8b6b3e'),
  ];

  return { cells, bg, labels };
}

// ─── FANTASY CITY (200×250) ────────────────────────────────
function buildFantasyCityMap(): { cells: CellData; bg: string; labels: TemplateLabel[] } {
  const cells: CellData = {};
  const bg = '#b8d880'; // light meadow
  const W = 250, H = 200;

  // Organic land shapes — the "continent" that contains the city
  const landShapes = [
    { r: 100, c: 125, rx: 120, ry: 95, w: 1.0 },
    { r: 80, c: 80, rx: 70, ry: 60, w: 0.8 },
    { r: 120, c: 170, rx: 65, ry: 55, w: 0.75 },
    { r: 50, c: 140, rx: 50, ry: 40, w: 0.6 },
    { r: 150, c: 100, rx: 55, ry: 45, w: 0.65 },
    { r: 100, c: 40, rx: 35, ry: 50, w: 0.5 },
    { r: 100, c: 210, rx: 35, ry: 45, w: 0.5 },
    { r: 30, c: 100, rx: 40, ry: 25, w: 0.4 },
    { r: 170, c: 150, rx: 40, ry: 25, w: 0.4 },
  ];

  const getLandElev = (r: number, c: number): number => {
    let maxE = 0;
    for (const s of landShapes) {
      const dr = (r - s.r) / s.ry;
      const dc = (c - s.c) / s.rx;
      const d = Math.sqrt(dr * dr + dc * dc);
      if (d < 1) {
        const e = s.w * (1 - d * d);
        maxE = Math.max(maxE, e);
      }
    }
    const n = fbm(r, c, 2, 15, 200) * 0.1;
    return Math.max(0, maxE + n - 0.03);
  };

  // Base terrain
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const land = getLandElev(r, c);
      if (land < 0.05) continue; // skip = organic edge

      const n1 = fbm(r, c, 3, 20, 200);
      const forestN = fbm(r, c, 3, 15, 150);

      // Hills in corners
      const cornerDist = Math.min(
        dist(r, c, 0, 0), dist(r, c, 0, W), dist(r, c, H, 0), dist(r, c, H, W)
      ) / 60;
      const hilliness = Math.max(0, 1 - cornerDist) * n1;

      let color: string;
      if (land < 0.1) {
        // Thin edge — pale grass for organic fade
        color = GRASS_PALE;
      } else if (hilliness > 0.6) {
        color = STONE_MED;
      } else if (hilliness > 0.45) {
        color = MOSS;
      } else if (forestN > 0.65 && n1 > 0.4) {
        color = FOREST_DEEP;
      } else if (forestN > 0.55) {
        color = FOREST;
      } else if (forestN > 0.45) {
        color = GRASS_DARK;
      } else if (n1 > 0.55) {
        color = GRASS;
      } else {
        color = GRASS_LIGHT;
      }
      dot(cells, r, c, color);
    }
  }

  // River (west to east)
  for (let c = 0; c < W; c++) {
    const land = getLandElev(145, c);
    if (land < 0.05) continue;
    const riverR = 145 + Math.sin(c * 0.02) * 20 + Math.sin(c * 0.05) * 8;
    for (let dr = -3; dr <= 3; dr++) {
      const rr = Math.round(riverR + dr);
      if (rr < 0 || rr >= H || getLandElev(rr, c) < 0.05) continue;
      dot(cells, rr, c, Math.abs(dr) < 2 ? OCEAN_MID : OCEAN_SHALLOW);
    }
    for (const ddr of [-4, -5, 4, 5]) {
      const rr = Math.round(riverR + ddr);
      if (rr >= 0 && rr < H && getLandElev(rr, c) > 0.05) {
        dot(cells, rr, c, GRASS_PALE);
      }
    }
  }

  // Tributary from north
  for (let r = 0; r < 150; r++) {
    const tribC = 180 + Math.sin(r * 0.04) * 10 + Math.sin(r * 0.08) * 4;
    for (let dc = -1; dc <= 1; dc++) {
      const cc = Math.round(tribC + dc);
      if (cc >= 0 && cc < W && getLandElev(r, cc) > 0.05) {
        dot(cells, r, cc, dc === 0 ? OCEAN_MID : OCEAN_SHALLOW);
      }
    }
  }

  // City walls — large oval
  const wallCR = 90, wallCC = 120, wallRX = 40, wallRY = 35;
  for (let r = wallCR - wallRY - 5; r <= wallCR + wallRY + 5; r++) {
    for (let c = wallCC - wallRX - 5; c <= wallCC + wallRX + 5; c++) {
      if (r < 0 || r >= H || c < 0 || c >= W) continue;
      const dr = (r - wallCR) / wallRY;
      const dc = (c - wallCC) / wallRX;
      const d = Math.sqrt(dr * dr + dc * dc);
      if (d <= 0.88) {
        const n = noise2D(r, c, 500);
        dot(cells, r, c, n > 0.6 ? BEACH : BEACH_WET);
      } else if (d <= 1.0) {
        dot(cells, r, c, STONE_DARK);
      } else if (d <= 1.04) {
        dot(cells, r, c, STONE_MED);
      }
    }
  }

  // Gates
  const gatePositions = [
    { r: wallCR - wallRY, c: wallCC, dir: 'h' as const },
    { r: wallCR + wallRY, c: wallCC, dir: 'h' as const },
    { r: wallCR, c: wallCC + wallRX, dir: 'v' as const },
    { r: wallCR, c: wallCC - wallRX, dir: 'v' as const },
  ];
  for (const gate of gatePositions) {
    if (gate.dir === 'h') {
      for (let dc = -3; dc <= 3; dc++) for (let dr = -2; dr <= 2; dr++) dot(cells, gate.r + dr, gate.c + dc, BEACH);
      dot(cells, gate.r, gate.c - 4, STONE_BLACK);
      dot(cells, gate.r, gate.c + 4, STONE_BLACK);
    } else {
      for (let dr = -3; dr <= 3; dr++) for (let dc = -2; dc <= 2; dc++) dot(cells, gate.r + dr, gate.c + dc, BEACH);
      dot(cells, gate.r - 4, gate.c, STONE_BLACK);
      dot(cells, gate.r + 4, gate.c, STONE_BLACK);
    }
  }

  // Wall towers
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    const tr = Math.round(wallCR + wallRY * Math.sin(rad));
    const tc = Math.round(wallCC + wallRX * Math.cos(rad));
    rect(cells, tr - 1, tc - 1, tr + 1, tc + 1, STONE_BLACK);
    dot(cells, tr, tc, FLOWER_RED);
  }

  // Roads
  rect(cells, wallCR - wallRY + 3, wallCC - 1, wallCR + wallRY - 3, wallCC + 1, STONE_MED);
  rect(cells, wallCR - 1, wallCC - wallRX + 3, wallCR + 1, wallCC + wallRX - 3, STONE_MED);

  // Central plaza
  for (let r = wallCR - 8; r <= wallCR + 8; r++) {
    for (let c = wallCC - 8; c <= wallCC + 8; c++) {
      if (dist(r, c, wallCR, wallCC) <= 8) dot(cells, r, c, STONE_LIGHT);
    }
  }
  for (let r = wallCR - 3; r <= wallCR + 3; r++) {
    for (let c = wallCC - 3; c <= wallCC + 3; c++) {
      if (dist(r, c, wallCR, wallCC) <= 3) dot(cells, r, c, OCEAN_SHALLOW);
    }
  }
  dot(cells, wallCR, wallCC, OCEAN_MID);

  // Castle
  const castleR = 65, castleC = 120;
  rect(cells, castleR, castleC - 12, castleR + 16, castleC + 12, STONE_DARK);
  rect(cells, castleR + 1, castleC - 11, castleR + 15, castleC + 11, STONE_MED);
  rect(cells, castleR + 3, castleC - 8, castleR + 13, castleC + 8, STONE_LIGHT);
  rect(cells, castleR + 5, castleC - 5, castleR + 11, castleC + 5, GRASS_PALE);
  dot(cells, castleR + 8, castleC, FLOWER_YELLOW);
  for (const [tr, tc] of [[castleR, castleC - 12], [castleR, castleC + 12], [castleR + 16, castleC - 12], [castleR + 16, castleC + 12]]) {
    rect(cells, tr - 2, tc - 2, tr + 2, tc + 2, STONE_BLACK);
    dot(cells, tr, tc, GOLD);
  }

  // Market (SW)
  for (let i = 0; i < 12; i++) {
    const mr = 95 + Math.floor(i / 4) * 6;
    const mc = 90 + (i % 4) * 7;
    rect(cells, mr, mc, mr + 3, mc + 4, EARTH_LIGHT);
    dot(cells, mr - 1, mc + 2, FLOWER_ORANGE);
  }

  // Temple (SE)
  const templeR = 95, templeC = 148;
  rect(cells, templeR, templeC, templeR + 12, templeC + 10, RUINS_STONE);
  rect(cells, templeR + 2, templeC + 2, templeR + 10, templeC + 8, STONE_LIGHT);
  rect(cells, templeR - 1, templeC + 3, templeR - 1, templeC + 7, FLOWER_VIOLET);
  dot(cells, templeR + 6, templeC + 5, GOLD);

  // Garden (NE)
  for (let r = 68; r <= 85; r++) {
    for (let c = 135; c <= 155; c++) {
      const d2 = dist(r, c, 76, 145);
      if (d2 < 12) {
        const n = noise2D(r, c, 777);
        if (n > 0.7) dot(cells, r, c, FLOWER_PINK);
        else if (n > 0.5) dot(cells, r, c, FLOWER_VIOLET);
        else dot(cells, r, c, GRASS_PALE);
      }
    }
  }

  // Roads out from gates
  for (let r = 0; r < wallCR - wallRY; r++) {
    if (getLandElev(r, wallCC) > 0.05) { dot(cells, r, wallCC - 1, EARTH_LIGHT); dot(cells, r, wallCC, EARTH_LIGHT); dot(cells, r, wallCC + 1, EARTH_LIGHT); }
  }
  for (let r = wallCR + wallRY; r < 140; r++) {
    if (getLandElev(r, wallCC) > 0.05) { dot(cells, r, wallCC - 1, EARTH_LIGHT); dot(cells, r, wallCC, EARTH_LIGHT); dot(cells, r, wallCC + 1, EARTH_LIGHT); }
  }
  for (let c = wallCC + wallRX; c < W; c++) {
    if (getLandElev(wallCR, c) > 0.05) { dot(cells, wallCR - 1, c, EARTH_LIGHT); dot(cells, wallCR, c, EARTH_LIGHT); dot(cells, wallCR + 1, c, EARTH_LIGHT); }
  }
  for (let c = 0; c < wallCC - wallRX; c++) {
    if (getLandElev(wallCR, c) > 0.05) { dot(cells, wallCR - 1, c, EARTH_LIGHT); dot(cells, wallCR, c, EARTH_LIGHT); dot(cells, wallCR + 1, c, EARTH_LIGHT); }
  }

  // Bridge over river
  rect(cells, 140, wallCC - 3, 155, wallCC + 3, STONE_DARK);

  // Farms south of river
  for (let fi = 0; fi < 6; fi++) {
    const fr = 160 + (fi % 2) * 12;
    const fc = 80 + Math.floor(fi / 2) * 25;
    for (let r = fr; r < fr + 8; r++) {
      for (let c = fc; c < fc + 18; c++) {
        if (getLandElev(r, c) > 0.1) {
          const n = noise2D(r, c, 600);
          dot(cells, r, c, n > 0.5 ? GRASS_PALE : FLOWER_YELLOW);
        }
      }
    }
  }

  const labels: TemplateLabel[] = [
    makeLabel('fc-castle', '🏰 Royal Castle', 58, 110, '#606058', '#f0f4f8'),
    makeLabel('fc-plaza', '⛲ Grand Plaza', 98, 112, '#c0b8a8', '#383830'),
    makeLabel('fc-market', '🛒 Market Quarter', 105, 85, '#c49a6c', '#5c4228'),
    makeLabel('fc-temple', '🏛️ Temple of Light', 109, 145, '#9878c8', '#f0f4f8'),
    makeLabel('fc-farms', '🌾 Farmlands', 164, 100, '#c8e8a0', '#408830'),
    makeLabel('fc-garden', '🌸 Royal Gardens', 86, 140, '#e88ca0', '#184818'),
  ];

  return { cells, bg, labels };
}

// ─── NATURE MAP (200×260) ──────────────────────────────────
function buildNatureMap(): { cells: CellData; bg: string; labels: TemplateLabel[] } {
  const cells: CellData = {};
  const bg = '#a0c870'; // meadow green
  const W = 260, H = 200;

  // Organic land mask — large continent with natural edges
  const landShapes = [
    { r: 100, c: 130, rx: 130, ry: 100, w: 1.0 },
    { r: 60, c: 100, rx: 80, ry: 60, w: 0.8 },
    { r: 140, c: 160, rx: 70, ry: 55, w: 0.7 },
    { r: 40, c: 160, rx: 55, ry: 40, w: 0.6 },
    { r: 160, c: 80, rx: 60, ry: 40, w: 0.6 },
    { r: 100, c: 30, rx: 35, ry: 55, w: 0.5 },
    { r: 100, c: 230, rx: 35, ry: 50, w: 0.5 },
    { r: 20, c: 130, rx: 50, ry: 20, w: 0.4 },
    { r: 180, c: 130, rx: 50, ry: 20, w: 0.4 },
  ];

  const getLandElev = (r: number, c: number): number => {
    let maxE = 0;
    for (const s of landShapes) {
      const dr = (r - s.r) / s.ry;
      const dc = (c - s.c) / s.rx;
      const d = Math.sqrt(dr * dr + dc * dc);
      if (d < 1) {
        const e = s.w * (1 - d * d);
        maxE = Math.max(maxE, e);
      }
    }
    const n = fbm(r, c, 2, 15, 400) * 0.1;
    return Math.max(0, maxE + n - 0.03);
  };

  // Mountain range across the top
  const getMtnElev = (r: number, c: number): number => {
    const peaks = [
      { r: 30, c: 80, h: 2.0, s: 25 },
      { r: 25, c: 110, h: 2.5, s: 30 },
      { r: 35, c: 145, h: 2.2, s: 28 },
      { r: 20, c: 170, h: 1.8, s: 22 },
      { r: 30, c: 55, h: 1.5, s: 18 },
      { r: 40, c: 130, h: 1.3, s: 15 },
      { r: 28, c: 195, h: 1.2, s: 18 },
      { r: 22, c: 140, h: 1.6, s: 12 },
      { r: 38, c: 100, h: 1.0, s: 14 },
      { r: 15, c: 90, h: 0.8, s: 10 },
    ];
    let v = 0;
    for (const p of peaks) {
      const d = dist(r, c, p.r, p.c);
      v += p.h * Math.max(0, 1 - (d / p.s) ** 2);
    }
    return v;
  };

  // Forest areas
  const getForestDensity = (r: number, c: number): number => {
    const zones = [
      { r: 80, c: 40, s: 35 },
      { r: 90, c: 30, s: 25 },
      { r: 100, c: 55, s: 20 },
      { r: 70, c: 20, s: 20 },
      { r: 110, c: 15, s: 18 },
      { r: 120, c: 210, s: 30 },
      { r: 130, c: 230, s: 25 },
      { r: 110, c: 220, s: 20 },
      { r: 140, c: 200, s: 18 },
    ];
    let v = 0;
    for (const z of zones) {
      const d = dist(r, c, z.r, z.c);
      v += Math.max(0, 1 - (d / z.s) ** 2);
    }
    return v;
  };

  // River
  const riverPath = (r: number): number => {
    if (r < 40) return 120 + Math.sin(r * 0.1) * 5;
    return 120 + Math.sin(r * 0.03) * 25 + Math.sin(r * 0.07) * 10 + (r - 40) * 0.15;
  };

  // Lake
  const lakeCenter = { r: 140, c: 160 };
  const getLakeDepth = (r: number, c: number): number => {
    const dr = (r - lakeCenter.r) / 20;
    const dc = (c - lakeCenter.c) / 25;
    const d = Math.sqrt(dr * dr + dc * dc);
    const n = fbm(r, c, 2, 10, 500) * 0.3;
    return Math.max(0, 1 - d - n);
  };

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const land = getLandElev(r, c);
      if (land < 0.05) continue; // organic edge

      const mtn = getMtnElev(r, c);
      const forest = getForestDensity(r, c);
      const n = fbm(r, c, 3, 18, 400);
      const lake = getLakeDepth(r, c);

      const rc = riverPath(r);
      const riverDist = Math.abs(c - rc);
      const riverWidth = r < 60 ? 1.5 : 2.5;
      const isRiver = r >= 35 && riverDist < riverWidth;
      const isRiverEdge = r >= 35 && riverDist >= riverWidth && riverDist < riverWidth + 1.5;

      let color: string;

      if (lake > 0.6) color = OCEAN_DEEP;
      else if (lake > 0.4) color = OCEAN_MID;
      else if (lake > 0.2) color = OCEAN_SHALLOW;
      else if (lake > 0.05) color = OCEAN_FOAM;
      else if (lake > 0 && lake > -0.05) color = BEACH;
      else if (isRiver) color = OCEAN_MID;
      else if (isRiverEdge) color = OCEAN_SHALLOW;
      else if (mtn > 2.0) color = SNOW;
      else if (mtn > 1.7) color = SNOW_SHADOW;
      else if (mtn > 1.4) color = STONE_LIGHT;
      else if (mtn > 1.1) color = STONE_MED;
      else if (mtn > 0.8) color = STONE_DARK;
      else if (mtn > 0.55) color = n > 0.5 ? MOSS : EARTH_LIGHT;
      else if (mtn > 0.35) color = n > 0.55 ? GRASS_DARK : GRASS;
      else if (mtn > 0.15) color = GRASS_PALE;
      else if (forest > 1.2) color = FOREST_DEEP;
      else if (forest > 0.8) color = FOREST;
      else if (forest > 0.5) color = GRASS_DARK;
      else if (forest > 0.3) color = GRASS;
      else if (land < 0.1) color = GRASS_PALE; // thin edge fade
      else color = n > 0.55 ? GRASS : GRASS_LIGHT;

      dot(cells, r, c, color);
    }
  }

  // Waterfall
  for (let r = 35; r <= 45; r++) {
    const wc = Math.round(riverPath(35));
    if (getLandElev(r, wc) > 0.05) {
      dot(cells, r, wc, OCEAN_FOAM);
      dot(cells, r, wc - 1, OCEAN_FOAM);
      dot(cells, r, wc + 1, OCEAN_SHALLOW);
    }
  }

  // Meadow flowers
  const meadowR = 100, meadowC = 140;
  const rng = seededRandom(789);
  for (let i = 0; i < 200; i++) {
    const fr = meadowR + Math.floor(rng() * 40) - 20;
    const fc = meadowC + Math.floor(rng() * 50) - 25;
    if (fr < 0 || fr >= H || fc < 0 || fc >= W) continue;
    const existing = cells[`${fr},${fc}`];
    if (existing === GRASS_LIGHT || existing === GRASS || existing === GRASS_PALE) {
      const colors = [FLOWER_PINK, FLOWER_VIOLET, FLOWER_YELLOW, FLOWER_ORANGE, FLOWER_RED];
      dot(cells, fr, fc, colors[Math.floor(rng() * colors.length)]);
    }
  }

  // Cabin
  const cabinR = 85, cabinC = 35;
  if (getLandElev(cabinR, cabinC) > 0.1) {
    for (let r = cabinR - 5; r <= cabinR + 7; r++) {
      for (let c = cabinC - 6; c <= cabinC + 8; c++) {
        if (dist(r, c, cabinR + 1, cabinC + 1) < 6) dot(cells, r, c, GRASS_LIGHT);
      }
    }
    rect(cells, cabinR, cabinC, cabinR + 4, cabinC + 5, EARTH_LIGHT);
    rect(cells, cabinR - 1, cabinC - 1, cabinR - 1, cabinC + 6, FLOWER_RED);
    dot(cells, cabinR + 3, cabinC + 2, EARTH_DARK);
    dot(cells, cabinR + 3, cabinC + 3, EARTH_DARK);
  }

  // Path from cabin to river
  const pathR = cabinR + 4;
  for (let c = cabinC + 6; c < Math.round(riverPath(pathR)); c++) {
    const pr = pathR + Math.round(Math.sin(c * 0.15) * 1);
    if (getLandElev(pr, c) > 0.05) dot(cells, pr, c, BEACH);
  }

  // Stone bridge
  const bridgeR = 85;
  const bridgeC = Math.round(riverPath(bridgeR));
  rect(cells, bridgeR - 2, bridgeC - 3, bridgeR + 2, bridgeC + 3, STONE_MED);
  dot(cells, bridgeR - 2, bridgeC - 3, STONE_DARK);
  dot(cells, bridgeR - 2, bridgeC + 3, STONE_DARK);
  dot(cells, bridgeR + 2, bridgeC - 3, STONE_DARK);
  dot(cells, bridgeR + 2, bridgeC + 3, STONE_DARK);

  // Ruins near lake
  const ruinsR = 155, ruinsC = 185;
  if (getLandElev(ruinsR, ruinsC) > 0.1) {
    rect(cells, ruinsR, ruinsC, ruinsR + 8, ruinsC + 10, RUINS_STONE);
    for (let i = 0; i < 6; i++) {
      const rr = ruinsR + Math.floor(rng() * 8);
      const rc = ruinsC + Math.floor(rng() * 10);
      dot(cells, rr, rc, STONE_DARK);
    }
    rect(cells, ruinsR + 2, ruinsC + 3, ruinsR + 6, ruinsC + 7, GRASS_PALE);
    dot(cells, ruinsR + 4, ruinsC + 5, FLOWER_VIOLET);
  }

  const labels: TemplateLabel[] = [
    makeLabel('nat-peaks', '🏔️ Snow Peaks', 12, 100, '#c0b8a8', '#383830'),
    makeLabel('nat-waterfall', '💧 Misty Falls', 47, 115, '#6ddee8', '#0d2b45'),
    makeLabel('nat-cabin', '🏡 Forest Cabin', 92, 28, '#c49a6c', '#f0f4f8'),
    makeLabel('nat-lake', '🌊 Mirror Lake', 148, 155, '#3ec5d6', '#0d2b45'),
    makeLabel('nat-ruins', '🏚️ Ancient Ruins', 165, 183, '#a8a088', '#383830'),
    makeLabel('nat-meadow', '🌸 Flower Meadow', 108, 130, '#e88ca0', '#184818'),
    makeLabel('nat-forest', '🌲 Dark Woods', 75, 15, '#184818', '#c8e8a0'),
  ];

  return { cells, bg, labels };
}

export interface MapTemplate {
  title: string;
  cells: CellData;
  bg_color: string;
  placed_notebooks: any[];
  /** Old title for migration matching */
  legacyTitle?: string;
}

export function getMapTemplates(): MapTemplate[] {
  const island = buildIslandMap();
  const city = buildFantasyCityMap();
  const nature = buildNatureMap();

  return [
    { title: '🏝️ Island', cells: island.cells, bg_color: island.bg, placed_notebooks: island.labels, legacyTitle: 'Island' },
    { title: '🏰 Fantasy City', cells: city.cells, bg_color: city.bg, placed_notebooks: city.labels, legacyTitle: 'Fantasy City' },
    { title: '🌿 Nature', cells: nature.cells, bg_color: nature.bg, placed_notebooks: nature.labels, legacyTitle: 'Nature' },
  ];
}
