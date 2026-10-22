import { useCallback, useEffect, useRef, type MutableRefObject, type Ref } from 'react';

/**
 * Liquid glass: an element whose rim bends what is behind it like thick
 * glass, with a lit rim, instead of only blurring it.
 *
 * The optics are ported from amazing-glass (MIT licence, © tomacco,
 * github.com/tomacco/amazing-glass, src/core/optics.ts and maps.ts): for
 * each pixel of the rim we take the slope of the glass surface, bend a view
 * ray through a slab of that thickness with Snell's law, and store how far it
 * moved in a displacement map. An SVG filter applies the map to the backdrop
 * once per colour channel (the rainbow edge), then frost, saturation and
 * contrast. A second map, the rim light, is painted over the glass as the
 * element's background image.
 *
 * Only Chromium applies SVG filters to `backdrop-filter`; Safari and Firefox
 * keep the element's own CSS frost, so callers keep their blur classes.
 */

export interface GlassParams {
  /** Frost radius of the backdrop blur, px. */
  blur: number;
  /** Colour saturation of the backdrop (1 = unchanged). */
  saturate: number;
  /** Brightness before contrast (1 = unchanged). */
  lum: number;
  /** Contrast around mid grey (1 = unchanged). */
  contrast: number;
  /** Rim width as a fraction of the short side, capped at `maxBezel` px. */
  bezel: number;
  maxBezel: number;
  /** Glass thickness relative to the rim width; thicker glass bends more. */
  depth: number;
  /** Index of refraction (1.5 is window glass). */
  ior: number;
  /** Extra bend for red and less for blue: the rainbow edge. */
  dispersion: number;
  /** Magnification of the flat middle (1 = none). */
  zoom: number;
  /** Strength and width (px) of the rim light, and the thin dark line inside it. */
  rim: number;
  rimWidth: number;
  shade: number;
  /** Direction the light comes from, degrees (-135 is the top left). */
  light: number;
}

/** Cards over the painted backgrounds: thick, lit glass with a visible rainbow edge. */
export const CARD_GLASS: GlassParams = {
  blur: 2.5, saturate: 1.7, lum: 1.04, contrast: 0.94,
  bezel: 0.42, maxBezel: 44, depth: 1.25, ior: 1.5, dispersion: 0.16, zoom: 1.05,
  rim: 0.5, rimWidth: 1, shade: 0.1, light: -135,
};

export const supportsLiquidGlass = typeof navigator !== 'undefined'
  && /\b(Chrome|Chromium)\/\d+/.test(navigator.userAgent) && !/\b(CriOS|FxiOS)\b/.test(navigator.userAgent);

/* ----------------------------- optics (amazing-glass) ----------------------------- */

interface ShapeSample { d: number; nx: number; ny: number }

/** Signed distance (negative inside) and outward normal of a rounded rectangle centred at 0. */
function roundedRect(px: number, py: number, hw: number, hh: number, r: number): ShapeSample {
  const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
  let d: number, nx: number, ny: number;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy);
    d = len - r; nx = qx / len; ny = qy / len;
  } else if (qx > qy) {
    d = qx - r; nx = 1; ny = 0;
  } else {
    d = qy - r; nx = 0; ny = 1;
  }
  return { d, nx: nx * Math.sign(px || 1), ny: ny * Math.sign(py || 1) };
}

/** Height of the glass at depth t into the rim (0 at the edge, 1 on the flat top): a squircle. */
const rimHeight = (t: number) => Math.pow(1 - Math.pow(1 - t, 4), 0.25);

/** Sideways shift, px, of a view ray entering the rim at depth t: thickness × tan(deviation). */
function refractOffset(t: number, bezelPx: number, thickness: number, ior: number) {
  if (t >= 1) return 0;
  const e = 0.001;
  const t0 = Math.max(t, e), t1 = Math.min(t0 + e, 1);
  const slope = ((rimHeight(t1) - rimHeight(t0)) / e) * thickness / bezelPx;
  const incidence = Math.atan(slope);
  return thickness * Math.tan(incidence - Math.asin(Math.sin(incidence) / ior));
}

