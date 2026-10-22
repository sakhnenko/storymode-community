import { useMemo, useRef, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotepads, Notepad } from '@/hooks/useNotepads';
import { supabase } from '@/integrations/supabase/client';
import { extractDates, DateEntry } from '@/lib/date-parser';
import { getThemeById } from '@/lib/notepad-themes';
import { MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsIn, X } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ViewLoadingOverlay } from '@/components/ui/ViewLoadingOverlay';
import { Markdown } from '@/components/Markdown';
import { NotepadCard } from '@/components/notepad/NotepadCard';
import { format, differenceInDays, addDays, addMonths, addYears, startOfDay, startOfMonth, startOfYear } from 'date-fns';

// --- Date extraction cache ---
const dateCache = new Map<string, DateEntry[]>();

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

function buildCacheKey(notepads: Notepad[]): string {
  return notepads
    .map(n => `${n.id}:${n.theme}:${simpleHash(n.content ?? '')}`)
    .sort()
    .join('|');
}

function cachedExtractDates(notepads: Notepad[]): DateEntry[] {
  const key = buildCacheKey(notepads);
  const cached = dateCache.get(key);
  if (cached) return cached;
  const result = extractDates(notepads);
  if (dateCache.size > 10) {
    const first = dateCache.keys().next().value;
    if (first) dateCache.delete(first);
  }
  dateCache.set(key, result);
  return result;
}

// --- Zoom/scroll persistence ---
function getStorageKey(gridId: string) {
  return `timeline-view-${gridId}`;
}

function saveViewState(gridId: string, pxPerDay: number, viewOrigin: number) {
  try {
    localStorage.setItem(getStorageKey(gridId), JSON.stringify({ pxPerDay, viewOrigin }));
  } catch { /* storage unavailable: not remembered */ }
}

function loadViewState(gridId: string): { pxPerDay: number; viewOrigin: number } | null {
  try {
    const raw = localStorage.getItem(getStorageKey(gridId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.pxPerDay === 'number' && typeof parsed.viewOrigin === 'number') return parsed;
  } catch { /* missing or malformed: use the defaults */ }
  return null;
}

interface CanvasGroupInfo {
  id: string;
  title: string;
  icon: string;
}

interface TimelineViewProps {
  gridId: string;
  externalNotepads?: Notepad[];
  canvasGroups?: CanvasGroupInfo[];
  readOnly?: boolean;
  onEmptyChange?: (empty: boolean) => void;
}

const MIN_PX_PER_DAY = 0.001;
const MAX_PX_PER_DAY = 64;
const MERGE_THRESHOLD_PX = 6;
const MIN_GAP_PX = 4;
const ELEMENT_SIZE = 16;
const SUB_ROW_HEIGHT = 28;
const ROW_PADDING = 12;
const HEADER_HEIGHT = 40;
const DEFAULT_LABEL_WIDTH = 160;
const MIN_LABEL_WIDTH = 120;
const MAX_LABEL_WIDTH = 360;
const VIEWPORT_BUFFER = 100;

function clampLabelWidth(width: number): number {
  return Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, width));
}

function getLabelWidthStorageKey(gridId: string) {
  return `${getStorageKey(gridId)}-label-width`;
}

function loadLabelWidth(gridId: string): number {
  try {
    const raw = localStorage.getItem(getLabelWidthStorageKey(gridId));
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed)) return clampLabelWidth(parsed);
  } catch { /* missing or malformed: use the default */ }
  return DEFAULT_LABEL_WIDTH;
}

function saveLabelWidth(gridId: string, width: number) {
  try {
    localStorage.setItem(getLabelWidthStorageKey(gridId), String(clampLabelWidth(width)));
  } catch { /* storage unavailable: not remembered */ }
}

interface RowEntry extends DateEntry {
  subRow: number;
}

function assignSubRows(entries: DateEntry[]): RowEntry[] {
  const sorted = [...entries].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const result: RowEntry[] = [];
  const subRowEnds: number[] = [];

  for (const entry of sorted) {
    const s = entry.startDate.getTime();
    let placed = false;
    for (let i = 0; i < subRowEnds.length; i++) {
      if (s >= subRowEnds[i]) {
        subRowEnds[i] = entry.endDate.getTime();
        result.push({ ...entry, subRow: i });
        placed = true;
        break;
      }
    }
    if (!placed) {
      subRowEnds.push(entry.endDate.getTime());
      result.push({ ...entry, subRow: subRowEnds.length - 1 });
    }
  }
  return result;
}

