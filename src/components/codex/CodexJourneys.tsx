import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, CaretDown, CaretRight, DotsSixVertical, Eye, EyeClosed, Lightning } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { MemoryChapter } from '../../../supabase/functions/_shared/project-memory';
import type { GraphNode, MemoryGraph } from '../../../supabase/functions/_shared/memory-graph';
import {
  arrangePlaces, journeyEvents, journeyLines, journeyPlaces, placeOnRows, placeParents, placeTree, shownRows, travellers,
  unshownInChapter, whereInChapter, withContainers, withNesting, withMovedOrder,
  type JourneyEvent, type JourneyLine, type JourneyStop, type PlaceRow,
} from './journeys';
import { LABEL_MAX, LABEL_MIN, LABEL_W, clampLabel, type CodexLayout, type UpdateLayout } from './useCodexLayout';

/**
 * Categorical hues in fixed order (validated for CVD separation on the light
 * Story surfaces). No further hue stays distinguishable, so slots 9 to 15
 * reuse the hues in order with square markers; every line is also labeled.
 * A character keeps its slot while shown.
 */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
/** Shown by default; up to SLOTS can be picked. */
const DEFAULT_SHOWN = 10;
const SLOTS = 15;
const colorOf = (slot: number) => PALETTE[slot % PALETTE.length];
const squareOf = (slot: number) => slot >= PALETTE.length;
const COL_W = 136;
const HEADER_H = 48;
const STEP = 7;
const MIN_BAND = 40;
/** A place nobody is at directly (only inside it) gets a slim row. */
const CONTAINER_BAND = 28;
const INDENT = 12;
const EVENT_ROW = 24;
const EVENT_PAD = 8;
const MAX_EVENT_ROWS = 3;

type Zone = 'before' | 'after' | 'inside';

interface Viewport { top: number; left: number; width: number; height: number }
interface Point { stop: JourneyStop; x: number; y: number }

/**
 * Where the major characters are in each chapter: chapters run left to right,
 * places top to bottom in the order the story first reaches them, and each
 * character is a line through the places a chapter puts them. Lines that
 * share a place in a chapter run side by side; a dotted stretch means the
 * character is placed nowhere in the chapters between. Major events sit in a
 * strip above the places. Places nest inside the places that contain them
 * (memory's "located in" links, or the author's drags); a hidden or collapsed
 * place shows its people in the nearest shown place containing it, and only
 * when there is none do they become hollow dots on the line. The author's
 * arrangement is saved with the project (see useCodexLayout).
 */
