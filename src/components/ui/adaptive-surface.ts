import * as React from 'react';
import { detectSurfaceForRect, type AdaptiveSurface } from '@/hooks/useAdaptiveSurfaceTheme';

/**
 * Resolve the trigger element associated with a just-opened Radix popper
 * (Dropdown, Popover, Select, etc.) by walking up from the content and finding
 * the currently open trigger in the document. This avoids requiring every
 * caller to wire a triggerRef into the styled content component.
 */
function findOpenTrigger(content: HTMLElement | null): HTMLElement | null {
  if (!content) return null;
  // Radix sets aria-controls -> the content id on the trigger.
  const id = content.id;
  if (id) {
    const byAria = document.querySelector<HTMLElement>(`[aria-controls="${id}"]`);
    if (byAria) return byAria;
  }
  const expanded = Array.from(document.querySelectorAll<HTMLElement>('[aria-expanded="true"]'));
  // Prefer the most recently rendered one closest to viewport center.
  return expanded[expanded.length - 1] ?? null;
}

export function useContentAdaptiveSurface(
  contentRef: React.RefObject<HTMLElement | null>,
  staticSurface?: AdaptiveSurface | 'auto',
): AdaptiveSurface {
  const [surface, setSurface] = React.useState<AdaptiveSurface>(
    staticSurface && staticSurface !== 'auto' ? staticSurface : 'light',
  );
  React.useEffect(() => {
    if (staticSurface && staticSurface !== 'auto') {
      setSurface(staticSurface);
      return;
    }
    let rafId = 0;
    let timeoutId = 0;
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Radix may not have positioned yet — retry once.
      if (rect.width < 4 || rect.height < 4) {
        timeoutId = window.setTimeout(measure, 32) as unknown as number;
        return;
      }
      // Hide the popover wrapper while sampling so elementsFromPoint sees what's
      // truly underneath, then restore.
      const wrapper = (el.closest('[data-radix-popper-content-wrapper]') as HTMLElement | null) ?? el;
      setSurface(detectSurfaceForRect(rect, [], wrapper));
    };
    // Two rAFs to let Radix's positioning effect settle first.
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [contentRef, staticSurface]);
  return surface;
}

export const ADAPTIVE_SURFACE_BASE =
  'group/surface ' +
  'relative isolate ' +
  // Glass surface tints
  'data-[surface=light]:bg-[hsl(0_0%_100%/0.82)] data-[surface=light]:text-[hsl(222_22%_14%)] ' +
  'data-[surface=dark]:bg-[hsl(222_28%_9%/0.78)] data-[surface=dark]:text-[hsl(0_0%_98%)] ' +
  // Glimmering border: outer ring + inset highlight via box-shadow stack
  'data-[surface=light]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.85),inset_0_0_0_1px_hsl(222_22%_14%/0.08),0_1px_2px_-1px_rgba(0,0,0,0.08),0_12px_36px_-10px_rgba(15,23,42,0.22)] ' +
  'data-[surface=dark]:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.10),inset_0_0_0_1px_hsl(0_0%_100%/0.08),0_1px_2px_-1px_rgba(0,0,0,0.5),0_14px_40px_-12px_rgba(0,0,0,0.55)] ' +
  'backdrop-blur-2xl backdrop-saturate-150';

export const ADAPTIVE_ITEM_BASE =
  'group-data-[surface=light]/surface:hover:bg-[hsl(222_22%_14%/0.04)] ' +
  'group-data-[surface=light]/surface:focus:bg-[hsl(222_22%_14%/0.04)] ' +
  'group-data-[surface=light]/surface:data-[highlighted]:bg-[hsl(222_22%_14%/0.04)] ' +
  'group-data-[surface=dark]/surface:hover:bg-[hsl(0_0%_100%/0.05)] ' +
  'group-data-[surface=dark]/surface:focus:bg-[hsl(0_0%_100%/0.05)] ' +
  'group-data-[surface=dark]/surface:data-[highlighted]:bg-[hsl(0_0%_100%/0.05)]';
