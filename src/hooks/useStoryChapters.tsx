import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import i18n from '@/i18n';

export interface StoryChapter {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  content: string;
  position: number;
  theme: string | null;
  created_at: string;
  updated_at: string;
  active_draft_id?: string | null;
}

export function useStoryChapters(projectId: string | undefined) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from('story_chapters' as any)
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });
    if (!error && data) setChapters(data as unknown as StoryChapter[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refetch(); }, [refetch]);

  const createChapter = useCallback(async (title = i18n.t('story.untitledChapter')) => {
    if (!projectId || !user) return null;
    const maxPos = chapters.reduce((m, c) => Math.max(m, c.position), -1);
    const { data, error } = await supabase
      .from('story_chapters' as any)
      .insert({ project_id: projectId, user_id: user.id, title, position: maxPos + 1 } as any)
      .select('*')
      .single();
    if (!error && data) {
      const ch = data as unknown as StoryChapter;
      setChapters(prev => [...prev, ch]);
      return ch;
    }
    return null;
  }, [projectId, user, chapters]);

  const updateChapter = useCallback(async (id: string, updates: Partial<StoryChapter>) => {
    const { data, error } = await supabase
      .from('story_chapters' as any)
      .update(updates as any)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      console.error('updateChapter', error);
      return false;
    }

    setChapters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    return true;
  }, []);

  const deleteChapter = useCallback(async (id: string) => {
    setChapters(prev => prev.filter(c => c.id !== id));
    await supabase.from('story_chapters' as any).delete().eq('id', id);
  }, []);

  const reorderChapters = useCallback(async (next: StoryChapter[]) => {
    setChapters(next.map((c, i) => ({ ...c, position: i })));
    await Promise.all(
      next.map((c, i) =>
        supabase.from('story_chapters' as any).update({ position: i } as any).eq('id', c.id)
      )
    );
  }, []);

  return { chapters, loading, createChapter, updateChapter, deleteChapter, reorderChapters, refetch };
}