function getTickInterval(pxPerDay: number): { unit: 'day' | 'week' | 'month' | 'year'; step: number } {
  if (pxPerDay >= 32) return { unit: 'day', step: 1 };
  if (pxPerDay >= 8) return { unit: 'week', step: 1 };
  if (pxPerDay >= 2) return { unit: 'month', step: 1 };
  if (pxPerDay >= 0.5) return { unit: 'year', step: 1 };
  if (pxPerDay >= 0.1) return { unit: 'year', step: 5 };
  if (pxPerDay >= 0.02) return { unit: 'year', step: 10 };
  if (pxPerDay >= 0.005) return { unit: 'year', step: 50 };
  return { unit: 'year', step: 100 };
}

/**
 * Merged entry in day-space (independent of viewOrigin/pan).
 * dayStart/dayEnd are day offsets from minDate.
 */
interface MergedDayEntry {
  entries: RowEntry[];
  dayStart: number;
  dayEnd: number;
  top: number;
  isPoint: boolean;
}

function getDayRenderedLeft(m: MergedDayEntry, pxPerDay: number): number {
  return m.isPoint ? m.dayStart * pxPerDay - ELEMENT_SIZE / 2 : m.dayStart * pxPerDay;
}

function getDayRenderedRight(m: MergedDayEntry, pxPerDay: number): number {
  if (m.isPoint) return m.dayStart * pxPerDay + ELEMENT_SIZE / 2;
  return m.dayStart * pxPerDay + Math.max((m.dayEnd - m.dayStart) * pxPerDay, ELEMENT_SIZE);
}

/**
 * Merge close entries in day-space. Only depends on pxPerDay (zoom), not viewOrigin (pan).
 */
function mergeCloseEntriesDay(entries: RowEntry[], minDate: Date, pxPerDay: number): MergedDayEntry[] {
  if (entries.length === 0) return [];

  const items: MergedDayEntry[] = entries.map(e => {
    const dayStart = differenceInDays(e.startDate, minDate);
    const dayEnd = differenceInDays(e.endDate, minDate);
    const spanDays = dayEnd - dayStart;
    const spanPx = spanDays * pxPerDay;
    const isPoint = spanDays <= 1 || spanPx < ELEMENT_SIZE;
    const top = ROW_PADDING + e.subRow * SUB_ROW_HEIGHT;
    return { entries: [e], dayStart, dayEnd: isPoint ? dayStart : dayEnd, top, isPoint };
  });

  items.sort((a, b) => getDayRenderedLeft(a, pxPerDay) - getDayRenderedLeft(b, pxPerDay));

  const merged: MergedDayEntry[] = [];
  let current: MergedDayEntry | null = null;

  for (const item of items) {
    if (!current) { current = item; continue; }
    const sameSubRow = current.top === item.top;
    const bothPoints = current.isPoint && item.isPoint;
    const gap = getDayRenderedLeft(item, pxPerDay) - getDayRenderedRight(current, pxPerDay);
    if (bothPoints && sameSubRow && gap < MERGE_THRESHOLD_PX) {
      current.entries.push(...item.entries);
    } else {
      merged.push(current);
      current = item;
    }
  }
  if (current) merged.push(current);

  // Resolve overlaps per sub-row
  const byTop = new Map<number, MergedDayEntry[]>();
  for (const m of merged) {
    const arr = byTop.get(m.top) ?? [];
    arr.push(m);
    byTop.set(m.top, arr);
  }

  for (const group of byTop.values()) {
    group.sort((a, b) => getDayRenderedLeft(a, pxPerDay) - getDayRenderedLeft(b, pxPerDay));
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      const prevRight = getDayRenderedRight(prev, pxPerDay);
      const currLeft = getDayRenderedLeft(curr, pxPerDay);
      if (currLeft < prevRight + MIN_GAP_PX) {
        const shiftPx = prevRight + MIN_GAP_PX - currLeft;
        const shiftDays = shiftPx / pxPerDay;
        curr.dayStart += shiftDays;
        if (!curr.isPoint) {
          curr.dayEnd += shiftDays;
        }
      }
    }
  }

  return merged;
}

