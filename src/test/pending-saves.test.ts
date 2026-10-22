import { describe, expect, it, vi } from 'vitest';
import { createPendingSaveCoordinator } from '@/lib/pending-saves';

describe('pending save coordinator', () => {
  it('keeps a failed save queued and removes it only after a confirmed retry', async () => {
    const coordinator = createPendingSaveCoordinator();
    const flush = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    coordinator.upsert('notepad:1', flush);
    expect(await coordinator.flushAll()).toBe(false);
    expect(coordinator.getSnapshot()).toMatchObject({ pendingCount: 1, hasFailures: true });

    expect(await coordinator.flushAll()).toBe(true);
    expect(coordinator.getSnapshot()).toMatchObject({ pendingCount: 0, hasFailures: false });
  });

  it('does not clear newer writing registered while an older save is in flight', async () => {
    const coordinator = createPendingSaveCoordinator();
    let resolveFirst!: (value: boolean) => void;
    const first = new Promise<boolean>((resolve) => { resolveFirst = resolve; });
    const newerFlush = vi.fn().mockResolvedValue(true);

    coordinator.upsert('chapter:1', () => first);
    const flushing = coordinator.flushAll();
    coordinator.upsert('chapter:1', newerFlush);
    resolveFirst(true);

    expect(await flushing).toBe(false);
    expect(coordinator.getSnapshot().pendingCount).toBe(1);
    expect(await coordinator.flushAll()).toBe(true);
    expect(newerFlush).toHaveBeenCalledOnce();
  });

  it('treats thrown retry callbacks as unsaved', async () => {
    const coordinator = createPendingSaveCoordinator();
    coordinator.upsert('notepad:1', async () => { throw new Error('offline'); });

    expect(await coordinator.flushAll()).toBe(false);
    expect(coordinator.getSnapshot()).toMatchObject({ pendingCount: 1, hasFailures: true });
  });
});
