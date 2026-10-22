import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CaretLeft, MagnifyingGlass } from '@/components/ui/icons';
import { getThemeById } from '@/lib/notepad-themes';
import { GLASS_SURFACE_CLASS } from '@/components/ui/glass-surface';
import { useTranslation } from 'react-i18next';

interface Canvas {
  id: string;
  title: string;
  icon: string;
}

interface Notepad {
  id: string;
  title: string;
  theme: string;
  grid_id: string;
  content?: string | null;
}

export interface PickedNotebook {
  notepad_id: string;
  grid_id: string;
  title: string;
  theme: string;
  themeBg: string;
  themeFg: string;
}

interface NotebookPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (notebook: PickedNotebook) => void;
  projectId?: string | null;
}

export function NotebookPicker({ open, onClose, onPick, projectId }: NotebookPickerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [notepads, setNotepads] = useState<Notepad[]>([]);
  const [selectedCanvas, setSelectedCanvas] = useState<Canvas | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [allNotepads, setAllNotepads] = useState<Notepad[]>([]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !user) return;
    setSelectedCanvas(null);
    setNotepads([]);
    setQuery('');
    setLoading(true);
    let q = supabase
      .from('notebook_grids')
      .select('id, title, icon')
      .eq('user_id', user.id);
    if (projectId) q = q.eq('project_id', projectId);
    q.order('position', { ascending: true })
      .then(({ data }) => {
        const grids = (data || []).filter((c: any) => c.title !== '__chapter_notes__');
        setCanvases(grids);
        setLoading(false);
      });
  }, [open, user, projectId]);

  // Load all notepads across visible grids for search
  useEffect(() => {
    if (!open || canvases.length === 0) { setAllNotepads([]); return; }
    const ids = canvases.map((c) => c.id);
    supabase
      .from('notepads')
      .select('id, title, theme, grid_id, content')
      .in('grid_id', ids)
      .then(({ data }) => setAllNotepads((data as any) || []));
  }, [open, canvases]);

  const searchResults = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return [];
    return allNotepads
      .filter((n) => (n.title || '').toLowerCase().includes(s) || (n.content || '').toLowerCase().includes(s))
      .slice(0, 50);
  }, [query, allNotepads]);

  const selectCanvas = (canvas: Canvas) => {
    setSelectedCanvas(canvas);
    setLoading(true);
    supabase
      .from('notepads')
      .select('id, title, theme, grid_id')
      .eq('grid_id', canvas.id)
      .order('col_index')
      .order('row_index')
      .then(({ data }) => {
        setNotepads(data || []);
        setLoading(false);
      });
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      data-toolbar
      className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-64 overflow-hidden flex flex-col ${GLASS_SURFACE_CLASS}`}
      style={{ maxHeight: 'calc(100% - 120px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/40 dark:border-white/10 shrink-0">
        <MagnifyingGlass weight="duotone" className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('common.search') || 'Search'}
          className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          autoFocus
        />
      </div>

      {selectedCanvas && !query && (
        <div className="flex items-center px-3 py-2 border-b border-white/40 dark:border-white/10 shrink-0">
          <button
            onClick={() => setSelectedCanvas(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <CaretLeft weight="bold" className="w-4 h-4" />
            {t('common.back')}
          </button>
        </div>
      )}

      <div className="overflow-y-auto p-1.5">
        {loading && !query && (
          <div className="text-xs text-muted-foreground text-center py-4">{t('common.loading')}</div>
        )}

        {query && searchResults.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">{t('map.noFolios')}</div>
        )}

        {query && searchResults.map((n) => {
          const theme = getThemeById(n.theme);
          const grid = canvases.find((c) => c.id === n.grid_id);
          return (
            <button
              key={n.id}
              onClick={() => {
                onPick({
                  notepad_id: n.id,
                  grid_id: n.grid_id,
                  title: n.title,
                  theme: n.theme,
                  themeBg: theme.preview.bg,
                  themeFg: theme.preview.fg,
                });
              }}
              className="w-full flex flex-col gap-0.5 px-3 py-2 rounded-lg text-sm hover:bg-foreground/10 transition-colors text-left"
            >
              <span className="truncate text-foreground">{n.title || 'Untitled'}</span>
              {grid && (
                <span className="truncate text-[10px] text-muted-foreground">{grid.icon} {grid.title}</span>
              )}
            </button>
          );
        })}

        {!query && !loading && !selectedCanvas &&
          canvases.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCanvas(c)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-foreground/10 transition-colors text-left"
            >
              <span>{c.icon}</span>
              <span className="truncate">{c.title}</span>
            </button>
          ))}

        {!query && !loading && selectedCanvas && notepads.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">{t('map.noFolios')}</div>
        )}

        {!query && !loading &&
          selectedCanvas &&
          notepads.map((n) => {
            const theme = getThemeById(n.theme);
            return (
              <button
                key={n.id}
                onClick={() => {
                  onPick({
                    notepad_id: n.id,
                    grid_id: n.grid_id,
                    title: n.title,
                    theme: n.theme,
                    themeBg: theme.preview.bg,
                    themeFg: theme.preview.fg,
                  });
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-foreground/10 transition-colors text-left"
              >
                <span className="truncate text-foreground">{n.title}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