export function CodexJourneys({ layout: prefs, onLayoutChange: setPrefs, graph, chapters, onSelectNode, onOpenChapter }: {
  layout: CodexLayout;
  onLayoutChange: UpdateLayout;
  graph: MemoryGraph;
  chapters: MemoryChapter[];
  onSelectNode: (id: string) => void;
  onOpenChapter: (chapterId: string) => void;
}) {
  const { t } = useTranslation();
  const ranked = useMemo(() => travellers(graph), [graph]);
  const [slots, setSlots] = useState<Record<string, number> | null>(null);
  const [hoverChapter, setHoverChapter] = useState<number | null>(null);
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  const [hoverEvent, setHoverEvent] = useState<JourneyEvent | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  // The scrolled-to part of the chart, so popups stay inside it.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ top: 0, left: 0, width: 0, height: 0 });
  const syncViewport = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setViewport(v => (v.top === el.scrollTop && v.left === el.scrollLeft && v.width === el.clientWidth && v.height === el.clientHeight
      ? v : { top: el.scrollTop, left: el.scrollLeft, width: el.clientWidth, height: el.clientHeight }));
  }, []);
  const hasTravellers = ranked.length > 0;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncViewport, hasTravellers]);

  // Dragging a place label: it follows the pointer and a line marks where it will land.
  const placesRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: string; y: number; pointer: number } | null>(null);
  const justDragged = useRef(false);
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; zone: Zone } | null>(null);
  // The place column follows the pointer while its edge is dragged, and is saved on release.
  const [resizing, setResizing] = useState<number | null>(null);
  const labelW = resizing ?? prefs.labelWidth;
  const resize = useRef<{ x: number; width: number } | null>(null);
  const onEdgeDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { x: e.clientX, width: labelW };
    setResizing(labelW);
  };
  const onEdgeMove = (e: React.PointerEvent) => {
    if (resize.current) setResizing(clampLabel(resize.current.width + e.clientX - resize.current.x));
  };
  const onEdgeUp = () => {
    if (resizing !== null) setPrefs(previous => ({ ...previous, labelWidth: resizing }));
    resize.current = null;
    setResizing(null);
  };
  /** The column's right edge, in each of its cells; one copy is the control for keyboards and screen readers. */
  const edge = (control: boolean) => (
    <div {...(control
      ? { role: 'separator', 'aria-orientation': 'vertical' as const, 'aria-label': t('codex.journeys.resize'),
          'aria-valuemin': LABEL_MIN, 'aria-valuemax': LABEL_MAX, 'aria-valuenow': labelW, tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent) => {
            const by = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
            if (by) { e.preventDefault(); setPrefs(previous => ({ ...previous, labelWidth: clampLabel(previous.labelWidth + by) })); }
          } }
      : { 'aria-hidden': true })}
      onPointerDown={onEdgeDown} onPointerMove={onEdgeMove} onPointerUp={onEdgeUp} onPointerCancel={onEdgeUp}
      onDoubleClick={() => setPrefs(previous => ({ ...previous, labelWidth: LABEL_W }))}
      className="group/edge absolute -right-1 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none justify-center outline-none">
      {/* While resizing the whole edge is the brand colour; the hover shade must not win under the pointer. */}
      <span className={cn('h-full w-px transition-colors', resizing !== null
        ? 'bg-[hsl(var(--codex-brand))]'
        : 'bg-[hsl(var(--notepad-fg)/0.07)] group-hover/edge:bg-[hsl(var(--notepad-fg)/0.25)] group-focus-visible/edge:bg-[hsl(var(--codex-brand))]')} />
    </div>
  );

  const shown = useMemo(() => {
    const live = new Set(ranked.map(r => r.node.id));
    if (slots) return Object.fromEntries(Object.entries(slots).filter(([id]) => live.has(id)));
    return Object.fromEntries(ranked.slice(0, DEFAULT_SHOWN).map((r, i) => [r.node.id, i]));
  }, [slots, ranked]);
  const toggle = (id: string) => {
    const next = { ...shown };
    if (id in next) delete next[id];
    else {
      const used = new Set(Object.values(next));
      const free = Array.from({ length: SLOTS }, (_, i) => i).find(i => !used.has(i)) ?? -1;
      if (free < 0) return;
      next[id] = free;
    }
    setSlots(next);
  };

  const ordered = useMemo(() => [...chapters].sort((a, b) => a.position - b.position), [chapters]);
  const chapterIds = useMemo(() => ordered.map(c => c.id), [ordered]);
  const characters = useMemo(() => ranked.filter(r => r.node.id in shown).map(r => r.node)
    .sort((a, b) => shown[a.id] - shown[b.id]), [ranked, shown]);
  const allLines = useMemo(() => journeyLines(graph, chapterIds, characters), [graph, chapterIds, characters]);
  // Places as a tree: each inside the place memory (or the author) says contains it.
  const autoParents = useMemo(() => placeParents(graph), [graph]);
  const parents = useMemo(() => withNesting(autoParents, prefs.nesting), [autoParents, prefs.nesting]);
  const arranged = useMemo(() => arrangePlaces(withContainers(journeyPlaces(allLines), parents, graph), prefs.order),
    [allLines, parents, graph, prefs.order]);
  const tree = useMemo(() => placeTree(arranged, parents), [arranged, parents]);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  // Containers start closed: their people show in them until they are opened.
  const collapsed = useMemo(() => new Set(tree.filter(row => row.inside > 0 && !prefs.expanded.includes(row.place.id))
    .map(row => row.place.id)), [tree, prefs.expanded]);
  const rows = useMemo(() => shownRows(tree, hidden, collapsed), [tree, hidden, collapsed]);
  const places = useMemo(() => rows.map(row => row.place), [rows]);
  const lines = useMemo(() => placeOnRows(allLines, new Set(places.map(p => p.id)), parents), [allLines, places, parents]);
  const hiddenPlaces = useMemo(() => arranged.filter(place => hidden.has(place.id)), [arranged, hidden]);
  const events = useMemo(() => journeyEvents(graph, chapterIds), [graph, chapterIds]);
  const eventRows = Math.min(MAX_EVENT_ROWS, Math.max(0, ...events.map(list => list.length)));
  const eventsH = eventRows ? eventRows * EVENT_ROW + 2 * EVENT_PAD : 0;

  const setHidden = (id: string, off: boolean) => setPrefs(previous => ({
    ...previous, hidden: off ? [...new Set([...previous.hidden, id])] : previous.hidden.filter(h => h !== id),
  }));
  const toggleOpen = (id: string) => setPrefs(previous => ({
    ...previous, expanded: previous.expanded.includes(id) ? previous.expanded.filter(e => e !== id) : [...previous.expanded, id],
  }));
  /** Whether `id` is `ancestor` or inside it. */
  const isInside = (id: string, ancestor: string) => {
    for (let at: string | undefined = id, steps = 0; at && steps < 100; at = parents.get(at), steps++) if (at === ancestor) return true;
    return false;
  };
  /**
   * Puts a place before or after another (beside it, in the same container)
   * or inside it, taking the places inside it along.
   */
  const placeAt = (id: string, target: string, zone: Zone) => {
    if (isInside(target, id)) return;
    const parent = zone === 'inside' ? target : parents.get(target) ?? null;
    const shownOrder = arranged.map(place => place.id).filter(p => p !== id);
    const at = shownOrder.indexOf(target);
    if (at < 0) return;
    shownOrder.splice(zone === 'before' ? at : at + 1, 0, id);
    setPrefs(previous => {
      // Places not in the chart right now keep their saved spots.
      const order = withMovedOrder(previous.order, shownOrder);
      const nesting = { ...previous.nesting };
      if ((autoParents.get(id) ?? null) === parent) delete nesting[id]; else nesting[id] = parent;
      // Dropping a place into a container opens it, so the place stays in view.
      const expanded = zone === 'inside' && !previous.expanded.includes(target) ? [...previous.expanded, target] : previous.expanded;
      return { ...previous, order, nesting, expanded };
    });
  };
  /** Arrow keys on a place's handle: up and down among the places beside it, right into the one above, left out of its container. */
  const onHandleKey = (e: React.KeyboardEvent, row: PlaceRow) => {
    const siblings = rows.filter(r => r.parent === row.parent);
    const index = siblings.indexOf(row);
    const above = siblings[index - 1], below = siblings[index + 1];
    const action =
      e.key === 'ArrowUp' && above ? () => placeAt(row.place.id, above.place.id, 'before')
      : e.key === 'ArrowDown' && below ? () => placeAt(row.place.id, below.place.id, 'after')
      : e.key === 'ArrowRight' && above ? () => placeAt(row.place.id, above.place.id, 'inside')
      : e.key === 'ArrowLeft' && row.parent ? () => placeAt(row.place.id, row.parent!, 'after')
      : null;
    if (action) { e.preventDefault(); action(); }
  };

  // Characters at the same place in the same chapter share a band and sit side by
  // side. A stop at a turned-off place has no band: it sits on the line between
  // its neighbours, so the line stays continuous.
  const layout = useMemo(() => {
    const together = new Map<string, string[]>();
    for (const line of lines) for (const stop of line.stops) {
      if (stop.hidden || !stop.row) continue;
      const key = `${stop.chapterIndex}|${stop.row}`;
      const list = together.get(key) || [];
      if (!list.includes(line.node.id)) list.push(line.node.id);
      together.set(key, list);
    }
    const crowd = new Map<string, number>();
    for (const [key, list] of together) {
      const place = key.split('|')[1];
      crowd.set(place, Math.max(crowd.get(place) || 0, list.length));
    }
    let top = 0;
    const bands = new Map<string, { top: number; height: number }>();
    for (const place of places) {
      const height = crowd.has(place.id) ? Math.max(MIN_BAND, 18 + STEP * crowd.get(place.id)!) : CONTAINER_BAND;
      bands.set(place.id, { top, height });
      top += height;
    }
    const pointsOf = (line: JourneyLine): Point[] => {
      const xs = line.stops.map(stop => stop.chapterIndex * COL_W + COL_W * (stop.order + 1) / (stop.count + 1));
      const ys = line.stops.map(stop => {
        if (stop.hidden || !stop.row) return null;
        const band = bands.get(stop.row)!;
        const group = together.get(`${stop.chapterIndex}|${stop.row}`) || [line.node.id];
        return band.top + band.height / 2 + (group.indexOf(line.node.id) - (group.length - 1) / 2) * STEP;
      });
      if (ys.every(y => y === null)) return [];
      return line.stops.map((stop, i) => {
        const known = ys[i];
        if (known !== null) return { stop, x: xs[i], y: known };
        let p = i - 1;
        while (p >= 0 && ys[p] === null) p--;
        let n = i + 1;
        while (n < ys.length && ys[n] === null) n++;
        const y = p >= 0 && n < ys.length
          ? ys[p]! + (ys[n]! - ys[p]!) * (xs[i] - xs[p]) / ((xs[n] - xs[p]) || 1)
          : p >= 0 ? ys[p]! : ys[n]!;
        return { stop, x: xs[i], y };
      });
    };
    return { bands, height: Math.max(top, MIN_BAND), pointsOf };
  }, [lines, places]);

  // Each top-level place and the places inside it read as one group: a faint
  // line under it, and stripes that alternate by group rather than by row.
  const { groupLines, stripeOf } = useMemo(() => {
    const ends: number[] = [];
    const stripes = new Map<string, boolean>();
    let group = -1;
    rows.forEach((row, i) => {
      if (row.depth === 0) group++;
      stripes.set(row.place.id, group % 2 === 0);
      const next = rows[i + 1];
      if (next && next.depth === 0) {
        const band = layout.bands.get(row.place.id)!;
        ends.push(band.top + band.height);
      }
    });
    return { groupLines: ends, stripeOf: stripes };
  }, [rows, layout]);

  const drawable = useMemo(() => lines.map(line => {
    const points = layout.pointsOf(line);
    const segments = points.slice(1).map((q, i) => {
      const p = points[i];
      const dx = (q.x - p.x) / 2;
      return { d: `M${p.x},${p.y} C${p.x + dx},${p.y} ${q.x - dx},${q.y} ${q.x},${q.y}`,
        gap: q.stop.chapterIndex - p.stop.chapterIndex > 1 };
    });
    return { line, points, segments };
  }).filter(d => d.points.length > 0), [lines, layout]);

  // One label per group of lines that start (or come back) together, instead of names stacked on each other.
  const labels = useMemo(() => {
    const groups = new Map<string, { x: number; y: number; ids: string[]; names: string[] }>();
    for (const { line, points, segments } of drawable) {
      points.forEach((p, i) => {
        if (i > 0 && !segments[i - 1].gap) return;
        const key = `${p.stop.chapterIndex}|${p.stop.row ?? 'off'}|${p.stop.order}`;
        const group = groups.get(key) || { x: p.x, y: p.y, ids: [], names: [] };
        group.y = Math.min(group.y, p.y);
        group.ids.push(line.node.id);
        group.names.push(line.node.name);
        groups.set(key, group);
      });
    }
    return [...groups.values()];
  }, [drawable]);

  // Hovering a line or a name shows that journey; hovering an event shows the people in it.
  const focus = useMemo(() => (hoverEvent ? new Set(hoverEvent.participants) : hoverLine ? new Set([hoverLine]) : null),
    [hoverEvent, hoverLine]);
  const faded = (id: string) => !!focus && !focus.has(id);

  /** The shown place under a pointer height: its top and bottom edges put a place beside it, its middle inside it. */
  const dropTarget = (clientY: number): { id: string; zone: Zone } | null => {
    const top = placesRef.current?.getBoundingClientRect().top ?? 0;
    const y = clientY - top;
    for (const row of rows) {
      const band = layout.bands.get(row.place.id)!;
      if (y >= band.top + band.height) continue;
      const at = (y - band.top) / band.height;
      let zone: Zone = at < 0.3 ? 'before' : at > 0.7 ? 'after' : 'inside';
      // Just below an open container is the top of its insides.
      if (zone === 'after' && row.inside > 0 && !collapsed.has(row.place.id)) zone = 'inside';
      return { id: row.place.id, zone };
    }
    const last = rows[rows.length - 1];
    return last ? { id: last.place.id, zone: 'after' } : null;
  };
  const onPlacePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return;
    press.current = { id, y: e.clientY, pointer: e.pointerId };
  };
  const onPlacePointerMove = (e: React.PointerEvent) => {
    const start = press.current;
    if (!start || start.pointer !== e.pointerId) return;
    const dy = e.clientY - start.y;
    if (!drag && Math.abs(dy) < 5) return;
    if (!drag) e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: start.id, dy });
    setDropAt(dropTarget(e.clientY));
  };
  const onPlacePointerUp = () => {
    if (drag && dropAt && drag.id !== dropAt.id) placeAt(drag.id, dropAt.id, dropAt.zone);
    if (drag) justDragged.current = true;
    press.current = null;
    setDrag(null);
    setDropAt(null);
  };

  /** The hovered person's name (and place, over a stop) beside the pointer, in the app's tooltip. */
  const showTip = (e: React.MouseEvent<SVGGElement>, node: GraphNode) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const marker = (e.target as SVGElement).dataset;
    const text = marker?.place
      ? `${node.name} · ${marker.place}${marker.off ? ` (${t('codex.journeys.offShort')})` : ''}`
      : node.name;
    setTip({ text, x: e.clientX - rect.left + el.scrollLeft, y: e.clientY - rect.top + el.scrollTop });
  };

  const plotW = ordered.length * COL_W;
  // Places are recorded from format 3 on; earlier reads cannot place anyone.
  const unread = (chapter: MemoryChapter): 'new' | 'format' | null =>
    !chapter.revision ? 'new' : (chapter.version ?? 1) < 3 ? 'format' : null;

  if (!hasTravellers) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium">{t('codex.journeys.emptyTitle')}</p>
          <p className="text-sm leading-relaxed opacity-60">{t('codex.journeys.empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-1">
      <div className="flex items-start gap-3 px-6 pb-2.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 rounded-full bg-[hsl(var(--notepad-fg)/0.05)] px-3 font-sans text-xs">
              {t('codex.journeys.pick', { count: characters.length })}
              <CaretDown weight="bold" className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0 font-sans">
            <Command>
              <CommandInput placeholder={t('codex.journeys.find')} />
              <CommandList>
                <CommandEmpty>{t('codex.noMatches')}</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="__top" onSelect={() => setSlots(null)}>{t('codex.journeys.top', { count: DEFAULT_SHOWN })}</CommandItem>
                  <CommandItem value="__none" onSelect={() => setSlots({})}>{t('codex.journeys.none')}</CommandItem>
                </CommandGroup>
                <CommandGroup>
                  {ranked.map(({ node, links }) => {
                    const slot = shown[node.id];
                    const on = slot !== undefined;
                    const full = !on && Object.keys(shown).length >= SLOTS;
                    return (
                      <CommandItem key={node.id} value={`${node.name} ${node.id}`} disabled={full} onSelect={() => toggle(node.id)}
                        className="gap-2">
                        <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0', on && squareOf(slot) ? 'rounded-[2px]' : 'rounded-full')}
                          style={{ background: on ? colorOf(slot) : 'transparent', boxShadow: on ? undefined : 'inset 0 0 0 1px currentColor' }} />
                        <span className="min-w-0 flex-1 truncate">{node.name}</span>
                        <span className="text-[11px] opacity-50">{t('codex.journeys.links', { count: links })}</span>
                        {on && <Check weight="bold" className="h-3 w-3 opacity-60" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 pt-1.5 text-xs" aria-label={t('codex.journeys.characters')}>
          {/* Hovering a name fades every other journey. */}
          {characters.map(node => (
            <span key={node.id} onMouseEnter={() => setHoverLine(node.id)} onMouseLeave={() => setHoverLine(null)}
              className={cn('inline-flex cursor-default items-center gap-1.5 transition-opacity', faded(node.id) && 'opacity-35')}>
              <span aria-hidden="true" className={cn('h-2 w-2', squareOf(shown[node.id]) ? 'rounded-[2px]' : 'rounded-full')}
                style={{ background: colorOf(shown[node.id]) }} />
              {node.name}
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto border-t border-[hsl(var(--notepad-fg)/0.08)]" onScroll={syncViewport}
        onMouseLeave={() => { setHoverChapter(null); setHoverLine(null); setTip(null); }}>
        {/* The grid is as wide as the chart, so the sticky place column can stay in view all the way across. */}
        <div className="relative grid" style={{
          width: labelW + plotW,
          gridTemplateColumns: `${labelW}px ${plotW}px`,
          gridTemplateRows: [HEADER_H, eventsH, layout.height].filter(Boolean).map(h => `${h}px`).join(' '),
        }}>
          {/* Corner */}
          <div className="sticky left-0 top-0 z-30 bg-[hsl(var(--notepad-bg))]">{edge(false)}</div>
          {/* Chapters */}
          <div className="sticky top-0 z-20 flex bg-[hsl(var(--notepad-bg))]">
            {ordered.map((chapter, ci) => (
              <button key={chapter.id} type="button" onClick={() => onOpenChapter(chapter.id)} title={chapter.title}
                onMouseEnter={() => { syncViewport(); setHoverChapter(ci); }}
                className={cn('flex shrink-0 flex-col justify-end border-b border-[hsl(var(--notepad-fg)/0.08)] px-2 pb-2 text-left',
                  hoverChapter === ci && 'bg-[hsl(var(--notepad-fg)/0.05)]', unread(chapter) && 'opacity-40')}
                style={{ width: COL_W }}>
                <span className="line-clamp-2 text-[11px] leading-tight">{chapter.title || t('story.infoUntitled')}</span>
              </button>
            ))}
          </div>
          {/* Events */}
          {eventsH > 0 && <>
            {/* Opaque, so event pills scrolled under the column do not show through. */}
            <div className="sticky left-0 z-20 bg-[hsl(var(--notepad-bg))] pl-7 text-xs" style={{ paddingTop: EVENT_PAD + 4 }}>
              <span className="flex items-start gap-1.5 opacity-60">
                <Lightning weight="duotone" className="mt-px h-3.5 w-3.5" aria-hidden="true" />
                {t('codex.journeys.events')}
              </span>
              {edge(false)}
            </div>
            <div className="relative border-b border-[hsl(var(--notepad-fg)/0.06)]" onMouseEnter={() => setHoverChapter(null)}>
              {ordered.map((chapter, ci) => {
                const list = events[ci];
                if (!list.length) return null;
                const pills = list.length > MAX_EVENT_ROWS ? list.slice(0, MAX_EVENT_ROWS - 1) : list;
                const rest = list.slice(pills.length);
                return (
                  <div key={chapter.id} className="absolute flex flex-col items-start gap-1 px-1.5" style={{ left: ci * COL_W, width: COL_W, top: EVENT_PAD }}>
                    {pills.map(event => (
                      <EventPill key={event.node.id} event={event} graph={graph}
                        onHover={setHoverEvent} onOpen={() => onSelectNode(event.node.id)} />
                    ))}
                    {rest.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="rounded-full px-2 py-0.5 text-[11px] opacity-60 hover:opacity-100">
                            {t('codex.journeys.moreEvents', { count: rest.length })}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <ul className="space-y-0.5">{rest.map(event => <li key={event.node.id}>{event.node.name}</li>)}</ul>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </>}
          {/* Places */}
          <div ref={placesRef} className="sticky left-0 z-20 bg-[hsl(var(--notepad-bg))]">
            {edge(true)}
            {groupLines.map(y => (
              <span key={y} aria-hidden="true" className="pointer-events-none absolute left-2 right-0 h-px bg-[hsl(var(--notepad-fg)/0.08)]" style={{ top: y }} />
            ))}
            {rows.map(row => {
              const { place, depth, inside } = row;
              const band = layout.bands.get(place.id)!;
              const dragged = drag?.id === place.id;
              const target = drag && !dragged && dropAt?.id === place.id && !isInside(place.id, drag.id) ? dropAt.zone : null;
              const open = !collapsed.has(place.id);
              return (
                <div key={place.id}
                  onPointerDown={e => onPlacePointerDown(e, place.id)} onPointerMove={onPlacePointerMove}
                  onPointerUp={onPlacePointerUp} onPointerCancel={onPlacePointerUp}
                  onClickCapture={e => { if (justDragged.current) { justDragged.current = false; e.preventDefault(); e.stopPropagation(); } }}
                  className={cn('group/place absolute left-0 flex w-full touch-none select-none items-center gap-0.5 pl-2 pr-1 text-xs',
                    dragged && 'z-10 rounded-md bg-[hsl(var(--notepad-bg))] shadow-md ring-1 ring-[hsl(var(--notepad-fg)/0.1)]',
                    target === 'inside' && 'rounded-md bg-[hsl(var(--codex-brand)/0.1)] ring-1 ring-[hsl(var(--codex-brand)/0.5)]')}
                  style={{ top: band.top, height: band.height, transform: dragged ? `translateY(${drag!.dy}px)` : undefined }}>
                  {(target === 'before' || target === 'after') && (
                    <span aria-hidden="true" className={cn('pointer-events-none absolute right-1 h-0.5 rounded-full bg-[hsl(var(--codex-brand))]',
                      target === 'after' ? '-bottom-px' : '-top-px')} style={{ left: 28 + depth * INDENT }} />
                  )}
                  <button type="button" aria-label={t('codex.journeys.move', { name: place.name })} onKeyDown={e => onHandleKey(e, row)}
                    className={cn('flex h-6 w-4 shrink-0 cursor-grab items-center justify-center transition-opacity focus-visible:opacity-60 group-hover/place:opacity-40 active:cursor-grabbing',
                      dragged ? 'opacity-60' : 'opacity-0')}>
                    <DotsSixVertical weight="bold" className="h-3 w-3" />
                  </button>
                  <div className="flex min-w-0 flex-1 items-center gap-0.5" style={{ paddingLeft: depth * INDENT }}>
                    {inside > 0 ? (
                      <button type="button" data-no-drag onClick={() => toggleOpen(place.id)} aria-expanded={open}
                        aria-label={t(open ? 'codex.journeys.collapse' : 'codex.journeys.expand', { name: place.name })}
                        className="flex h-5 w-4 shrink-0 items-center justify-center rounded opacity-50 hover:opacity-100">
                        <CaretRight weight="bold" className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
                      </button>
                    ) : <span className="w-4 shrink-0" />}
                    <button type="button" onClick={() => onSelectNode(place.id)} title={place.name}
                      className="min-w-0 truncate text-left underline-offset-2 hover:underline">
                      {place.name}
                    </button>
                    {!open && <span className="shrink-0 pl-1 text-[10px] opacity-40">+{inside}</span>}
                  </div>
                  <button type="button" data-no-drag onClick={() => setHidden(place.id, true)} aria-label={t('codex.journeys.hide', { name: place.name })}
                    title={t('codex.journeys.hide', { name: place.name })}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-[hsl(var(--notepad-fg)/0.06)] focus-visible:opacity-70 group-hover/place:opacity-50">
                    <EyeClosed weight="duotone" className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {/* Plot */}
          <svg width={plotW} height={layout.height} className="block overflow-visible" role="img"
            onMouseMove={e => {
              syncViewport();
              setHoverChapter(Math.min(ordered.length - 1, Math.max(0,
                Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / COL_W))));
            }}
            aria-label={t('codex.journeys.summary', { count: characters.length, places: places.length })}>
            <defs>
              <pattern id="codex-unread" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--notepad-fg) / 0.07)" strokeWidth="2" />
              </pattern>
            </defs>
            {rows.map(row => {
              const band = layout.bands.get(row.place.id)!;
              return stripeOf.get(row.place.id) ? <rect key={row.place.id} x={0} y={band.top} width={plotW} height={band.height} fill="hsl(var(--notepad-fg) / 0.025)" /> : null;
            })}
            {groupLines.map(y => <line key={y} x1={0} x2={plotW} y1={y} y2={y} stroke="hsl(var(--notepad-fg) / 0.08)" />)}
            {ordered.map((chapter, ci) => (
              <g key={chapter.id}>
                {unread(chapter) && <rect x={ci * COL_W} y={0} width={COL_W} height={layout.height} fill="url(#codex-unread)" />}
                {hoverChapter === ci && <rect x={ci * COL_W} y={0} width={COL_W} height={layout.height} fill="hsl(var(--notepad-fg) / 0.04)" />}
                <line x1={(ci + 1) * COL_W} y1={0} x2={(ci + 1) * COL_W} y2={layout.height} stroke="hsl(var(--notepad-fg) / 0.05)" />
              </g>
            ))}
            {drawable.map(({ line, points, segments }) => {
              const color = colorOf(shown[line.node.id]);
              const square = squareOf(shown[line.node.id]);
              const lit = focus?.has(line.node.id);
              return (
                <g key={line.node.id} opacity={faded(line.node.id) ? 0.15 : 1} className="transition-opacity"
                  onMouseEnter={() => setHoverLine(line.node.id)}
                  onMouseMove={e => showTip(e, line.node)}
                  onMouseLeave={() => { setHoverLine(null); setTip(null); }}
                  onClick={() => onSelectNode(line.node.id)} style={{ cursor: 'pointer' }}>
                  {segments.map((s, i) => (
                    <g key={i}>
                      <path d={s.d} fill="none" stroke="hsl(var(--notepad-bg))" strokeWidth={5} />
                      <path d={s.d} fill="none" stroke={color} strokeWidth={lit ? 3 : 2}
                        strokeDasharray={s.gap ? '2 5' : undefined} strokeLinecap="round" />
                      <path d={s.d} fill="none" stroke="transparent" strokeWidth={12} />
                    </g>
                  ))}
                  {points.map((p, i) => {
                    // A stop at a turned-off place is hollow: they are somewhere, just not shown.
                    const marker = { 'data-place': p.stop.place.name, ...(p.stop.hidden ? { 'data-off': '1' } : {}) };
                    const fill = p.stop.hidden ? 'hsl(var(--notepad-bg))' : color;
                    const stroke = p.stop.hidden ? color : 'hsl(var(--notepad-bg))';
                    const strokeWidth = p.stop.hidden ? 1.5 : 2;
                    return square
                      ? <rect key={i} {...marker} x={p.x - 4} y={p.y - 4} width={8} height={8} rx={1.5} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
                      : <circle key={i} {...marker} cx={p.x} cy={p.y} r={p.stop.hidden ? 3.5 : 4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                  })}
                </g>
              );
            })}
            {labels.map((label, i) => {
              const lit = focus ? label.names.filter((_, j) => focus.has(label.ids[j])) : label.names;
              const names = lit.length ? lit : label.names;
              const text = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
              return (
                <text key={i} x={label.x + 7} y={label.y - 7} fontSize={10} fill="hsl(var(--notepad-fg) / 0.8)"
                  opacity={focus && !lit.length ? 0.15 : 1} stroke="hsl(var(--notepad-bg))" strokeWidth={3} paintOrder="stroke"
                  style={{ pointerEvents: 'none' }}>
                  {text}
                </text>
              );
            })}
          </svg>
        </div>
        {hoverChapter !== null && (
          <ChapterTooltip chapter={ordered[hoverChapter]} groups={whereInChapter(lines, places, hoverChapter)}
            offGroups={unshownInChapter(lines, hoverChapter)} shown={shown}
            left={labelW + hoverChapter * COL_W} labelW={labelW} viewport={viewport} />
        )}
        {/* Anchors the app's tooltip at the pointer while a line is hovered. */}
        <Tooltip open={!!tip}>
          <TooltipTrigger asChild>
            <span aria-hidden="true" className="pointer-events-none absolute h-px w-px" style={{ left: tip?.x ?? 0, top: tip?.y ?? 0 }} />
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={10} updatePositionStrategy="always">{tip?.text}</TooltipContent>
        </Tooltip>
      </div>

      {hiddenPlaces.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[hsl(var(--notepad-fg)/0.08)] px-6 py-2">
          <span className="mr-0.5 text-xs opacity-50">{t('codex.journeys.hiddenPlaces')}</span>
          {hiddenPlaces.map(place => (
            <button key={place.id} type="button" onClick={() => setHidden(place.id, false)} title={t('codex.journeys.show', { name: place.name })}
              className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--notepad-fg)/0.05)] px-2.5 py-0.5 text-xs opacity-70 transition hover:bg-[hsl(var(--notepad-fg)/0.08)] hover:opacity-100">
              <Eye weight="duotone" className="h-3.5 w-3.5" />
              {place.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A major event in the strip above the places; hovering it shows the journeys of the people in it. */
function EventPill({ event, graph, onHover, onOpen }: {
  event: JourneyEvent; graph: MemoryGraph; onHover: (event: JourneyEvent | null) => void; onOpen: () => void;
}) {
  const { t } = useTranslation();
  const names = event.participants.map(id => graph.nodeById.get(id)?.name).filter(Boolean);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onOpen}
          onMouseEnter={() => onHover(event)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(event)} onBlur={() => onHover(null)}
          className="flex max-w-full items-center gap-1 rounded-full bg-[hsl(var(--notepad-fg)/0.06)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[hsl(var(--notepad-fg)/0.1)]">
          <Lightning weight="duotone" className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
          <span className="truncate">{event.node.name}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {event.node.name}
        {names.length > 0 && <span className="block opacity-70">{t('codex.journeys.with', { names: names.join(', ') })}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** "Where is everyone" in the hovered chapter, kept inside the visible part of the chart. */
function ChapterTooltip({ chapter, groups, offGroups, shown, left, labelW, viewport }: {
  chapter: MemoryChapter;
  groups: { place: GraphNode; people: { node: GraphNode; within: GraphNode[] }[] }[];
  offGroups: { place: GraphNode; people: GraphNode[] }[];
  shown: Record<string, number>;
  left: number;
  labelW: number;
  viewport: Viewport;
}) {
  const { t } = useTranslation();
  const width = 220;
  const minX = viewport.left + labelW + 8;
  const maxX = viewport.left + viewport.width - width - 8;
  const beside = left + COL_W + 8;
  const x = Math.max(minX, beside <= maxX ? beside : Math.min(maxX, left - width - 8));
  // Pinned just under the sticky chapter titles, and never taller than what is in view.
  const top = viewport.top + HEADER_H + 8;
  const maxHeight = Math.max(96, viewport.height - HEADER_H - 16);
  // People rolled up from a place inside this one say where they actually are.
  const people = (list: { node: GraphNode; within: GraphNode[] }[]) => (
    <p className="flex flex-wrap gap-x-2">
      {list.map(({ node, within }) => (
        <span key={node.id} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className={cn('h-1.5 w-1.5', squareOf(shown[node.id]) ? 'rounded-[1px]' : 'rounded-full')}
            style={{ background: colorOf(shown[node.id]) }} />
          {node.name}
          {within.length > 0 && <span className="opacity-50">· {within.map(w => w.name).join(', ')}</span>}
        </span>
      ))}
    </p>
  );
  return (
    <div className="pointer-events-none absolute z-40 overflow-hidden rounded-lg bg-[hsl(var(--notepad-bg))] p-3 text-xs shadow-lg ring-1 ring-[hsl(var(--notepad-fg)/0.08)]"
      style={{ left: x, top, width, maxHeight }}>
      <p className="mb-2 font-medium">{chapter.title || t('story.infoUntitled')}</p>
      {groups.length || offGroups.length ? (
        <ul className="space-y-1.5">
          {groups.map(({ place, people: list }) => (
            <li key={place.id}>
              <p className="opacity-50">{place.name}</p>
              {people(list)}
            </li>
          ))}
          {offGroups.map(({ place, people: list }) => (
            <li key={place.id} className="opacity-60">
              <p className="opacity-50">{place.name} · {t('codex.journeys.offShort')}</p>
              {people(list.map(node => ({ node, within: [] })))}
            </li>
          ))}
        </ul>
      ) : <p className="opacity-50">{t('codex.journeys.nobody')}</p>}
    </div>
  );
}