function generateTicks(minDate: Date, maxDate: Date, interval: { unit: string; step: number }): Date[] {
  const ticks: Date[] = [];
  let current: Date;

  switch (interval.unit) {
    case 'day':
      current = startOfDay(minDate);
      while (current <= maxDate) { ticks.push(current); current = addDays(current, interval.step); }
      break;
    case 'week': {
      // Align to a fixed weekday anchor (epoch Monday)
      const daysSinceEpoch = Math.floor(minDate.getTime() / 86400000);
      const dayOfWeek = ((daysSinceEpoch % 7) + 7) % 7; // 0=Thu for epoch
      const alignedStart = startOfDay(addDays(minDate, -dayOfWeek));
      current = alignedStart;
      while (current <= maxDate) { ticks.push(current); current = addDays(current, 7 * interval.step); }
      break;
    }
    case 'month':
      current = startOfMonth(minDate);
      while (current <= maxDate) { ticks.push(current); current = addMonths(current, interval.step); }
      break;
    case 'year': {
      // Snap to multiples of step so ticks don't jump when panning
      const startYear = Math.floor(minDate.getFullYear() / interval.step) * interval.step;
      current = new Date(startYear, 0, 1);
      while (current <= maxDate) { ticks.push(current); current = addYears(current, interval.step); }
      break;
    }
  }
  return ticks;
}

function formatTick(date: Date, unit: string): string {
  switch (unit) {
    case 'day': return format(date, 'MMM d');
    case 'week': return format(date, 'MMM d');
    case 'month': return format(date, 'MMM yyyy');
    case 'year': return format(date, 'yyyy');
    default: return format(date, 'MMM d, yyyy');
  }
}

// Convert tick dates to day offsets once (zoom-independent)
function ticksToDayOffsets(ticks: Date[], minDate: Date): number[] {
  return ticks.map(t => differenceInDays(t, minDate));
}

