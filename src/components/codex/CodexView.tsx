import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Buildings, Check, Gear, Lightbulb, Lightning, MagnifyingGlass, MapPin, Package, Scroll, SpinnerGap, User } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getThemeById } from '@/lib/notepad-themes';
import { useProjectMemory, type MemoryStreamEvent } from '@/hooks/useProjectMemory';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { ProjectMemoryModal } from '@/components/story/ProjectMemoryModal';
import { MEMORY_KINDS, memoryNameKey, type MemoryKind } from '../../../supabase/functions/_shared/project-memory';
import { buildMemoryGraph } from '../../../supabase/functions/_shared/memory-graph';
import { CodexCard } from './CodexCard';
import { CodexCatchUp } from './CodexCatchUp';
import { CodexEntityPanel } from './CodexEntityPanel';
import { CodexJourneys } from './CodexJourneys';
import { SURFACE, catchUpReason, matchesSearch } from './codex-meta';
import { placeParents, withNesting } from './journeys';
import { useCodexLayout } from './useCodexLayout';
import { useCodexFlights, type Flight } from './useCodexFlights';
import { useCodexReading } from './useCodexReading';

/** A new entry found in a chapter being read, with its facts so far, shown until the chapter is saved. */
interface Ghost { key: string; name: string; kind: MemoryKind; chapterId: string; facts: string[] }
/** An entry the model has named in the chapter being read. */
interface Named { name: string; kind: MemoryKind; sameAs: string[] }

// The Codex wears the reader's Story theme, with the Story sidebars' panel look.
const surfaceStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--notepad-bg, var(--background)))',
  color: 'hsl(var(--notepad-fg, var(--foreground)))',
};
const panelStyle: React.CSSProperties = {
  color: 'hsl(var(--notepad-fg, var(--foreground)))',
  backgroundColor: 'var(--notepad-panel-bg, hsl(var(--notepad-bg, var(--background))))',
  boxShadow: '0 1px 2px -1px hsl(0 0% 0% / 0.12), 0 3px 8px -3px hsl(0 0% 0% / 0.15)',
};
const dividerStyle: React.CSSProperties = { borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.06)' };

function storyThemeClass() {
  let id = 'cream';
  try { id = localStorage.getItem('storymode:story:theme') || id; } catch { /* private mode */ }
  return getThemeById(id).className;
}

/**
 * Project-wide view of project memory: one row per kind (people, places, ...),
 * one card per entity joined across every analyzed chapter, and a sidebar
 * with the selected entity's facts, connections and places.
 */