function rimProfile(bezelPx: number, thickness: number, ior: number, samples = 64) {
  const table = new Float32Array(samples + 1);
  let max = 0;
  for (let i = 0; i <= samples; i++) { table[i] = refractOffset(i / samples, bezelPx, thickness, ior); max = Math.max(max, table[i]); }
  const at = (depth: number) => {
    if (depth <= 0) return 0;
    const f = Math.min(1, depth / bezelPx) * samples, i = Math.floor(f), fr = f - i;
    return i >= samples ? 0 : table[i] * (1 - fr) + table[i + 1] * fr;
  };
  return { at, max };
}

const clamp255 = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

function pngUrl(img: ImageData) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')?.putImageData(img, 0, 0);
  return c.toDataURL();
}

interface GlassMaps { displacement: string; specular: string; scale: number }
const mapCache = new Map<string, GlassMaps>();

/** Displacement map (R = x shift, G = y shift, 128 = none) and rim light, for a rounded rectangle. */
function glassMaps(w: number, h: number, radius: number, p: GlassParams): GlassMaps {
  const key = JSON.stringify([w, h, radius, p.bezel, p.maxBezel, p.depth, p.ior, p.zoom, p.rim, p.rimWidth, p.shade, p.light]);
  const hit = mapCache.get(key);
  if (hit) return hit;
  const r = Math.min(radius, w / 2, h / 2);
  const bezelPx = Math.max(4, Math.min(p.maxBezel, Math.min(w, h) * p.bezel));
  // The bend turns corners on an arc at least as wide as the rim: on a tighter
  // corner the two edges' bends meet along the diagonal in a visible crease.
  // Corner pixels outside that wider arc get the edge's full bend.
  const bendR = Math.min(Math.max(r, bezelPx), w / 2, h / 2);
  const bendSample = (px: number, py: number) => roundedRect(px - w / 2, py - h / 2, w / 2, h / 2, bendR);
  const profile = rimProfile(bezelPx, bezelPx * p.depth, p.ior);
  const zoom = p.zoom || 1;
  const scale = Math.max(1, (profile.max + (1 - 1 / zoom) * Math.max(w, h) / 2) * 2.1);
  const sample = (px: number, py: number) => roundedRect(px - w / 2, py - h / 2, w / 2, h / 2, r);

  // Displacement: smooth, so one sample per CSS pixel is plenty.
  const D = new ImageData(w, h), d32 = new Uint32Array(D.data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5, s = bendSample(px, py);
    const off = profile.at(Math.max(-s.d, 1e-3));
    let ox = -s.nx * off, oy = -s.ny * off;
    if (zoom !== 1) { ox -= (px - w / 2) * (1 - 1 / zoom); oy -= (py - h / 2) * (1 - 1 / zoom); }
    d32[y * w + x] = (255 << 24 | 128 << 16 | clamp255(128 + (oy / scale) * 255) << 8 | clamp255(128 + (ox / scale) * 255)) >>> 0;
  }

  // Rim light and inner shade, at device resolution so the line stays crisp.
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const sw = Math.ceil(w * dpr), sh = Math.ceil(h * dpr);
  const S = new ImageData(sw, sh), s32 = new Uint32Array(S.data.buffer);
  const la = (p.light * Math.PI) / 180, lx = Math.cos(la), ly = Math.sin(la);
  const rimPx = p.rimWidth * dpr, glow = bezelPx * 0.55 * dpr;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const s = sample((x + 0.5) / dpr, (y + 0.5) / dpr);
    const depth = -s.d * dpr;
    if (depth <= -1) continue;
    const facing = s.nx * lx + s.ny * ly;
    const lit = Math.pow(Math.max(0, facing), 1.6);
    const back = Math.pow(Math.max(0, -facing), 2.2) * 0.55;
    const aa = Math.min(1, depth + 1);
    const line = Math.exp(-Math.pow(depth / rimPx, 2)) * (0.22 + 0.78 * (lit + back));
    const soft = Math.exp(-depth / glow) * 0.22 * (lit + back * 0.6);
    const a = Math.min(1, (line + soft) * aa * p.rim);
    const shade = Math.exp(-Math.pow((depth - rimPx * 1.6) / (rimPx * 0.9), 2)) * p.shade * aa * (1 - lit);
    const v = shade > a ? 0 : 255;
    s32[y * sw + x] = (clamp255(Math.max(a, shade) * 255) << 24 | v << 16 | v << 8 | v) >>> 0;
  }

  const maps = { displacement: pngUrl(D), specular: pngUrl(S), scale };
  if (mapCache.size > 100) mapCache.clear();
  mapCache.set(key, maps);
  return maps;
}

