import { useState, useEffect, useCallback } from 'react';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface NotebookGrid {
  id: string;
  user_id: string;
  project_id?: string;
  title: string;
  icon: string;
  col_sizes: string[];
  row_sizes: string[];
  position: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export function useNotebookGrids(projectId?: string, options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const enabled = options?.enabled ?? true;
  const [grids, setGrids] = useState<NotebookGrid[]>([]);
  const [loading, setLoading] = useState(true);

  const withTimeout = async <T,>(thenable: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });

    try {
      return await Promise.race([Promise.resolve(thenable as any) as Promise<T>, timeoutPromise]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const fetchGrids = useCallback(async () => {
    if (!enabled) {
      setGrids([]);
      setLoading(false);
      return;
    }

    if (!user && !projectId) {
      setGrids([]);
      setLoading(false);
      return;
    }

    try {
      // Build grids query - for public projects, fetch by project_id without user filter
      let ownedQuery: any = supabase
        .from('notebook_grids')
        .select('*');
      if (user) ownedQuery = ownedQuery.eq('user_id', user.id);
      if (projectId) ownedQuery = ownedQuery.eq('project_id', projectId);
      ownedQuery = ownedQuery
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      const { data: ownedGrids, error: ownedError } = await withTimeout<{ data: any; error: any }>(
        ownedQuery,
        8000,
        'Loading folios'
      ) as unknown as { data: any[]; error: any };

      if (ownedError) throw ownedError;

      // Strip system-only folios (e.g. the per-chapter notes bucket) before
      // anything downstream sees them.
      const visibleOwned = (ownedGrids || []).filter((g: any) => g.title !== '__chapter_notes__');

      if (projectId) {
        // Project-scoped: only owned/visible grids, no shared grids
        setGrids(visibleOwned.map((g: any) => ({ ...g, is_shared: false, has_shares: false })));
      } else {
        // Global scope: only owned grids; sharing/collaboration is disabled.
        setGrids(visibleOwned.map((g: any) => ({ ...g, is_shared: false, has_shares: false })));
      }
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorLoadingFolios'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast, projectId, enabled]);

  useEffect(() => {
    if (enabled) setLoading(true);
    fetchGrids();
  }, [fetchGrids]);

  const createGrid = async (title: string = i18n.t('notepad.grid.defaultFolioTitle')): Promise<NotebookGrid | null> => {
    if (!user) return null;

    try {
      const isFirstFolio = grids.length === 0;

      // Create the folio
      const { data: grid, error: gridError } = await supabase
        .from('notebook_grids')
        .insert({
          user_id: user.id,
          title,
          ...(projectId ? { project_id: projectId } : {}),
        } as any)
        .select()
        .single();

      if (gridError) throw gridError;

      // The first folio introduces the canvas with guided examples. Later folios
      // start with two nearly blank notebooks solely to establish two columns.
      const initialNotepads = isFirstFolio
        ? [
            {
              col: 0,
              row: 0,
              title: i18n.t('notepad.grid.initialNotebook.lightTitle'),
              content: i18n.t('notepad.grid.initialNotebook.lightContent'),
              theme: 'cream',
              height: 400,
            },
            {
              col: 1,
              row: 0,
              title: i18n.t('notepad.grid.initialNotebook.darkTitle'),
              content: i18n.t('notepad.grid.initialNotebook.darkContent'),
              theme: 'midnight',
              height: 400,
            },
          ]
        : [
            {
              col: 0,
              row: 0,
              title: i18n.t('notepad.default.untitled'),
              content: '',
              theme: 'clean-white',
              height: 400,
            },
            {
              col: 1,
              row: 0,
              title: i18n.t('notepad.default.untitled'),
              content: '',
              theme: 'clean-white',
              height: 400,
            },
          ];

      const { error: notepadsError } = await supabase
        .from('notepads')
        .insert(
          initialNotepads.map((n) => ({
            user_id: user.id,
            grid_id: grid.id,
            title: n.title,
            content: n.content,
            theme: n.theme,
            font: 'inter',
            col_index: n.col,
            row_index: n.row,
            height: n.height || 200,
          }))
        );


      if (notepadsError) throw notepadsError;

      setGrids((prev) => [grid, ...prev]);
      return grid;
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorCreatingFolio'),
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateGrid = async (id: string, updates: Partial<Pick<NotebookGrid, 'title' | 'position'>>) => {
    return updateGridInner(id, updates);
  };

  // Create a folio pre-filled with a set of example notebooks (onboarding).
  const createGridWithNotes = async (
    title: string,
    notes: { title: string; content: string }[],
    icon?: string,
  ): Promise<NotebookGrid | null> => {
    if (!user) return null;

    try {
      const { data: grid, error: gridError } = await supabase
        .from('notebook_grids')
        .insert({
          user_id: user.id,
          title,
          ...(icon ? { icon } : {}),
          ...(projectId ? { project_id: projectId } : {}),
        } as any)
        .select()
        .single();

      if (gridError) throw gridError;

      if (notes.length > 0) {
        const { error: notepadsError } = await supabase.from('notepads').insert(
          notes.map((n, i) => ({
            user_id: user.id,
            grid_id: grid.id,
            title: n.title,
            content: n.content,
            theme: i % 2 === 0 ? 'cream' : 'clean-white',
            font: 'inter',
            col_index: i % 3,
            row_index: Math.floor(i / 3),
            height: 260,
          })),
        );
        if (notepadsError) throw notepadsError;
      }

      setGrids((prev) => [...prev, grid]);
      return grid;
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorCreatingFolio'),
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateGridInner = async (id: string, updates: Partial<Pick<NotebookGrid, 'title' | 'position'>>) => {
    try {
      const { error } = await supabase
        .from('notebook_grids')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      setGrids((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...updates } : g))
      );
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorUpdatingFolio'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const reorderGrids = async (reorderedGrids: NotebookGrid[]) => {
    setGrids(reorderedGrids);

    try {
      const updates = reorderedGrids.map((grid, index) =>
        supabase
          .from('notebook_grids')
          .update({ position: index })
          .eq('id', grid.id)
      );

      await Promise.all(updates);
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorReorderingFolios'),
        description: error.message,
        variant: 'destructive',
      });
      fetchGrids();
    }
  };

  const deleteGrid = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notebook_grids')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setGrids((prev) => prev.filter((g) => g.id !== id));
      return true;
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorDeletingFolio'),
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    grids,
    loading,
    createGrid,
    createGridWithNotes,
    updateGrid,
    deleteGrid,
    reorderGrids,
    refetch: fetchGrids,
  };
}
