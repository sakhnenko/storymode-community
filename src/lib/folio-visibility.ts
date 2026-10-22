// Single source of truth for folios that should be hidden from end-user UIs.
// `__chapter_notes__` is an internal bucket used to back per-chapter notes;
// it must never appear in folio pickers, switchers, timelines, or lists.

export const HIDDEN_FOLIO_TITLES = new Set<string>(['__chapter_notes__']);

export function isHiddenFolio(title?: string | null): boolean {
  if (!title) return false;
  return HIDDEN_FOLIO_TITLES.has(title);
}

export function filterVisibleFolios<T extends { title?: string | null }>(rows: T[] | null | undefined): T[] {
  if (!rows) return [];
  return rows.filter(r => !isHiddenFolio(r.title));
}
