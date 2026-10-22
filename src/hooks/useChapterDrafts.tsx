import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ChapterDraft {
  id: string;
  chapter_id: string;
  user_id: string;
  draft_number: number;
  title: string;
  content: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Drafts model:
 * - Each chapter has 0+ drafts. The chapter row always mirrors the *active* draft.
 * - On first load we lazily ensure there is at least one draft (Draft 1) reflecting current content.
 * - "New draft" snapshots current chapter content into a NEW row, sets it as active, and the user
 *   keeps editing the chapter normally (those edits flow into the new active draft via mirrorActive).
 * - Switching to an older draft is read-only; the live chapter is unchanged until the user comes back.
 */
export function useChapterDrafts(chapterId: string | null | undefined, chapterContent: string, chapterTitle: string, activeDraftId: string | null | undefined) {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<ChapterDraft[]>([]);
  const [loading, setLoading] = useState(true);
  // Drafts this hook activated itself (lazy Draft 1 / new draft). The parent
  // chapter row in memory can lag behind that write, and without this fallback
  // autosave would mirror into nothing and leave the active draft empty.
  const [selfActiveDraftId, setSelfActiveDraftId] = useState<string | null>(null);
  useEffect(() => { setSelfActiveDraftId(null); }, [chapterId]);
  const effectiveActiveDraftId = activeDraftId ?? selfActiveDraftId;

  const refetch = useCallback(async () => {
    if (!chapterId) { setDrafts([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('story_chapter_drafts' as any)
      .select('*')
      .eq('chapter_id', chapterId)
      .order('draft_number', { ascending: true });
    setDrafts((data as unknown as ChapterDraft[]) || []);
    setLoading(false);
  }, [chapterId]);

  useEffect(() => { void refetch(); }, [refetch]);

  // Lazy-initialize Draft 1 if none exist.
  useEffect(() => {
    if (!chapterId || !user || loading) return;
    if (drafts.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('story_chapter_drafts' as any)
        .insert({
          chapter_id: chapterId,
          user_id: user.id,
          draft_number: 1,
          title: chapterTitle || '',
          content: chapterContent || '',
        } as any)
        .select('*')
        .single();
      if (cancelled || error || !data) return;
      const row = data as unknown as ChapterDraft;
      setDrafts([row]);
      setSelfActiveDraftId(row.id);
      await supabase.from('story_chapters' as any).update({ active_draft_id: row.id } as any).eq('id', chapterId);
    })();
    return () => { cancelled = true; };
  }, [chapterId, user, loading, drafts.length, chapterTitle, chapterContent]);

  const createNewDraft = useCallback(async (): Promise<ChapterDraft | null> => {
    if (!chapterId || !user) return null;
    const next = (drafts.reduce((m, d) => Math.max(m, d.draft_number), 0) || 0) + 1;
    const { data, error } = await supabase
      .from('story_chapter_drafts' as any)
      .insert({
        chapter_id: chapterId,
        user_id: user.id,
        draft_number: next,
        title: chapterTitle || '',
        content: chapterContent || '',
      } as any)
      .select('*')
      .single();
    if (error || !data) return null;
    const row = data as unknown as ChapterDraft;
    setDrafts(prev => [...prev, row]);
    setSelfActiveDraftId(row.id);
    await supabase.from('story_chapters' as any).update({ active_draft_id: row.id } as any).eq('id', chapterId);
    return row;
  }, [chapterId, user, drafts, chapterTitle, chapterContent]);

  const setActive = useCallback(async (draftId: string) => {
    if (!chapterId) return;
    await supabase.from('story_chapters' as any).update({ active_draft_id: draftId } as any).eq('id', chapterId);
  }, [chapterId]);

  const deleteDraft = useCallback(async (draftId: string): Promise<string | null> => {
    if (!chapterId) return null;
    if (drafts.length <= 1) return null;
    const sorted = [...drafts].sort((a, b) => a.draft_number - b.draft_number);
    const idx = sorted.findIndex(d => d.id === draftId);
    // Prefer the draft immediately above (higher draft_number); otherwise the one below.
    const promoted = idx === -1
      ? sorted[sorted.length - 1]
      : (sorted[idx + 1] ?? sorted[idx - 1] ?? null);
    const remaining = drafts.filter(d => d.id !== draftId);
    setDrafts(remaining);
    await supabase.from('story_chapter_drafts' as any).delete().eq('id', draftId);
    const fallback = promoted?.id ?? null;
    if (fallback) {
      await supabase.from('story_chapters' as any).update({ active_draft_id: fallback } as any).eq('id', chapterId);
    } else {
      await supabase.from('story_chapters' as any).update({ active_draft_id: null } as any).eq('id', chapterId);
    }
    return fallback;
  }, [chapterId, drafts]);

  const renameDraft = useCallback(async (draftId: string, name: string | null) => {
    const trimmed = name && name.trim().length > 0 ? name.trim() : null;
    setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, name: trimmed } : d));
    await supabase.from('story_chapter_drafts' as any).update({ name: trimmed } as any).eq('id', draftId);
  }, []);

  // Keep the active draft row's content in sync with chapter.content/title.
  // Called periodically by the chapter editor's autosave.
  const mirrorActive = useCallback(async (updates: { title?: string; content?: string }) => {
    if (!effectiveActiveDraftId) return true;
    if (!('title' in updates) && !('content' in updates)) return true;
    const { data, error } = await supabase
      .from('story_chapter_drafts' as any)
      .update(updates as any)
      .eq('id', effectiveActiveDraftId)
      .select('id')
      .maybeSingle();
    if (error || !data) return false;
    setDrafts(prev => prev.map(d => d.id === effectiveActiveDraftId ? { ...d, ...updates, updated_at: new Date().toISOString() } : d));
    const current = drafts.find(d => d.id === effectiveActiveDraftId);
    const nextTitle = typeof updates.title === 'string' ? updates.title : current?.title ?? '';
    const nextContent = typeof updates.content === 'string' ? updates.content : current?.content ?? '';
    void import('@/lib/content-snapshots').then(({ saveContentSnapshot }) =>
      saveContentSnapshot('chapter_draft', effectiveActiveDraftId, nextTitle, nextContent),
    );
    return true;
  }, [effectiveActiveDraftId, drafts]);

  return { drafts, loading, createNewDraft, setActive, deleteDraft, renameDraft, mirrorActive, refetch };
}
