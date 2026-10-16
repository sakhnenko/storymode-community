import { useEffect, useState } from 'react';
import { useNotebookGrids } from '@/hooks/useNotebookGrids';
import { supabase } from '@/integrations/supabase/client';
import { Notepad } from '@/hooks/useNotepads';
import { TimelineView } from '@/components/notepad/TimelineView';
import { ViewLoadingOverlay } from '@/components/ui/ViewLoadingOverlay';

export function GlobalTimelineView({
  projectId,
  readOnly,
  onEmptyChange,
}: {
  projectId?: string;
  readOnly?: boolean;
  onEmptyChange?: (empty: boolean) => void;
}) {
  const { grids, loading: gridsLoading } = useNotebookGrids(projectId);
  const [allNotepads, setAllNotepads] = useState<Notepad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (gridsLoading) return;
    if (grids.length === 0) {
      setAllNotepads([]);
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      const gridIds = grids.map(g => g.id);
      const { data, error } = await supabase
        .from('notepads')
        .select('*')
        .in('grid_id', gridIds);

      if (error) {
        console.error('Error fetching all notepads:', error);
      } else {
        setAllNotepads((data as Notepad[]) || []);
      }
      setLoading(false);
    };

    fetchAll();
  }, [grids, gridsLoading]);

  if (gridsLoading || loading) {
    return <ViewLoadingOverlay view="timeline" />;
  }

  const canvasGroups = grids.map(g => ({ id: g.id, title: g.title, icon: g.icon || '📓' }));

  return (
    <TimelineView
      gridId="global"
      externalNotepads={allNotepads}
      canvasGroups={canvasGroups}
      readOnly={readOnly}
      onEmptyChange={onEmptyChange}
    />
  );
}
