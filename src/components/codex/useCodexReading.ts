import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoryStreamEvent } from '@/hooks/useProjectMemory';
import type { ProjectMemoryController } from '@/components/story/ProjectMemoryPanel';

export interface ReadingStatus {
  state: 'waiting' | 'reading' | 'done' | 'cached' | 'failed';
  /** Items shown so far while reading. */
  found: number;
  facts: number;
  /** Facts saved, once done. */
  count?: number;
  error?: string;
  /** Progress through the chapter: its passages, the one being read, and when it began. */
  passages?: number;
  passage?: number;
  passageAt?: number;
  /** The model has started writing what it found in this passage. */
  writing?: boolean;
  passageFacts?: number;
}
type FoundEvent = Extract<MemoryStreamEvent, { type: 'entity' | 'fact' }>;

/** Errors that would fail every remaining chapter the same way, so reading stops. */
const HALTING = new Set(['credits', 'billing', 'forbidden', 'unavailable', 'provider']);

/**
 * Reads chapters one after another (the server takes one at a time), passing
 * on what each finds while it is read. Stopping lets the current chapter
 * finish; the server saves it either way.
 */
export function useCodexReading(watch: ProjectMemoryController['watchAnalysis'], handlers: {
  onFound: (event: FoundEvent, chapterId: string) => void;
  onChapterDone: (chapterId: string) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, ReadingStatus>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [halted, setHalted] = useState('');
  const stopRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const patch = useCallback((id: string, change: (s: ReadingStatus) => Partial<ReadingStatus>) => {
    setStatuses(previous => {
      const base = previous[id] || { state: 'waiting', found: 0, facts: 0 };
      return { ...previous, [id]: { ...base, ...change(base) } };
    });
  }, []);

  const start = useCallback(async (ids: string[]) => {
    if (running || !ids.length) return;
    stopRef.current = false;
    setStopping(false);
    setHalted('');
    setRunning(true);
    setStatuses(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [id, { state: 'waiting', found: 0, facts: 0 }])) }));
    for (const id of ids) {
      if (stopRef.current) break;
      setCurrent(id);
      patch(id, () => ({ state: 'reading' }));
      let halt = '';
      try {
        const result = await watch(id, event => {
          if (event.type === 'start') { patch(id, () => ({ passages: event.passages })); return; }
          if (event.type === 'passage') {
            patch(id, () => ({ passage: event.index, passageAt: Date.now(), writing: false, passageFacts: 0 }));
            return;
          }
          if (event.type === 'entity') patch(id, s => ({ found: s.found + 1, writing: true }));
          else if (event.type === 'fact') patch(id, s => ({ facts: s.facts + 1, passageFacts: (s.passageFacts || 0) + 1, writing: true }));
          else return;
          handlersRef.current.onFound(event, id);
        });
        patch(id, () => (result.cached ? { state: 'cached' } : { state: 'done', count: result.count }));
      } catch (error) {
        const code = error instanceof Error ? error.message : 'failed';
        patch(id, () => ({ state: 'failed', error: code }));
        if (HALTING.has(code)) halt = code;
      }
      handlersRef.current.onChapterDone(id);
      if (halt) { setHalted(halt); break; }
    }
    // Chapters never reached go back to plain "to catch up".
    setStatuses(previous => Object.fromEntries(Object.entries(previous).filter(([, s]) => s.state !== 'waiting')));
    setCurrent(null);
    setRunning(false);
    setStopping(false);
  }, [running, watch, patch]);

  const stop = useCallback(() => { stopRef.current = true; setStopping(true); }, []);
  // Leaving the Codex stops the queue; the chapter being read still finishes on the server.
  useEffect(() => () => { stopRef.current = true; }, []);

  return { statuses, current, running, stopping, halted, start, stop };
}

/**
 * A rough share of a chapter read, for the progress bar: reading a passage
 * takes about 25 seconds before the model writes anything, then its facts
 * (about a dozen) arrive one by one. Never shows complete until it is.
 */
export function readingProgress(status: ReadingStatus, now: number) {
  const passages = status.passages || 1;
  const elapsed = status.passageAt ? now - status.passageAt : 0;
  const within = status.writing
    ? 0.6 + 0.4 * Math.min(1, (status.passageFacts || 0) / 12)
    : 0.6 * Math.min(1, elapsed / 25_000);
  return Math.min(0.97, ((status.passage ?? 0) + within) / passages);
}
