import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { NotepadGrid } from '@/components/notepad/NotepadGrid';
import { TimelineView } from '@/components/notepad/TimelineView';
import { SpinnerGap } from '@/components/ui/icons';
import { supabase } from '@/integrations/supabase/client';
import { NotebookGrid } from '@/hooks/useNotebookGrids';
import { useTranslation } from 'react-i18next';
import { TimelineOnboarding, useTimelineOnboarding } from '@/components/onboarding/TimelineOnboarding';
import { pickRandomBackground } from '@/lib/backgrounds';

export type ViewMode = 'notebook' | 'timeline';

const GridView = () => {
  const { gridId } = useParams<{ gridId: string }>();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [grid, setGrid] = useState<NotebookGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [addColumnFn, setAddColumnFn] = useState<(() => void) | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('notebook');
  const [background] = useState(() => pickRandomBackground());
  const [timelineEmpty, setTimelineEmpty] = useState(false);

  // Check if current user is the owner of the grid
  const isOwner = !!(user && grid && user.id === grid.user_id);
  const isReadOnly = !user || !isOwner;
  const timelineOnboarding = useTimelineOnboarding(
    grid?.project_id || gridId,
    !!grid && !isReadOnly && viewMode === 'timeline' && timelineEmpty,
  );

  const handleAddColumnRef = useCallback((fn: () => void) => {
    setAddColumnFn(() => fn);
  }, []);

  useEffect(() => {
    const fetchGrid = async () => {
      if (!gridId) return;
      if (authLoading) return;

      try {
        const { data, error } = await supabase
          .from('notebook_grids')
          .select('*')
          .eq('id', gridId)
          .maybeSingle();

        if (error) throw error;
        
        if (!data) {
          if (!user) {
            navigate('/');
          } else {
            setNotFound(true);
          }
        } else {
          setGrid(data as NotebookGrid);
        }
      } catch (error) {
        console.error('Error fetching grid:', error);
        if (!user) {
          navigate('/');
        } else {
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchGrid();
  }, [gridId, user, authLoading, navigate]);

  const handleGridUpdate = async (updates: Partial<NotebookGrid>) => {
    if (grid) {
      setGrid({ ...grid, ...updates });
      if (updates.col_sizes) {
        await supabase
          .from('notebook_grids')
          .update({ col_sizes: updates.col_sizes })
          .eq('id', grid.id);
      }
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SpinnerGap weight="duotone" className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!grid && !notFound) {
    return null;
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header backUrl="/dashboard" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">{t('gridView.folioNotFound')}</h1>
            <p className="text-muted-foreground">
              {t('gridView.folioNotFoundDesc')}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header 
        backUrl={grid?.project_id ? `/project/${grid.project_id}` : (user ? '/dashboard' : '/')}
        grid={grid}
        onGridUpdate={isOwner ? handleGridUpdate : undefined} 
        onAddColumn={viewMode === 'notebook' && !isReadOnly ? (addColumnFn || undefined) : undefined}
        isReadOnly={isReadOnly}
        isOwner={isOwner}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {viewMode === 'notebook' ? (
          <NotepadGrid 
            gridId={gridId!} 
            colSizes={grid?.col_sizes} 
            onColSizesChange={!isReadOnly ? (sizes) => handleGridUpdate({ col_sizes: sizes }) : undefined}
            onAddColumnRef={!isReadOnly ? handleAddColumnRef : undefined}
            isReadOnly={isReadOnly}
          />
        ) : (
          <TimelineView gridId={gridId!} onEmptyChange={setTimelineEmpty} />
        )}
      </main>
      {timelineOnboarding.open && viewMode === 'timeline' && (
        <TimelineOnboarding art={background} onClose={timelineOnboarding.close} />
      )}
    </div>
  );
};

export default GridView;
