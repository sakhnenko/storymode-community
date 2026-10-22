import { supabase } from '@/integrations/supabase/client';

export type SnapshotEntityType = 'notepad' | 'chapter_draft';

export interface ContentSnapshot {
  id: string;
  entity_type: SnapshotEntityType;
  entity_id: string;
  day: string; // YYYY-MM-DD
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// Throttle per entity: at most one snapshot upsert every 90 seconds.
const lastSavedAt = new Map<string, number>();
const THROTTLE_MS = 90_000;

function key(entityType: SnapshotEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

/**
 * Persists a per-day snapshot of the entity's title/content. Server-side
 * upserts by (entity, day) and prunes anything older than 3 days for that
 * entity, so we always keep the most recent ~3 days of edits.
 */
export async function saveContentSnapshot(
  entityType: SnapshotEntityType,
  entityId: string,
  title: string,
  content: string,
  opts?: { force?: boolean },
): Promise<void> {
  if (!entityId) return;
  // Don't snapshot empty content — that's exactly what we're trying to
  // protect users from accidentally restoring over real text.
  if (!opts?.force && !content?.trim()) return;
  const k = key(entityType, entityId);
  const now = Date.now();
  if (!opts?.force) {
    const prev = lastSavedAt.get(k) ?? 0;
    if (now - prev < THROTTLE_MS) return;
  }
  lastSavedAt.set(k, now);
  try {
    await supabase.rpc('upsert_content_snapshot', {
      _entity_type: entityType,
      _entity_id: entityId,
      _title: title ?? '',
      _content: content ?? '',
    });
  } catch (e) {
    // Snapshots are best-effort. Don't surface errors to the user.
    // eslint-disable-next-line no-console
    console.warn('snapshot save failed', e);
  }
}

export async function fetchContentSnapshots(
  entityType: SnapshotEntityType,
  entityId: string,
): Promise<ContentSnapshot[]> {
  if (!entityId) return [];
  const { data, error } = await supabase
    .from('content_snapshots')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('day', { ascending: false });
  if (error) {
    console.warn('snapshot fetch failed', error);
    return [];
  }
  return (data as ContentSnapshot[]) ?? [];
}