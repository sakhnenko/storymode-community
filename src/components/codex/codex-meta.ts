import type { TFunction } from 'i18next';
import { isMemoryCurrent, needsMemoryUpgrade, type MemoryChapter, type RelationType } from '../../../supabase/functions/_shared/project-memory';
import { factStatement, isExcluded, type GraphNode } from '../../../supabase/functions/_shared/memory-graph';

/** Tints drawn from the Story theme's text color, like the Story sidebars. */
export const SURFACE = 'bg-[hsl(var(--notepad-fg)/0.035)] hover:bg-[hsl(var(--notepad-fg)/0.06)]';

/** A quiet pill button for an entry's own settings, such as "Same as…". */
export const FAINT_BUTTON = 'inline-flex h-6 max-w-full items-center rounded-full bg-[hsl(var(--notepad-fg)/0.05)] px-2.5 font-sans text-[11px] '
  + 'opacity-60 transition hover:bg-[hsl(var(--notepad-fg)/0.09)] hover:opacity-100 focus-visible:opacity-100 '
  + 'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--notepad-fg)/0.3)] disabled:opacity-40';

/** Chapter titles, in story order, for "Mentioned in …". */
export function chapterTitles(t: TFunction, node: GraphNode) {
  return node.appearances.map(a => a.title || t('story.infoUntitled'));
}

/** "Family: Mira" from either end; directed links read "Member of …" one way and "Member: …" the other. */
export function linkLabel(t: TFunction, type: RelationType, outgoing: boolean, name: string) {
  return t(`codex.links.${outgoing ? 'out' : 'in'}.${type}`, { name });
}

export function visibleFacts(node: GraphNode) {
  return node.facts.filter(f => !isExcluded(f));
}

/** Case- and accent-insensitive match on any name, alias or fact. */
export function matchesSearch(node: GraphNode, query: string) {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const q = fold(query.trim());
  if (!q) return true;
  return [node.name, ...node.aliases, ...visibleFacts(node).map(factStatement)].some(text => fold(text).includes(q));
}

export type CatchUpReason = 'edited' | 'new' | 'format';

/** Why a chapter's memory is behind: edited since it was read, never read, or read in an older format. */
export function catchUpReason(chapter: MemoryChapter): CatchUpReason | null {
  if (!chapter.revision) return 'new';
  if (!isMemoryCurrent(chapter)) return 'edited';
  if (needsMemoryUpgrade(chapter)) return 'format';
  return null;
}

/** Rough cost of reading a chapter of ordinary length, in credits. */
export const CREDITS_PER_CHAPTER = 10;
