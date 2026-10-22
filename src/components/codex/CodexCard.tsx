import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { consolidateFacts, isExcluded, linksOf, type GraphNode, type MemoryGraph } from '../../../supabase/functions/_shared/memory-graph';
import { SURFACE, chapterTitles, linkLabel } from './codex-meta';

const MAX_FACTS = 3;
const MAX_LINKS = 2;

export function CodexCard({ node, graph, selected, pulse = 0, fresh = false, preview = [], onOpen, onStale }: {
  node: GraphNode; graph: MemoryGraph; selected: boolean;
  /** Changes each time something found in a chapter being read lands on this card. */
  pulse?: number;
  /** Added by the chapters read in this visit. */
  fresh?: boolean;
  /** Facts about it found in the chapter being read, until that chapter is saved. */
  preview?: string[];
  onOpen: () => void;
  /** Opens the list of chapters to update; offered when some of this card comes from an edited chapter. */
  onStale?: () => void;
}) {
  const { t } = useTranslation();
  const facts = useMemo(() => consolidateFacts(node.facts, [node.name, ...node.aliases])
    .filter(group => !isExcluded(group.fact)), [node]);
  const links = useMemo(() => linksOf(graph, node.id), [graph, node.id]);
  // Chapters edited since they were read that this card draws on.
  const staleChapters = useMemo(() => {
    const titles = new Map<string, string>();
    for (const fact of node.facts) if (fact.stale) titles.set(fact.chapter.id, fact.chapter.title);
    for (const appearance of node.appearances) if (appearance.stale) titles.set(appearance.chapterId, appearance.title);
    return [...titles.values()].map(title => title || t('story.infoUntitled'));
  }, [node, t]);
  return (
    <div className="relative w-60 shrink-0 snap-start">
    <button
      type="button"
      data-node={node.id}
      onClick={onOpen}
      aria-pressed={selected}
      className={cn(
        'codex-motion relative flex h-full w-full flex-col gap-2 rounded-lg px-3.5 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--notepad-fg)/0.3)]',
        selected ? 'bg-[hsl(var(--notepad-fg)/0.08)] ring-1 ring-[hsl(var(--notepad-fg)/0.14)]' : SURFACE,
      )}
      style={fresh ? { animation: 'codex-arrive 0.5s ease-out' } : undefined}
    >
      {pulse > 0 && <span key={pulse} aria-hidden="true" className="codex-motion pointer-events-none absolute inset-0 rounded-lg"
        style={{ animation: 'codex-pulse 0.9s ease-out' }} />}
      {fresh && (
        <span className="absolute right-3 top-3 rounded-full bg-[hsl(var(--codex-brand))] px-1.5 py-px text-[10px] font-medium text-[hsl(var(--codex-brand-foreground))]">
          {t('codex.catchUp.new')}
        </span>
      )}
      <div className="min-w-0">
        <h3 className={cn('truncate text-sm font-medium leading-snug', fresh ? 'pr-10' : staleChapters.length > 0 && 'pr-5')}>{node.name}</h3>
        {node.aliases.length > 0 && (
          <p className="truncate text-[11px] opacity-45">{t('codex.aka', { names: node.aliases.slice(0, 2).join(', ') })}</p>
        )}
      </div>
      {preview.length > 0 && (
        <ul className="space-y-1 text-[13px] leading-snug">
          {preview.slice(-MAX_FACTS).map((text, i) => (
            <li key={`${i}-${text}`} className="line-clamp-2 border-l-2 border-[hsl(var(--codex-brand))] pl-2"
              style={{ animation: 'codex-arrive 0.4s ease-out' }}>{text}</li>
          ))}
        </ul>
      )}
      {preview.length >= MAX_FACTS ? null : facts.length > 0 ? (
        <ul className="space-y-1 text-[13px] leading-snug opacity-75">
          {facts.slice(0, MAX_FACTS - preview.length).map(({ fact, text }) => (
            <li key={`${fact.chapter.id}-${fact.claim.key}`} className="line-clamp-2">
              {text}{fact.stale && <span className="sr-only"> ({t('codex.factOutOfDate')})</span>}
            </li>
          ))}
        </ul>
      ) : (
        preview.length ? null : (
          <p className="line-clamp-2 text-[13px] opacity-45">
            {node.appearances.length
              ? t('codex.mentionedIn', { chapters: chapterTitles(t, node).slice(0, 2).join(', ')
                + (node.appearances.length > 2 ? ` +${node.appearances.length - 2}` : '') })
              : t('codex.noFacts')}
          </p>
        )
      )}
      {links.length > 0 && (
        <p className="mt-auto truncate pt-0.5 text-[11px] opacity-45">
          {links.slice(0, MAX_LINKS).map(({ edge, other, outgoing }) => linkLabel(t, edge.type, outgoing, other.name)).join(' · ')}
          {links.length > MAX_LINKS && ` · +${links.length - MAX_LINKS}`}
        </p>
      )}
    </button>
    {/* Out of date: an orange dot that explains itself and opens the chapters to update. */}
    {staleChapters.length > 0 && (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={onStale}
            aria-label={t('codex.stale.tip', { count: staleChapters.length, chapters: staleChapters.slice(0, 3).join(', ') })}
            className={cn('absolute top-2.5 flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-amber-500/15',
              fresh ? 'right-14' : 'right-2.5')}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-[hsl(var(--notepad-bg))]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {t('codex.stale.tip', { count: staleChapters.length, chapters: staleChapters.slice(0, 3).join(', ') })}
        </TooltipContent>
      </Tooltip>
    )}
    </div>
  );
}