export function TimelineView({ gridId, externalNotepads, canvasGroups, readOnly, onEmptyChange }: TimelineViewProps) {
  const { t } = useTranslation();
  const skipFetch = !!externalNotepads;
  const { notepads: fetchedNotepads, loading: fetchLoading } = useNotepads(skipFetch ? '' : gridId);
  const sourceNotepads = externalNotepads ?? fetchedNotepads;
  const loading = skipFetch ? false : fetchLoading;

  const [localEdits, setLocalEdits] = useState<Record<string, Partial<Notepad>>>({});
  const notepads = useMemo(() =>
    sourceNotepads.map(n => localEdits[n.id] ? { ...n, ...localEdits[n.id] } : n),
    [sourceNotepads, localEdits],
  );
  const [pxPerDay, setPxPerDay] = useState<number | null>(null);
  const pxPerDayRef = useRef<number | null>(null);
  pxPerDayRef.current = pxPerDay;
  const [viewOrigin, setViewOrigin] = useState<number>(0);
  const viewOriginRef = useRef<number>(0);
  viewOriginRef.current = viewOrigin;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [labelWidth, setLabelWidth] = useState(() => loadLabelWidth(gridId));
  const labelWidthRef = useRef(labelWidth);
  labelWidthRef.current = labelWidth;
  const [previewNotepadId, setPreviewNotepadId] = useState<string | null>(null);
  const [previewFocused, setPreviewFocused] = useState(false);
  const rafRef = useRef<number | null>(null);
  const minPxPerDayRef = useRef<number>(MIN_PX_PER_DAY);
  const pendingUpdateRef = useRef<{ pxPerDay?: number; viewOrigin?: number } | null>(null);

  // Shared hover popup state
  const [hoveredEntries, setHoveredEntries] = useState<{ entries: DateEntry[]; x: number; y: number } | null>(null);
  const hoverPopupRef = useRef<HTMLDivElement>(null);
  const [hoverPopupH, setHoverPopupH] = useState(0);
  useEffect(() => {
    if (!hoveredEntries) { setHoverPopupH(0); return; }
    const h = hoverPopupRef.current?.offsetHeight ?? 0;
    if (h) setHoverPopupH(h);
  }, [hoveredEntries]);
  const hoverTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setLabelWidth(loadLabelWidth(gridId));
  }, [gridId]);

  const handleLabelResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = labelWidthRef.current;

    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampLabelWidth(startWidth + moveEvent.clientX - startX);
      labelWidthRef.current = nextWidth;
      setLabelWidth(nextWidth);
    };

    const handleUp = () => {
      saveLabelWidth(gridId, labelWidthRef.current);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }, [gridId]);

  const handleEntryMouseEnter = useCallback((entries: DateEntry[], e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Use mouse X position (not element center) so range items show popup where cursor is
    setHoveredEntries({ entries, x: e.clientX, y: rect.top });
  }, []);

  const handleEntryMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredEntries(null);
    }, 200);
  }, []);

  const handlePopupMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handlePopupMouseLeave = useCallback(() => {
    setHoveredEntries(null);
  }, []);

  // Batched state update via RAF
  const flushUpdate = useCallback(() => {
    rafRef.current = null;
    const pending = pendingUpdateRef.current;
    if (!pending) return;
    pendingUpdateRef.current = null;
    if (pending.pxPerDay !== undefined) setPxPerDay(pending.pxPerDay);
    if (pending.viewOrigin !== undefined) setViewOrigin(pending.viewOrigin);
  }, []);

  const scheduleUpdate = useCallback((update: { pxPerDay?: number; viewOrigin?: number }) => {
    pendingUpdateRef.current = { ...pendingUpdateRef.current, ...update };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushUpdate);
    }
  }, [flushUpdate]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const previewNotepad = useMemo(() => {
    if (!previewNotepadId) return null;
    return notepads.find(n => n.id === previewNotepadId) ?? null;
  }, [previewNotepadId, notepads]);

  const allEntries = useMemo(() => cachedExtractDates(notepads), [notepads]);

  const groupedByNotepad = useMemo(() => {
    const map = new Map<string, { title: string; theme: string; entries: DateEntry[] }>();
    for (const entry of allEntries) {
      if (!map.has(entry.notepadId)) {
        map.set(entry.notepadId, { title: entry.notepadTitle, theme: entry.notepadTheme, entries: [] });
      }
      map.get(entry.notepadId)!.entries.push(entry);
    }
    return map;
  }, [allEntries]);

  const { minDate, maxDate, dataPadDays } = useMemo(() => {
    if (allEntries.length === 0) {
      const now = new Date();
      return { minDate: addDays(now, -30), maxDate: addDays(now, 30), dataPadDays: 30 };
    }
    let min = allEntries[0].startDate.getTime();
    let max = allEntries[0].endDate.getTime();
    for (const e of allEntries) {
      if (e.startDate.getTime() < min) min = e.startDate.getTime();
      if (e.endDate.getTime() > max) max = e.endDate.getTime();
    }
    const spanDays = differenceInDays(new Date(max), new Date(min));
    const pad = Math.max(spanDays * 0.015, 14);
    return {
      minDate: addDays(new Date(min), -pad),
      maxDate: addDays(new Date(max), pad),
      dataPadDays: pad,
    };
  }, [allEntries]);

  const totalDays = differenceInDays(maxDate, minDate);
  const totalDaysRef = useRef(totalDays);
  totalDaysRef.current = totalDays;
  const dataEndDay = totalDays - dataPadDays;
  const dataEndDayRef = useRef(dataEndDay);
  dataEndDayRef.current = dataEndDay;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalDays <= 0) return;
    const availableWidth = el.clientWidth - labelWidth;
    if (availableWidth > 0) {
      minPxPerDayRef.current = Math.max(MIN_PX_PER_DAY, (availableWidth / totalDays) * 0.5);
    }
  }, [totalDays, labelWidth]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const availableWidth = el.clientWidth - labelWidth;
      if (availableWidth > 0 && totalDaysRef.current > 0) {
        minPxPerDayRef.current = Math.max(MIN_PX_PER_DAY, (availableWidth / totalDaysRef.current) * 0.5);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [labelWidth]);

  useEffect(() => {
    if (pxPerDay !== null) return;
    if (totalDays <= 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const containerWidth = el.clientWidth;
    if (containerWidth <= 0) return;

    const saved = loadViewState(gridId);
    if (saved) {
      const fitPx = (containerWidth - labelWidth) / totalDays;
      const clampedMin = Math.max(MIN_PX_PER_DAY, fitPx);
      setPxPerDay(Math.max(clampedMin, Math.min(MAX_PX_PER_DAY, saved.pxPerDay)));
      setViewOrigin(saved.viewOrigin);
      return;
    }

    const availableWidth = containerWidth - labelWidth;
    const idealPxPerDay = availableWidth / totalDays;
    setPxPerDay(Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, idealPxPerDay)));
    setViewOrigin(0);
  }, [totalDays, pxPerDay, allEntries, gridId, labelWidth]);

  useEffect(() => {
    if (pxPerDay === null) return;
    const timer = setTimeout(() => {
      saveViewState(gridId, pxPerDay, viewOrigin);
    }, 300);
    return () => clearTimeout(timer);
  }, [gridId, pxPerDay, viewOrigin]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const currentPx = pxPerDayRef.current ?? 1;
      const currentOrigin = viewOriginRef.current;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const rect = el.getBoundingClientRect();
        const mouseXInTimeline = e.clientX - rect.left - labelWidth;
        const dayAtMouse = currentOrigin + mouseXInTimeline / currentPx;

        const delta = -e.deltaY;
        const zoomFactor = Math.pow(1.008, delta);
        const newPx = Math.max(minPxPerDayRef.current, Math.min(MAX_PX_PER_DAY, currentPx * zoomFactor));
        let newOrigin = dayAtMouse - mouseXInTimeline / newPx;

        const viewportDays = (el.clientWidth - labelWidth) / newPx;
        const maxOrigin = Math.max(0, dataEndDayRef.current - viewportDays * 0.9);
        newOrigin = Math.max(0, Math.min(maxOrigin, newOrigin));

        viewOriginRef.current = newOrigin;
        pxPerDayRef.current = newPx;
        scheduleUpdate({ pxPerDay: newPx, viewOrigin: newOrigin });
      } else if (e.deltaX !== 0) {
        e.preventDefault();
        const viewportDays = (el.clientWidth - labelWidth) / currentPx;
        const maxOrigin = Math.max(0, dataEndDayRef.current - viewportDays * 0.9);
        const newOrigin = Math.max(0, Math.min(maxOrigin, currentOrigin + e.deltaX / currentPx));
        viewOriginRef.current = newOrigin;
        scheduleUpdate({ viewOrigin: newOrigin });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [loading, scheduleUpdate, labelWidth]);

  const effectivePxPerDay = pxPerDay ?? 1;

  const tickInterval = getTickInterval(effectivePxPerDay);

  // PERF: Generate ticks only for visible viewport + buffer, not the entire date range.
  // This keeps tick count constant (~20-50) regardless of total timeline span.
  const viewportWidth = scrollRef.current ? scrollRef.current.clientWidth - labelWidth : 1200;
  const bufferDays = VIEWPORT_BUFFER * 2 / effectivePxPerDay;
  const visibleMinDay = viewOrigin - bufferDays;
  const visibleMaxDay = viewOrigin + (viewportWidth + VIEWPORT_BUFFER * 2) / effectivePxPerDay + bufferDays;
  const visibleMinDate = addDays(minDate, Math.floor(visibleMinDay));
  const visibleMaxDate = addDays(minDate, Math.ceil(visibleMaxDay));

  const ticks = useMemo(() => generateTicks(visibleMinDate, visibleMaxDate, tickInterval), [visibleMinDate.getTime(), visibleMaxDate.getTime(), tickInterval.unit, tickInterval.step]);

  // Pre-compute tick day offsets
  const tickDayOffsets = useMemo(() => ticksToDayOffsets(ticks, minDate), [ticks, minDate]);

  const rows = useMemo(() => {
    const result: { notepadId: string; title: string; theme: string; entries: RowEntry[]; subRowCount: number; notepadGridId: string | null }[] = [];
    for (const [notepadId, group] of groupedByNotepad) {
      const entries = assignSubRows(group.entries);
      const subRowCount = entries.length > 0 ? Math.max(...entries.map(e => e.subRow)) + 1 : 1;
      const notepad = notepads.find(n => n.id === notepadId);
      result.push({ notepadId, title: group.title, theme: group.theme, entries, subRowCount, notepadGridId: notepad?.grid_id ?? null });
    }
    if (canvasGroups && canvasGroups.length > 0) {
      const groupOrder = new Map(canvasGroups.map((g, i) => [g.id, i]));
      result.sort((a, b) => {
        const aOrder = groupOrder.get(a.notepadGridId ?? '') ?? 999;
        const bOrder = groupOrder.get(b.notepadGridId ?? '') ?? 999;
        return aOrder - bOrder;
      });
    }
    return result;
  }, [groupedByNotepad, canvasGroups, notepads]);

  const canvasGroupMap = useMemo(() => {
    if (!canvasGroups) return null;
    return new Map(canvasGroups.map(g => [g.id, g]));
  }, [canvasGroups]);

  const canvasHeaderIndices = useMemo(() => {
    if (!canvasGroupMap) return new Map<number, CanvasGroupInfo>();
    const result = new Map<number, CanvasGroupInfo>();
    let lastGridId: string | null = null;
    rows.forEach((row, i) => {
      if (row.notepadGridId !== lastGridId) {
        const group = canvasGroupMap.get(row.notepadGridId ?? '');
        if (group) result.set(i, group);
        lastGridId = row.notepadGridId;
      }
    });
    return result;
  }, [rows, canvasGroupMap]);

  // PERF: Merge entries in day-space — only recomputes when zoom changes, NOT on pan
  const mergedByRow = useMemo(() => {
    const result = new Map<string, MergedDayEntry[]>();
    for (const row of rows) {
      result.set(row.notepadId, mergeCloseEntriesDay(row.entries, minDate, effectivePxPerDay));
    }
    return result;
  }, [rows, minDate, effectivePxPerDay]);

  // Report emptiness to parents (used to trigger onboarding modals).
  const isEmpty = !loading && allEntries.length === 0;
  useEffect(() => {
    onEmptyChange?.(isEmpty);
  }, [isEmpty, onEmptyChange]);

  if (loading) {
    return <ViewLoadingOverlay view="timeline" />;
  }

  if (allEntries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('notepad.timeline.emptyState')}</p>
      </div>
    );
  }

  // dayToX helper for rendering
  const dayToX = (dayOffset: number) => (dayOffset - viewOrigin) * effectivePxPerDay;

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={scrollRef}>
        <div className="flex">
          {/* Labels Column */}
          <div className="shrink-0 z-20 bg-background border-r border-border relative" style={{ width: labelWidth }}>
            <div className="border-b border-border" style={{ height: HEADER_HEIGHT }} />
            {rows.map((row, rowIndex) => {
              const theme = getThemeById(row.theme);
              const rowHeight = row.subRowCount * SUB_ROW_HEIGHT + ROW_PADDING * 2;
              const canvasHeader = canvasHeaderIndices.get(rowIndex);
              return (
                <div key={row.notepadId}>
                  {canvasHeader && (
                    <div className="flex items-center gap-2 px-3 border-b border-border bg-muted/60" style={{ height: 28 }}>
                      <span className="text-sm">{canvasHeader.icon}</span>
                      <span className="text-xs font-semibold text-foreground truncate">{canvasHeader.title}</span>
                    </div>
                  )}
                  <div
                    className="flex items-center gap-2 px-3 border-b border-border"
                    style={{ height: rowHeight, backgroundColor: theme.preview.bg + '18' }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs font-medium truncate text-foreground">{row.title}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right">{row.title}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
            <div
              className="absolute inset-y-0 -right-1 w-2 cursor-col-resize z-30 bg-transparent hover:bg-primary/20 transition-colors"
              onPointerDown={handleLabelResizeStart}
              aria-hidden
            />
          </div>

          {/* Timeline Area */}
          <div className="flex-1 relative overflow-hidden">
            {/* Header ticks */}
            <div className="border-b border-border relative" style={{ height: HEADER_HEIGHT }}>
              {tickDayOffsets.map((dayOff, i) => {
                if (dayOff < visibleMinDay || dayOff > visibleMaxDay) return null;
                const x = dayToX(dayOff);
                return (
                  <div
                    key={i}
                    className="absolute top-0 flex flex-col items-start"
                    style={{ left: x }}
                  >
                    <div className="w-px bg-border" style={{ height: HEADER_HEIGHT }} />
                    <span className="text-[10px] text-muted-foreground pl-1 whitespace-nowrap absolute" style={{ top: 4 }}>
                      {formatTick(ticks[i], tickInterval.unit)}
                    </span>
                  </div>
                );
              })}
              {/* Today marker in header */}
              {(() => {
                const today = new Date();
                if (today >= minDate && today <= maxDate) {
                  const todayDay = (today.getTime() - minDate.getTime()) / 86400000;
                  if (todayDay >= visibleMinDay && todayDay <= visibleMaxDay) {
                    return (
                      <div
                        className="absolute top-0 z-10 pointer-events-none"
                        style={{ left: dayToX(todayDay), width: 1, height: HEADER_HEIGHT, backgroundColor: 'hsl(0 72% 51%)' }}
                      />
                    );
                  }
                }
                return null;
              })()}
            </div>

            {/* Today marker line */}
            {(() => {
              const today = new Date();
              if (today >= minDate && today <= maxDate) {
                const todayDay = (today.getTime() - minDate.getTime()) / 86400000;
                if (todayDay >= visibleMinDay && todayDay <= visibleMaxDay) {
                  return (
                    <div
                      className="absolute top-0 bottom-0 z-10 pointer-events-none"
                      style={{ left: dayToX(todayDay), width: 1, backgroundColor: 'hsl(0 72% 51%)' }}
                    />
                  );
                }
              }
              return null;
            })()}

            {/* Rows */}
            {rows.map((row, rowIndex) => {
              const theme = getThemeById(row.theme);
              const rowHeight = row.subRowCount * SUB_ROW_HEIGHT + ROW_PADDING * 2;
              const rowMerged = mergedByRow.get(row.notepadId) ?? [];
              const canvasHeader = canvasHeaderIndices.get(rowIndex);
              return (
                <div key={row.notepadId}>
                  {canvasHeader && (
                    <div className="border-b border-border bg-muted/60" style={{ height: 28 }} />
                  )}
                  <div
                    className="border-b border-border relative"
                    style={{ height: rowHeight, backgroundColor: theme.preview.bg + '18' }}
                  >
                    {/* Vertical grid lines */}
                    {tickDayOffsets.map((dayOff, i) => {
                      if (dayOff < visibleMinDay || dayOff > visibleMaxDay) return null;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 w-px bg-border/30"
                          style={{ left: dayToX(dayOff), height: rowHeight }}
                        />
                      );
                    })}

                    {/* Entries — viewport culled at render time, no HoverCard per item */}
                    {rowMerged.map((group, idx) => {
                      // Viewport cull in day-space
                      const entryMaxDay = group.isPoint ? group.dayStart : group.dayEnd;
                      if (entryMaxDay < visibleMinDay || group.dayStart > visibleMaxDay) return null;

                      const x = dayToX(group.dayStart);
                      if (group.isPoint) {
                        const count = group.entries.length;
                        return (
                          <button
                            key={idx}
                            type="button"
                            className="absolute rounded-full border-2 cursor-pointer hover:scale-[1.3] hover:z-20 transition-transform duration-100 z-10"
                            onClick={(e) => { e.stopPropagation(); setPreviewNotepadId(row.notepadId); }}
                            onMouseEnter={(e) => handleEntryMouseEnter(group.entries, e)}
                            onMouseLeave={handleEntryMouseLeave}
                            style={{
                              left: x - ELEMENT_SIZE / 2,
                              top: group.top + (SUB_ROW_HEIGHT - ELEMENT_SIZE) / 2,
                              width: ELEMENT_SIZE,
                              height: ELEMENT_SIZE,
                              backgroundColor: theme.preview.bg,
                              borderColor: isDarkColor(theme.preview.bg) ? theme.preview.fg + '40' : theme.preview.fg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 8,
                              fontWeight: 700,
                              color: theme.preview.fg,
                              padding: 0,
                            }}
                          >
                            {count > 1 ? count : null}
                          </button>
                        );
                      }
                      const width = Math.max((group.dayEnd - group.dayStart) * effectivePxPerDay, 12);
                      return (
                        <button
                          key={idx}
                          type="button"
                          className="absolute rounded-full border-2 cursor-pointer hover:scale-x-[1.02] hover:scale-y-[1.3] hover:z-20 transition-transform duration-100 z-10"
                          onClick={(e) => { e.stopPropagation(); setPreviewNotepadId(row.notepadId); }}
                          onMouseEnter={(e) => handleEntryMouseEnter(group.entries, e)}
                          onMouseLeave={handleEntryMouseLeave}
                          style={{
                            left: x,
                            top: group.top + (SUB_ROW_HEIGHT - ELEMENT_SIZE) / 2,
                            width: Math.max(width, ELEMENT_SIZE),
                            height: ELEMENT_SIZE,
                            backgroundColor: theme.preview.bg,
                            borderColor: isDarkColor(theme.preview.bg) ? theme.preview.fg + '40' : theme.preview.fg,
                            padding: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-card border border-border rounded-lg shadow-lg p-1 z-30">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={effectivePxPerDay >= MAX_PX_PER_DAY}
          onClick={() => {
            const el = scrollRef.current;
            const viewportW = el ? el.clientWidth - labelWidth : 800;
            const centerDay = viewOrigin + viewportW / 2 / effectivePxPerDay;
            const newPx = Math.min(MAX_PX_PER_DAY, effectivePxPerDay * 1.5);
            const viewportDays = viewportW / newPx;
            const maxOrigin = Math.max(0, dataEndDay - viewportDays * 0.9);
            const newOrigin = Math.max(0, Math.min(maxOrigin, centerDay - viewportW / 2 / newPx));
            setViewOrigin(newOrigin);
            setPxPerDay(newPx);
          }}
        >
          <MagnifyingGlassPlus weight="duotone" className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={effectivePxPerDay <= minPxPerDayRef.current}
          onClick={() => {
            setViewOrigin(0);
            setPxPerDay(minPxPerDayRef.current);
          }}
          title={t('notepad.timeline.fitAll')}
        >
          <ArrowsIn weight="duotone" className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={effectivePxPerDay <= minPxPerDayRef.current}
          onClick={() => {
            const el = scrollRef.current;
            const viewportW = el ? el.clientWidth - labelWidth : 800;
            const centerDay = viewOrigin + viewportW / 2 / effectivePxPerDay;
            const newPx = Math.max(minPxPerDayRef.current, effectivePxPerDay / 1.5);
            const viewportDays = viewportW / newPx;
            const maxOrigin = Math.max(0, dataEndDay - viewportDays * 0.9);
            const newOrigin = Math.max(0, Math.min(maxOrigin, centerDay - viewportW / 2 / newPx));
            setViewOrigin(newOrigin);
            setPxPerDay(newPx);
          }}
        >
          <MagnifyingGlassMinus weight="duotone" className="w-4 h-4" />
        </Button>
      </div>
      </div>

      {/* Single shared hover popup (replaces per-item HoverCards) */}
      {hoveredEntries && (
        <div
          ref={hoverPopupRef}
          className="fixed z-50 w-72 rounded-md border border-border bg-popover shadow-md transition-opacity duration-100"
          style={(() => {
            const flip = hoverPopupH > 0 && hoveredEntries.y - 8 - hoverPopupH < 8;
            return {
              left: Math.min(hoveredEntries.x - 144, window.innerWidth - 300),
              top: flip ? hoveredEntries.y + 18 : Math.max(8, hoveredEntries.y - 8),
              transform: flip ? undefined : 'translateY(-100%)',
            } as React.CSSProperties;
          })()}
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
        >
          <EntriesPreview entries={hoveredEntries.entries} />
        </div>
      )}

      {/* Notebook Preview Overlay */}
      {previewNotepad && (
        <>
          <div
            className="absolute inset-0 z-30"
            onClick={() => {
              if (!previewFocused) setPreviewNotepadId(null);
            }}
          />
          {(() => {
            const theme = getThemeById(previewNotepad.theme);
            return (
              <div
                className="absolute top-4 right-4 bottom-4 w-[360px] z-40 flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden rounded-lg"
                style={{
                  boxShadow: '0 8px 60px -12px rgba(0,0,0,0.12), 0 4px 24px -8px rgba(0,0,0,0.08)',
                  border: `2px solid ${theme.preview.fg}40`,
                }}
              >
                <div className="h-full overflow-auto">
                  <NotepadCard
                    notepad={previewNotepad}
                    isFocused={previewFocused}
                    compact
                    onFocus={() => setPreviewFocused(true)}
                    onBlur={() => setPreviewFocused(false)}
                    isReadOnly={readOnly}
                    onUpdate={readOnly ? undefined : async (updates) => {
                      setLocalEdits(prev => ({
                        ...prev,
                        [previewNotepad.id]: { ...prev[previewNotepad.id], ...updates },
                      }));
                      const { data, error } = await supabase
                        .from('notepads')
                        .update(updates)
                        .eq('id', previewNotepad.id)
                        .select('id')
                        .maybeSingle();
                      return !error && !!data;
                    }}
                    onClose={() => setPreviewNotepadId(null)}
                  />
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

const EntriesPreview = memo(function EntriesPreview({ entries }: { entries: DateEntry[] }) {
  const theme = getThemeById(entries[0].notepadTheme);
  return (
    <div>
      <div className="px-3 py-2 rounded-t-md" style={{ backgroundColor: theme.preview.bg, color: theme.preview.fg }}>
        <p className="text-xs font-semibold">{entries[0].notepadTitle}</p>
      </div>
      <div className="overflow-auto max-h-[calc(100vh-180px)] bg-white dark:bg-white">
        {entries.map((entry, i) => (
          <div key={i}>
            {i > 0 && <div className="border-t border-border mx-3" />}
            <div className="px-3 py-2 text-xs leading-relaxed prose prose-xs prose-muted max-w-none font-inter [&_strong]:bg-yellow-200 [&_strong]:text-foreground [&_strong]:font-bold [&_strong]:px-0.5 [&_strong]:rounded-sm [&_p]:text-muted-foreground [&_p]:text-xs [&_p]:leading-relaxed [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0">
              <Markdown variant="notebook" content={entry.contextSnippet} readOnly />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