export function CodexView({ projectId, onOpenChapter }: { projectId: string; onOpenChapter: (chapterId: string, quote?: string) => void }) {
  const { t } = useTranslation();
  const memory = useProjectMemory(projectId, true);
  // Memory settings (writing type, genre, editor guidance) are for admins; everyone else gets inferred ones.
  const isAdmin = useIsAdmin();
  const [turningOn, setTurningOn] = useState(false);
  const graph = useMemo(() => buildMemoryGraph(memory.data), [memory.data]);
  // Place order, nesting and the like, saved with the project.
  const { layout, update: updateLayout } = useCodexLayout(projectId);
  const autoParents = useMemo(() => placeParents(graph), [graph]);
  const parents = useMemo(() => withNesting(autoParents, layout.nesting), [autoParents, layout.nesting]);
  /** Puts a place inside another, or at top level; memory's own choice clears the override. */
  const setContainer = useCallback((id: string, parent: string | null) => updateLayout(previous => {
    const nesting = { ...previous.nesting };
    if ((autoParents.get(id) ?? null) === parent) delete nesting[id]; else nesting[id] = parent;
    return { ...previous, nesting };
  }), [autoParents, updateLayout]);
  const [themeClass] = useState(storyThemeClass);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(() => new Set());
  const [warning, setWarning] = useState('');
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const [view, setView] = useState<'cards' | 'journeys'>('cards');
  const canvasRef = useRef<HTMLDivElement>(null);

  // Reading chapters: what they find flies from the chapter to its card, or
  // to a placeholder for an entry that is new until the chapter is saved.
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [landed, setLanded] = useState<Set<string>>(() => new Set());
  const [pulses, setPulses] = useState<Record<string, number>>({});
  // Facts that landed on known cards, shown on them until their chapter is saved.
  const [previews, setPreviews] = useState<Record<string, { chapterId: string; text: string }[]>>({});
  const saved = useRef(new Set<string>());
  const [before, setBefore] = useState<Set<string> | null>(null);
  const byName = useMemo(() => {
    const index = new Map<string, string>();
    for (const node of graph.nodes) {
      for (const name of [node.name, ...node.aliases]) {
        const key = `${node.kind}|${memoryNameKey(name)}`;
        if (!index.has(key)) index.set(key, node.id);
      }
    }
    return index;
  }, [graph]);
  const byNameRef = useRef(byName);
  byNameRef.current = byName;
  const ghostsRef = useRef(ghosts);
  ghostsRef.current = ghosts;
  // A fact lands on its card: a new entry's placeholder shows it, a known card pulses.
  const { launch, splash } = useCodexFlights(canvasRef, useCallback((flight: Flight) => {
    const key = flight.target.startsWith('ghost:') ? flight.target.slice(6) : null;
    const ghost = key ? ghostsRef.current.find(g => g.key === key) : undefined;
    if (ghost) {
      setLanded(previous => new Set(previous).add(flight.target));
      if (flight.fact) {
        ghostsRef.current = ghostsRef.current.map(g => g === ghost ? { ...g, facts: [...g.facts, flight.fact!] } : g);
        setGhosts(ghostsRef.current);
      }
      return;
    }
    // A known card, or a placeholder already replaced by its saved card.
    const id = key ? key.replace('|', ':') : flight.target;
    setPulses(previous => ({ ...previous, [id]: (previous[id] || 0) + 1 }));
    // Once saved, the card already holds the fact.
    if (flight.fact && !saved.current.has(flight.chapterId)) {
      const preview = { chapterId: flight.chapterId, text: flight.fact };
      setPreviews(previous => ({ ...previous, [id]: [...(previous[id] || []), preview] }));
    }
  }, []));
  // Only what changes memory flies: each fact the model writes, as its own pill
  // named for its subject. Names alone (entities without facts) do not.
  const named = useRef(new Map<string, Named>());
  const onFound = useCallback((event: Extract<MemoryStreamEvent, { type: 'entity' | 'fact' }>, chapterId: string) => {
    if (event.type === 'entity') {
      named.current.set(`${chapterId}|${event.kind}|${memoryNameKey(event.name)}`, { name: event.name, kind: event.kind, sameAs: event.sameAs });
      // A new entry gets its placeholder as soon as the model names it; its facts fill it as they land.
      const existing = [event.name, ...event.sameAs].some(n => byNameRef.current.has(`${event.kind}|${memoryNameKey(n)}`));
      const key = `${event.kind}|${memoryNameKey(event.name)}`;
      if (!existing && !ghostsRef.current.some(g => g.key === key)) {
        ghostsRef.current = [...ghostsRef.current, { key, name: event.name, kind: event.kind, chapterId, facts: [] }];
        setGhosts(ghostsRef.current);
      }
      return;
    }
    const kinds = MEMORY_KINDS.includes(event.kind as MemoryKind) ? [event.kind as MemoryKind] : MEMORY_KINDS;
    const subject = memoryNameKey(event.subject);
    const entry = kinds.map(k => named.current.get(`${chapterId}|${k}|${subject}`)).find(Boolean);
    const kind = entry?.kind ?? kinds.find(k => byNameRef.current.has(`${k}|${subject}`));
    if (!kind) return;
    const name = entry?.name ?? event.subject;
    const existing = [name, ...(entry?.sameAs || [])].map(n => byNameRef.current.get(`${kind}|${memoryNameKey(n)}`)).find(Boolean);
    if (existing) { launch({ name, kind, target: existing, fact: event.statement, chapterId }); return; }
    const key = `${kind}|${memoryNameKey(name)}`;
    if (!ghostsRef.current.some(g => g.key === key)) {
      ghostsRef.current = [...ghostsRef.current, { key, name, kind, chapterId, facts: [] }];
      setGhosts(ghostsRef.current);
    }
    launch({ name, kind, target: `ghost:${key}`, fact: event.statement, chapterId });
  }, [launch]);
  // Once a chapter is saved its real entries replace the placeholders; pills
  // still in the air land on the saved cards.
  const onChapterDone = useCallback((chapterId: string) => {
    saved.current.add(chapterId);
    setPreviews(previous => Object.fromEntries(Object.entries(previous)
      .map(([id, list]) => [id, list.filter(p => p.chapterId !== chapterId)] as const).filter(([, list]) => list.length)));
    for (const key of [...named.current.keys()]) if (key.startsWith(`${chapterId}|`)) named.current.delete(key);
    ghostsRef.current = ghostsRef.current.filter(g => g.chapterId !== chapterId);
    setGhosts(ghostsRef.current);
  }, []);
  const reading = useCodexReading(memory.watchAnalysis, { onFound, onChapterDone });
  const startReading = (ids: string[]) => {
    for (const id of ids) saved.current.delete(id);
    setBefore(previous => previous ?? new Set(graph.nodes.map(n => n.id)));
    void reading.start(ids);
  };
  const fresh = useMemo(() => new Set(before ? graph.nodes.filter(n => !before.has(n.id)).map(n => n.id) : []), [before, graph]);

  // A Codex with nothing read yet opens on the chapters to read.
  const enabled = !!memory.data?.profile?.enabled;
  const empty = enabled && graph.coverage.analyzed === 0;
  useEffect(() => { if (empty) setCatchUpOpen(true); }, [empty]);
  const behind = (memory.data?.chapters || []).filter(c => catchUpReason(c)).length;

  const onEditingChange = useCallback((key: string, isEditing: boolean) => {
    setEditing(previous => {
      if (previous.has(key) === isEditing) return previous;
      const next = new Set(previous);
      if (isEditing) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  useEffect(() => { if (!editing.size) setWarning(''); }, [editing.size]);
  /** Blocks leaving an entry while a correction is unsaved; otherwise runs `action`. */
  const guard = (action: () => void) => {
    if (editing.size) { setWarning(t('memory.unsavedCorrection')); return; }
    setWarning('');
    action();
  };
  /** Shows the chapters whose memory needs updating. */
  const openUpdates = () => guard(() => { setSelectedId(null); setCatchUpOpen(true); });
  const select = (id: string | null) => guard(() => {
    setSelectedId(id);
    if (id) setCatchUpOpen(false);
    if (id) requestAnimationFrame(() => document.querySelector(`[data-node="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }));
  });

  // Entries added in this visit lead their rows, where their placeholders were.
  const rows = useMemo(() => MEMORY_KINDS
    .map(kind => ({
      kind,
      ghosts: ghosts.filter(g => g.kind === kind),
      nodes: graph.nodes.filter(n => n.kind === kind && matchesSearch(n, query))
        .sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id))),
    }))
    .filter(row => row.nodes.length > 0 || row.ghosts.length > 0), [graph, query, ghosts, fresh]);

  const manage = <ProjectMemoryModal projectId={projectId} open={manageOpen} onOpenChange={setManageOpen}
    onSelectChapter={onOpenChapter} />;
  const shell = (children: React.ReactNode) => (
    <div className={cn('notepad-themed relative flex min-h-0 flex-1 gap-3 p-3', themeClass)} style={surfaceStyle}>{children}</div>
  );

  if (memory.isLoading) {
    return shell(<div className="flex flex-1 items-center justify-center" role="status" aria-label={t('common.loading')}>
      <SpinnerGap weight="duotone" className="h-6 w-6 animate-spin opacity-50" />
    </div>);
  }
  if (memory.isError) {
    return shell(<EmptyState title={t('codex.unavailableTitle')} body={t('codex.unavailable')}
      action={<Button variant="outline" size="sm" className="font-sans" onClick={() => void memory.refetch()}>{t('memory.retry')}</Button>} />);
  }
  if (!enabled) {
    // Admins choose the settings; anyone else turns memory on with the inferred ones.
    const turnOn = async () => {
      setTurningOn(true);
      try {
        const profile = memory.data?.profile;
        await memory.saveProfile({ register: profile?.register ?? 'auto', genre: profile?.genre ?? '',
          guidance: profile?.guidance ?? '', enabled: true });
        setCatchUpOpen(true);
      } finally { setTurningOn(false); }
    };
    return shell(<>
      <EmptyState title={t('codex.disabledTitle')} body={t('codex.disabled')}
        action={isAdmin
          ? <Button variant="outline" size="sm" className="font-sans" onClick={() => setManageOpen(true)}>{t('codex.setUp')}</Button>
          : <Button variant="outline" size="sm" className="font-sans" disabled={turningOn} onClick={() => void turnOn()}>{t('codex.turnOn')}</Button>} />
      {manage}
    </>);
  }

  const selected = selectedId ? graph.nodeById.get(selectedId) ?? null : null;
  /** Whether `id` is `ancestor` or inside it. */
  const within = (id: string, ancestor: string) => {
    for (let at: string | undefined = id, steps = 0; at && steps < 100; at = parents.get(at), steps++) if (at === ancestor) return true;
    return false;
  };
  const container = selected?.kind === 'place' ? {
    parent: graph.nodeById.get(parents.get(selected.id) ?? '') ?? null,
    options: graph.nodes.filter(n => n.kind === 'place' && !within(n.id, selected.id)).sort((a, b) => a.name.localeCompare(b.name)),
    onChange: (parentId: string | null) => setContainer(selected.id, parentId),
  } : undefined;
  return shell(<>
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 px-3">
        <h1 className="sr-only">{t('codex.title')}</h1>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t('codex.search')}</span>
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-40" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('codex.search')}
            className="h-8 w-full border-0 bg-[hsl(var(--notepad-fg)/0.05)] pl-8 text-xs text-inherit shadow-none placeholder:text-[hsl(var(--notepad-fg)/0.4)] focus-visible:ring-1 focus-visible:ring-[hsl(var(--notepad-fg)/0.2)] focus-visible:ring-offset-0" />
        </label>
        <div className="flex shrink-0 rounded-full bg-[hsl(var(--notepad-fg)/0.05)] p-0.5 font-sans text-xs" role="group" aria-label={t('codex.view.label')}>
          {(['cards', 'journeys'] as const).map(v => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={cn('rounded-full px-3 py-1', view === v ? 'bg-[hsl(var(--notepad-bg))] shadow-sm' : 'opacity-60 hover:opacity-100')}>
              {t(`codex.view.${v}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => guard(() => { setSelectedId(null); setCatchUpOpen(open => !open); })}
          aria-pressed={catchUpOpen} data-reading-source={(reading.running && !catchUpOpen) || undefined}
          className={cn('flex h-8 shrink-0 items-center gap-2 rounded-full px-3 font-sans text-xs transition-colors',
            reading.running ? 'codex-burning' : SURFACE)}>
          {reading.running ? <>
            {t('codex.catchUp.pillReading', {
              index: Object.values(reading.statuses).filter(s => s.state !== 'waiting').length,
              total: Object.keys(reading.statuses).length,
            })}
          </> : behind > 0 ? <>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--codex-brand))]" />
            {t('codex.catchUp.pillBehind', { count: behind })}
          </> : <>
            <Check weight="bold" aria-hidden="true" className="h-3 w-3 opacity-60" />
            {t('codex.catchUp.pillUpToDate')}
          </>}
        </button>
      </div>
      {view === 'journeys' ? (
        // Full bleed: the chart runs to the edges of the view (or to the sidebar).
        <div className={cn('-mb-3 -ml-3 flex min-h-0 flex-1 flex-col', !selected && !catchUpOpen && '-mr-3')}>
          <CodexJourneys layout={layout} onLayoutChange={updateLayout} graph={graph} chapters={memory.data?.chapters || []}
            onSelectNode={id => select(id)} onOpenChapter={id => guard(() => onOpenChapter(id))} />
        </div>
      ) : (
      <div ref={canvasRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {rows.length === 0 && (empty && !query
          ? <EmptyState title={t('codex.emptyTitle')} body={t('codex.empty')} />
          : <p className="py-10 text-center text-sm opacity-50">{t('codex.noMatches')}</p>)}
        {rows.map(({ kind, nodes, ghosts: pending }) => (
          <section key={kind} aria-labelledby={`codex-row-${kind}`} className="pt-5">
            <h2 id={`codex-row-${kind}`} className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.22em]">
              <KindIcon kind={kind} />
              <span className="opacity-50">{t(`codex.kinds.${kind}`)}</span>
              <span className="opacity-30">{nodes.length + pending.length}</span>
            </h2>
            <FadingRow lead={pending.length + nodes.filter(n => fresh.has(n.id)).length}>
              {pending.map(ghost => <GhostCard key={ghost.key} ghost={ghost} landed={landed.has(`ghost:${ghost.key}`)} />)}
              {nodes.map(node => (
                <CodexCard key={node.id} node={node} graph={graph} selected={node.id === selectedId}
                  pulse={pulses[node.id]} fresh={fresh.has(node.id)} preview={previews[node.id]?.map(p => p.text)}
                  onOpen={() => select(node.id === selectedId ? null : node.id)} onStale={openUpdates} />
              ))}
            </FadingRow>
          </section>
        ))}
      </div>
      )}
    </section>
    {selected && (
      <CodexEntityPanel key={selected.id} node={selected} graph={graph} container={container} edit={memory.editClaim} setIdentity={memory.setIdentity} warning={warning}
        panelStyle={panelStyle} dividerStyle={dividerStyle} onSelectNode={id => select(id)}
        onOpenChapter={(id, quote) => guard(() => onOpenChapter(id, quote))} onEditingChange={onEditingChange} onClose={() => select(null)} />
    )}
    {catchUpOpen && !selected && (
      <CodexCatchUp chapters={memory.data?.chapters || []} reading={reading} splash={splash}
        panelStyle={panelStyle} dividerStyle={dividerStyle} onStart={startReading} onStop={reading.stop}
        onOpenChapter={onOpenChapter} onOpenSettings={isAdmin ? () => setManageOpen(true) : undefined} onClose={() => setCatchUpOpen(false)} />
    )}
    {manage}
  </>);
}

const FADE = 48;

/**
 * A horizontally scrolling row whose edges fade out wherever more cards are
 * hidden. When `lead` (entries just found, placed first) grows, it scrolls
 * back to its start so they are in view.
 */
function FadingRow({ lead = 0, children }: { lead?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const leadRef = useRef(lead);
  useEffect(() => {
    if (lead > leadRef.current) ref.current?.scrollTo({ left: 0, behavior: 'smooth' });
    leadRef.current = lead;
  }, [lead]);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges(previous => (previous.left === left && previous.right === right ? previous : { left, right }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => { el.removeEventListener('scroll', update); observer.disconnect(); };
  }, [update]);
  // Cards come and go with the search without resizing the row.
  useEffect(update, [children, update]);
  const mask = `linear-gradient(to right, transparent, #000 ${edges.left ? FADE : 12}px, #000 calc(100% - ${edges.right ? FADE : 12}px), transparent)`;
  return (
    <div ref={ref} style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="-mx-3 flex snap-x scroll-px-3 gap-2.5 overflow-x-auto px-3 pb-3 pt-3 [overflow-anchor:none]">
      {children}
    </div>
  );
}

const KIND_ICONS: Record<MemoryKind, typeof User> = {
  person: User,
  place: MapPin,
  organization: Buildings,
  event: Lightning,
  object: Package,
  system: Gear,
  concept: Lightbulb,
};

function KindIcon({ kind }: { kind: MemoryKind }) {
  const Icon = KIND_ICONS[kind];
  return <Icon weight="duotone" aria-hidden="true" className="h-3.5 w-3.5 opacity-50" />;
}

/**
 * A new entry found in the chapter being read: a placeholder from the moment
 * the model names it ("Creating … memory"), filled by its facts as their pills
 * land, and replaced by the real card once the chapter is saved.
 */
function GhostCard({ ghost, landed }: { ghost: Ghost; landed: boolean }) {
  const { t } = useTranslation();
  const filled = landed && ghost.facts.length > 0;
  return (
    <div data-node={`ghost:${ghost.key}`}
      className="codex-motion flex w-60 shrink-0 snap-start flex-col gap-1.5 rounded-lg border border-dashed border-[hsl(var(--notepad-fg)/0.22)] px-3.5 py-3"
      style={{ animation: 'codex-arrive 0.45s ease-out' }}>
      <span className="truncate text-sm font-medium leading-snug">{ghost.name}</span>
      {filled ? (
        <ul className="space-y-1 text-[13px] leading-snug opacity-70">
          {ghost.facts.slice(0, 3).map((fact, i) => <li key={i} className="line-clamp-2" style={{ animation: 'codex-arrive 0.4s ease-out' }}>{fact}</li>)}
        </ul>
      ) : (
        <p className="animate-pulse text-[13px] leading-snug opacity-50">{t('codex.catchUp.creating', { name: ghost.name })}</p>
      )}
      <span className="mt-auto text-[11px] opacity-45">{t('codex.catchUp.justFound')}</span>
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <Scroll weight="duotone" className="mx-auto h-10 w-10 opacity-40" />
        <h2 className="text-base font-medium">{title}</h2>
        <p className="text-sm leading-relaxed opacity-60">{body}</p>
        {action}
      </div>
    </div>
  );
}
