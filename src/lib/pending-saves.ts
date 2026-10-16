export type PendingSaveFlush = () => boolean | Promise<boolean>;

export interface PendingSaveSnapshot {
  pendingCount: number;
  hasFailures: boolean;
  flushing: boolean;
}

interface PendingSaveEntry {
  flush: PendingSaveFlush;
  version: number;
}

export interface PendingSaveCoordinator {
  upsert: (key: string, flush: PendingSaveFlush) => void;
  clear: (key: string) => void;
  reportFailure: () => void;
  flushAll: () => Promise<boolean>;
  getSnapshot: () => PendingSaveSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export function createPendingSaveCoordinator(): PendingSaveCoordinator {
  const entries = new Map<string, PendingSaveEntry>();
  const listeners = new Set<() => void>();
  let version = 0;
  let flushPromise: Promise<boolean> | null = null;
  let snapshot: PendingSaveSnapshot = { pendingCount: 0, hasFailures: false, flushing: false };

  const publish = (updates: Partial<PendingSaveSnapshot> = {}) => {
    const next = { ...snapshot, ...updates, pendingCount: entries.size };
    if (
      next.pendingCount === snapshot.pendingCount &&
      next.hasFailures === snapshot.hasFailures &&
      next.flushing === snapshot.flushing
    ) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const coordinator: PendingSaveCoordinator = {
    upsert(key, flush) {
      entries.set(key, { flush, version: ++version });
      publish();
    },

    clear(key) {
      entries.delete(key);
      publish(entries.size === 0 ? { hasFailures: false } : {});
    },

    reportFailure() {
      publish({ hasFailures: true });
    },

    flushAll() {
      if (flushPromise) return flushPromise;
      publish({ flushing: true });

      flushPromise = (async () => {
        let allSucceeded = true;
        const pending = Array.from(entries.entries());

        await Promise.all(pending.map(async ([key, entry]) => {
          let succeeded = false;
          try {
            succeeded = (await entry.flush()) !== false;
          } catch {
            succeeded = false;
          }

          const current = entries.get(key);
          if (succeeded && current?.version === entry.version) {
            entries.delete(key);
          } else if (!succeeded || current) {
            allSucceeded = false;
          }
        }));

        const everythingSaved = allSucceeded && entries.size === 0;
        publish({ hasFailures: !everythingSaved && entries.size > 0 });
        return everythingSaved;
      })().finally(() => {
        flushPromise = null;
        publish({ flushing: false });
      });

      return flushPromise;
    },

    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return coordinator;
}

export const pendingSaves = createPendingSaveCoordinator();

export const pendingSaveKey = (kind: 'notepad' | 'chapter', id: string) => `${kind}:${id}`;