/* ------------------------------------ filter ------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';
let defs: SVGDefsElement | null = null;
function filterDefs() {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

/** Frost, the bend once per colour channel (dispersion), recombined, then saturation and contrast. */
function filterMarkup(w: number, h: number, maps: GlassMaps, p: GlassParams) {
  const bend = (name: string, k: number) =>
    `<feDisplacementMap in="frost" in2="map" scale="${maps.scale * k}" xChannelSelector="R" yChannelSelector="G" result="d${name}"/>`;
  return `
    <feGaussianBlur in="SourceGraphic" stdDeviation="${p.blur}" result="frost"/>
    <feImage href="${maps.displacement}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    ${bend('r', 1 + p.dispersion)}${bend('g', 1)}${bend('b', 1 - p.dispersion)}
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
    <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
    <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" result="rgb"/>
    <feColorMatrix in="rgb" type="saturate" values="${p.saturate}" result="sat"/>
    <feComponentTransfer in="sat">${['R', 'G', 'B'].map(c =>
      `<feFunc${c} type="linear" slope="${p.lum * p.contrast}" intercept="${0.5 * (1 - p.contrast)}"/>`).join('')}</feComponentTransfer>`;
}

let nextId = 0;

/**
 * Turns the element it is attached to into liquid glass (in Chromium). Use
 * the returned ref on the element; it follows the element's size and corner
 * radius. Elsewhere it does nothing and the element keeps its CSS frost.
 *
 * The glass sees only what its ancestors let through: an ancestor with
 * opacity below 1, a filter, a mask or a blend mode hides the backdrop.
 */
export function useLiquidGlass<T extends HTMLElement>(params: Partial<GlassParams> = {}) {
  const p: GlassParams = { ...CARD_GLASS, ...params };
  const key = JSON.stringify(p);
  const cleanup = useRef<() => void>();

  const ref = useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = undefined;
    if (!el || !supportsLiquidGlass) return;
    const id = `liquid-glass-${nextId++}`;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    for (const [name, value] of Object.entries({ x: '0', y: '0', filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) filter.setAttribute(name, value);
    filterDefs().appendChild(filter);
    let frame = 0;
    const draw = () => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
      const maps = glassMaps(w, h, radius, p);
      filter.setAttribute('width', String(w));
      filter.setAttribute('height', String(h));
      filter.innerHTML = filterMarkup(w, h, maps, p);
      const value = `url(#${id})`;
      el.style.backdropFilter = value;
      el.style.setProperty('-webkit-backdrop-filter', value);
      // The rim light paints over the refracted backdrop, under the content.
      el.style.backgroundImage = `url(${maps.specular})`;
      el.style.backgroundSize = '100% 100%';
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); });
    observer.observe(el);
    draw();
    cleanup.current = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      filter.remove();
      for (const prop of ['backdrop-filter', '-webkit-backdrop-filter', 'background-image', 'background-size']) el.style.removeProperty(prop);
    };
    // The params are read through `key`, so new values make a new ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => cleanup.current?.(), []);
  return ref;
}

/** Joins refs, for elements that already have one (e.g. a sortable's node ref). */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (value: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(value);
      else if (r) (r as MutableRefObject<T | null>).current = value;
    }
  };
}
