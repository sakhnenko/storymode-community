import { useState, useEffect, useCallback } from 'react';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface Notepad {
  id: string;
  user_id: string;
  grid_id: string;
  title: string;
  content: string;
  theme: string;
  font: string;
  font_size: string;
  row_index: number;
  col_index: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export function useNotepads(gridId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notepads, setNotepads] = useState<Notepad[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotepads = useCallback(async () => {
    // Allow anonymous users to load notepads for public grids.
    // RLS policies will decide whether the rows are actually visible.
    if (!gridId) {
      setNotepads([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notepads')
        .select('*')
        .eq('grid_id', gridId)
        .order('col_index')
        .order('row_index');

      if (error) throw error;
      setNotepads(data || []);
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorLoading'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [gridId, toast]);

  useEffect(() => {
    fetchNotepads();
  }, [fetchNotepads]);

  const createNotepad = async (colIndex: number, rowIndex: number, content?: string, title?: string) => {
    if (!user || !gridId) return null;

    try {
      const { data, error } = await supabase
        .from('notepads')
        .insert({
          user_id: user.id,
          grid_id: gridId,
          title: title ?? (content ? i18n.t('notepad.default.scannedDocument') : i18n.t('notepad.default.untitled')),
          content: content || '',
          theme: 'clean-white',
          font: 'inter',
          col_index: colIndex,
          row_index: rowIndex,
        })
        .select()
        .single();

      if (error) throw error;
      setNotepads((prev) => [...prev, data]);
      return data;
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorCreating'),
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateNotepad = async (id: string, updates: Partial<Notepad>) => {
    // Keep the latest editor value in React state while the network request is
    // in flight. This prevents a remount (for example during drag/reorder) from
    // recreating the notebook with stale database-backed props.
    setNotepads((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );

    try {
      const { data, error } = await supabase
        .from('notepads')
        .update(updates)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('The notebook update was not accepted.');
      // Best-effort daily snapshot when content (or title) changes.
      if (typeof updates.content === 'string' || typeof updates.title === 'string') {
        const current = notepads.find((n) => n.id === id);
        const nextTitle = typeof updates.title === 'string' ? updates.title : current?.title ?? '';
        const nextContent = typeof updates.content === 'string' ? updates.content : current?.content ?? '';
        void import('@/lib/content-snapshots').then(({ saveContentSnapshot }) =>
          saveContentSnapshot('notepad', id, nextTitle, nextContent),
        );
      }
      return true;
    } catch {
      // Keep the optimistic editor value in memory. NotepadCard retains the
      // same value in its durable local draft and exposes a retry action. The
      // global connectivity banner owns save-failure feedback, so do not add
      // a second destructive toast underneath it.
      return false;
    }
  };

  const deleteNotepad = async (id: string) => {
    // Gone at once; it comes back only if the delete fails. Waiting for the database left it
    // on screen for a second after its fade-out.
    const removed = notepads.find((n) => n.id === id);
    setNotepads((prev) => prev.filter((n) => n.id !== id));
    try {
      const { error } = await supabase.from('notepads').delete().eq('id', id);
      if (error) throw error;
    } catch (error: any) {
      if (removed) setNotepads((prev) => (prev.some((n) => n.id === id) ? prev : [...prev, removed]));
      toast({
        title: i18n.t('notepad.toast.errorDeleting'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deleteColumn = async (colIndex: number) => {
    if (!user || !gridId) return;

    try {
      const { error } = await supabase
        .from('notepads')
        .delete()
        .eq('grid_id', gridId)
        .eq('col_index', colIndex);

      if (error) throw error;
      setNotepads((prev) => prev.filter((n) => n.col_index !== colIndex));
    } catch (error: any) {
      toast({
        title: i18n.t('notepad.toast.errorDeletingColumn'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const moveNotepad = async (
    notepadId: string,
    newColIndex: number,
    newRowIndex: number
  ) => {
    // Optimistic update
    setNotepads((prev) =>
      prev.map((n) =>
        n.id === notepadId
          ? { ...n, col_index: newColIndex, row_index: newRowIndex }
          : n
      )
    );

    try {
      const { error } = await supabase
        .from('notepads')
        .update({ col_index: newColIndex, row_index: newRowIndex })
        .eq('id', notepadId);

      if (error) throw error;
    } catch (error: any) {
      // Revert on error
      fetchNotepads();
      toast({
        title: i18n.t('notepad.toast.errorMoving'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const reorderNotepads = async (updates: { id: string; col_index: number; row_index: number }[]) => {
    let usedCompatibilityFallback = false;
    const previousPositions = new Map(
      notepads.map((notepad) => [notepad.id, { col_index: notepad.col_index, row_index: notepad.row_index }]),
    );
    // Optimistic update
    setNotepads((prev) =>
      prev.map((n) => {
        const update = updates.find((u) => u.id === n.id);
        return update ? { ...n, col_index: update.col_index, row_index: update.row_index } : n;
      })
    );

    try {
      const { error: rpcError } = await supabase.rpc('reorder_notepads', {
        _grid_id: gridId,
        _updates: updates,
      });

      // Older environments may not have the atomic reorder migration yet.
      // Preserve drag/drop there by falling back to checked position-only
      // updates; once the migration is deployed the RPC remains the default.
      const isMissingRpc = rpcError?.code === 'PGRST202'
        || rpcError?.message?.includes('reorder_notepads') && rpcError.message.includes('schema cache');
      if (isMissingRpc) {
        usedCompatibilityFallback = true;
        const results = await Promise.all(
          updates.map(({ id, col_index, row_index }) =>
            supabase
              .from('notepads')
              .update({ col_index, row_index })
              .eq('id', id)
              .select('id')
              .maybeSingle()
          ),
        );
        const failed = results.find((result) => result.error || !result.data);
        if (failed) throw failed.error ?? new Error('The notebook reorder was not accepted.');
      } else if (rpcError) {
        throw rpcError;
      }
      return true;
    } catch (error: any) {
      if (usedCompatibilityFallback) {
        // The compatibility path is not transactional. Reload the authoritative
        // positions if any row failed so the UI cannot conceal a partial save.
        await fetchNotepads();
      } else {
        // The RPC is transactional, so restore only the optimistic positions;
        // preserve any title/content edits made while the request was pending.
        setNotepads((current) => current.map((notepad) => {
          const previous = previousPositions.get(notepad.id);
          return previous ? { ...notepad, ...previous } : notepad;
        }));
      }
      toast({
        title: i18n.t('notepad.toast.errorReordering'),
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    notepads,
    loading,
    createNotepad,
    updateNotepad,
    deleteNotepad,
    deleteColumn,
    moveNotepad,
    reorderNotepads,
    refetch: fetchNotepads,
  };
}
