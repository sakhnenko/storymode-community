import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export const LABEL_W = 168;
export const LABEL_MIN = 120;
export const LABEL_MAX = 360;
const SAVE_DELAY_MS = 600;

/**
 * How the author arranged the Codex: the places' order, the hidden ones, the
 * containers opened to show the places inside (all start closed), and where
 * they put a place into or out of another (a place id to its chosen
 * container, or null for top level).
 */
export interface CodexLayout {
  order: string[]; hidden: string[]; expanded: string[]; nesting: Record<string, string | null>;
  /** Width of the Journeys place column, as the author dragged it. */
  labelWidth: number;
}
export type UpdateLayout = (change: (previous: CodexLayout) => CodexLayout) => void;

export const clampLabel = (width: number) => Math.min(LABEL_MAX, Math.max(LABEL_MIN, Math.round(width)));
const EMPTY: CodexLayout = { order: [], hidden: [], expanded: [], nesting: {}, labelWidth: LABEL_W };

/** A stored layout, keeping only well-formed parts. */
export function parseLayout(value: unknown): CodexLayout {
  if (!value || typeof value !== 'object') return EMPTY;
  const v = value as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const nesting: Record<string, string | null> = {};
  if (v.nesting && typeof v.nesting === 'object') {
    for (const [id, parent] of Object.entries(v.nesting)) if (parent === null || typeof parent === 'string') nesting[id] = parent;
  }
  return {
    order: list(v.order), hidden: list(v.hidden), expanded: list(v.expanded), nesting,
    labelWidth: typeof v.labelWidth === 'number' ? clampLabel(v.labelWidth) : LABEL_W,
  };
}

/** Where Journeys used to keep the layout, in this browser only. */
const legacyKey = (projectId: string) => `storymode:codex:${projectId}:journeys`;
function legacyLayout(projectId: string): CodexLayout | null {
  try {
    const raw = localStorage.getItem(legacyKey(projectId));
    return raw ? parseLayout(JSON.parse(raw)) : null;
  } catch { return null; }
}

/**
 * The project's Codex layout, saved to the project so it is the same in every
 * browser. Changes apply at once and are saved shortly after the last one; a
 * layout this browser kept before is carried over when the project has none.
 */
export function useCodexLayout(projectId: string) {
  const [layout, setLayout] = useState<CodexLayout>(() => legacyLayout(projectId) ?? EMPTY);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<CodexLayout | null>(null);
  const timer = useRef<number>();

  const save = useCallback(async (value: CodexLayout) => {
    const { error } = await supabase.from('project_codex_layouts')
      .upsert({ project_id: projectId, layout: value as unknown as Json, updated_at: new Date().toISOString() });
    if (error) console.warn('Codex layout not saved', error.message);
  }, [projectId]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current) { void save(pending.current); pending.current = null; }
  }, [save]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void supabase.from('project_codex_layouts').select('layout').eq('project_id', projectId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // A change made while loading wins over the stored layout.
        if (data) { if (!pending.current) setLayout(parseLayout(data.layout)); }
        else if (!error) {
          // First visit since layouts moved to the project: keep what this browser had.
          const legacy = legacyLayout(projectId);
          if (legacy) void save(legacy);
        }
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [projectId, save]);

  // Save what is still waiting when the Codex closes or the page is left.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  const update: UpdateLayout = useCallback(change => {
    setLayout(previous => {
      const next = change(previous);
      if (next === previous) return previous;
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
      return next;
    });
  }, [flush]);

  return { layout, update, loaded };
}
