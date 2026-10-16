import * as React from 'react';

/**
 * Sample the visual background underneath a popover/dropdown to decide whether
 * the floating surface should render in its "light" or "dark" variant.
 *
 * Strategy: when `open` flips to true, on the next animation frame we sample a
 * small grid of points immediately around the trigger element (the popover is
 * not yet measurable). For each point we walk `elementsFromPoint` skipping the
 * trigger / portal layers, find the first opaque background-color, and average
 * the perceived luminance. < 0.5 → "dark", else "light".
 */
export type AdaptiveSurface = 'light' | 'dark';

const TRANSPARENT_RE = /rgba?\([^)]*,\s*0(?:\.0+)?\s*\)/i;

function parseRgb(input: string): [number, number, number, number] | null {
  const m = input.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(',').map(s => parseFloat(s.trim()));
  if (parts.length < 3) return null;
  const [r, g, b, a = 1] = parts;
  return [r, g, b, isNaN(a) ? 1 : a];
}

function relLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function firstOpaqueAt(x: number, y: number): [number, number, number] | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    // Walk popover/portal layers — anything still in the popper tree.
    if ((el as HTMLElement).dataset?.surface) continue;
    if (el.closest?.('[data-radix-popper-content-wrapper]')) continue;
    // Walk up the DOM from each candidate so transparent text containers
    // resolve to their first opaque ancestor (editor surface, page bg, etc.).
    let cur: Element | null = el;
    while (cur) {
      const cs = getComputedStyle(cur as HTMLElement);
      const bg = cs.backgroundColor;
      if (bg && bg !== 'transparent' && !TRANSPARENT_RE.test(bg)) {
        const rgb = parseRgb(bg);
        if (rgb && rgb[3] >= 0.4) return [rgb[0], rgb[1], rgb[2]];
      }
      cur = cur.parentElement;
    }
  }
  const cs = getComputedStyle(document.body);
  const rgb = parseRgb(cs.backgroundColor);
  return rgb ? [rgb[0], rgb[1], rgb[2]] : null;
}

export function detectSurfaceForRect(
  rect: DOMRect,
  _skip: Element[] = [],
  hideEl?: HTMLElement | null,
): AdaptiveSurface {
  // Temporarily hide the popover surface itself so elementsFromPoint
  // returns what's actually underneath it.
  const prevVis = hideEl?.style.visibility;
  if (hideEl) hideEl.style.visibility = 'hidden';
  try {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const below = Math.min(window.innerHeight - 2, rect.bottom + 24);
    const candidates: Array<[number, number]> = [
      [cx, cy],
      [rect.left + 4, cy],
      [rect.right - 4, cy],
      [cx, below],
      [rect.left + 4, below],
      [rect.right - 4, below],
    ];
    let total = 0;
    let count = 0;
    for (const [x, y] of candidates) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const rgb = firstOpaqueAt(x, y);
      if (!rgb) continue;
      total += relLuminance(rgb[0], rgb[1], rgb[2]);
      count += 1;
    }
    if (count === 0) {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    const avg = total / count;
    return avg < 0.5 ? 'dark' : 'light';
  } finally {
    if (hideEl) hideEl.style.visibility = prevVis ?? '';
  }
}

export function useAdaptiveSurfaceTheme(
  triggerRef: React.RefObject<Element | null>,
  open: boolean,
): AdaptiveSurface {
  const [surface, setSurface] = React.useState<AdaptiveSurface>('light');
  React.useEffect(() => {
    if (!open) return;
    const el = triggerRef.current as HTMLElement | null;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      try {
        const rect = el.getBoundingClientRect();
        setSurface(detectSurfaceForRect(rect, [el]));
      } catch {
        /* noop */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, triggerRef]);
  return surface;
}
