import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CaretRight, CaretDown, Notebook, MagnifyingGlass, Plus, X, BookOpen, ArrowLeft, FolderSimple, Folders, Copy, Check, ChatCircleDots, SpinnerGap } from '@/components/ui/icons';
import { Markdown } from '@/components/Markdown';
import { paragraphize } from '@/lib/paragraphize';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { WysiwygEditor, type WysiwygEditorHandle } from '@/components/notepad/WysiwygEditor';
import { EmojiPicker } from '@/components/EmojiPicker';
import { getFontById } from '@/lib/notepad-themes';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { ActionTooltip } from '@/components/ui/action-tooltip';

interface Folio { id: string; title: string; icon: string | null; }
interface Notepad { id: string; grid_id: string; title: string; content: string; icon?: string | null; }
interface ChapterNotebook { id: string; title: string; content: string; chapter_id: string; grid_id: string; updated_at: string; icon?: string | null; }
interface ChapterHit { id: string; title: string; content: string; }

type OpenNotebookDetail = {
  id: string;
  gridId: string;
  title?: string;
  section?: 'chapter' | 'project';
};

// The Folios tab is unmounted while the user is in another tab, so the
// 'storymode:open-chapter-notebook' event fires before the component listener
// exists. Capture it at module scope and replay it when the browser mounts.
let pendingOpenNotebook: OpenNotebookDetail | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('storymode:open-chapter-notebook', (e: Event) => {
    const detail = (e as CustomEvent<OpenNotebookDetail>).detail;
    if (detail?.id) pendingOpenNotebook = detail;
  });
}

const foliosCache = new Map<string, Folio[]>();
const notepadsCache = new Map<string, Notepad[]>();
const openGridsCache = new Map<string, Record<string, boolean>>();
const openNotesCache = new Map<string, Record<string, boolean>>();

const NOTEBOOK_PREVIEW_CLASS = cn(
  'notepad-content prose prose-sm prose-neutral max-w-none text-sm text-muted-foreground',
  '[overflow-wrap:anywhere] [word-break:break-word]',
);

// Strip markdown scaffolding from saved notebook titles (older notebooks were
// saved before titles were cleaned at insert time).
const cleanNotebookTitle = (title: string) =>
  title
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^[*_~\s]+|[*_~\s]+$/g, '')
    .trim();

/* ---------- Action row for expanded notebook sections ---------- */

function NotebookActions({ title, content, projectId, userId }: { title: string; content: string; projectId: string; userId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folios, setFolios] = useState<{ id: string; title: string; icon: string }[]>([]);
  const [loadingFolios, setLoadingFolios] = useState(false);
  const [savingFolioId, setSavingFolioId] = useState<string | null>(null);

  const plain = content.replace(/^\s*>\s?/gm, '').trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t('story.answerCopyFailed'), variant: 'destructive' });
    }
  };

  const chatAbout = () => {
    window.dispatchEvent(new CustomEvent('storymode:chat-about-text', { detail: { text: plain } }));
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setLoadingFolios(true);
    try {
      const { data } = await supabase
        .from('notebook_grids' as any)
        .select('id, title, icon')
        .eq('project_id', projectId)
        .order('position', { ascending: true });
      setFolios(
        ((data as any[]) || [])
          .filter((g) => g.title !== '__chapter_notes__')
          .map((g) => ({ id: g.id, title: g.title, icon: g.icon || '📁' })),
      );
    } finally {
      setLoadingFolios(false);
    }
  };

  const saveToFolio = async (gridId: string) => {
    if (savingFolioId || !userId) return;
    setSavingFolioId(gridId);
    try {
      const { data: existing } = await supabase
        .from('notepads' as any)
        .select('row_index')
        .eq('grid_id', gridId)
        .order('row_index', { ascending: false })
        .limit(1);
      const nextRow = ((existing?.[0] as any)?.row_index ?? -1) + 1;
      const body = paragraphize(plain);
      const height = Math.min(1400, Math.max(280, Math.round(body.length / 1.8) + 140));
      const { error } = await supabase.from('notepads' as any).insert({
        user_id: userId,
        title: title.slice(0, 80) || 'Notebook',
        content: body,
        grid_id: gridId,
        theme: 'clean-white',
        font: 'inter',
        icon: '📝',
        col_index: 0,
        row_index: nextRow,
        height,
      } as any);
      if (error) throw error;
      toast({ title: t('story.answerSavedToProjectFolio') });
      setPickerOpen(false);
      window.dispatchEvent(new CustomEvent('storymode:chapter-notebooks-changed'));
    } catch {
      toast({ title: t('story.answerSaveFailed'), variant: 'destructive' });
    } finally {
      setSavingFolioId(null);
    }
  };

  const btnClass =
    'inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50';

  return (
    <>
      <div className="flex justify-end gap-0.5 pt-2 mt-1 border-t border-foreground/[0.06]">
        <ActionTooltip label={t('story.answerCopy')}>
          <button type="button" onClick={copy} className={btnClass} aria-label={t('story.answerCopy')}>
            {copied ? <Check weight="bold" className="w-3.5 h-3.5" /> : <Copy weight="duotone" className="w-3.5 h-3.5" />}
          </button>
        </ActionTooltip>
        <ActionTooltip label={t('story.answerDiscuss')}>
          <button
            type="button"
            onClick={chatAbout}
            className={btnClass}
            aria-label={t('story.answerDiscuss')}
          >
            <ChatCircleDots weight="duotone" className="w-3.5 h-3.5" />
          </button>
        </ActionTooltip>
        <ActionTooltip label={t('story.saveAnswerToProjectFolio')}>
          <button
            type="button"
            onClick={openPicker}
            className={btnClass}
            aria-label={t('story.saveAnswerToProjectFolio')}
          >
            <BookOpen weight="duotone" className="w-3.5 h-3.5" />
          </button>
        </ActionTooltip>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="z-[70] max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('story.saveAnswerToProjectFolio')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {loadingFolios && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <SpinnerGap weight="bold" className="w-4 h-4 animate-spin" />
              </div>
            )}
            {!loadingFolios && folios.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{t('story.noFoliosToSave')}</p>
            )}
            {folios.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => saveToFolio(f.id)}
                disabled={!!savingFolioId}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.06] disabled:opacity-50"
              >
                <span className="text-base">{f.icon}</span>
                <span className="flex-1 truncate">{f.title}</span>
                {savingFolioId === f.id && <SpinnerGap weight="bold" className="w-4 h-4 animate-spin" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface Props {
  projectId: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  onSelectChapter?: (id: string) => void;
}

type Preview =
  | { kind: 'chapter'; id: string; title: string; offset: number; matchLen: number; q: string }
  | { kind: 'notepad'; id: string; gridId: string; title: string; offset: number; matchLen: number; q: string };

/* ---------- Inline search helpers ---------- */

function allMatches(text: string, q: string, max = 6): { snippet: string; offset: number }[] {
  if (!text || !q) return [];
  const lc = text.toLowerCase();
  const lcQ = q.toLowerCase();
  const out: { snippet: string; offset: number }[] = [];
  let from = 0;
  while (out.length < max) {
    const idx = lc.indexOf(lcQ, from);
    if (idx < 0) break;
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + q.length + 80);
    out.push({
      snippet: (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''),
      offset: idx,
    });
    from = idx + q.length;
  }
  return out;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lcText = text.toLowerCase();
  const lcQ = q.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const f = lcText.indexOf(lcQ, i);
    if (f < 0) { parts.push(text.slice(i)); break; }
    if (f > i) parts.push(text.slice(i, f));
    parts.push(
      <mark key={f} className="bg-foreground/20 text-current rounded-sm px-0.5">
        {text.slice(f, f + q.length)}
      </mark>
    );
    i = f + q.length;
  }
  return <>{parts}</>;
}

/* ---------- Side-by-side preview editor (chapter or notebook) ---------- */

function ResultPreview({ preview, onBack, onIconChange, onSaved, projectId, userId }: { preview: Preview; onBack: () => void; onIconChange?: (id: string, icon: string) => void; onSaved?: (id: string, updates: { title?: string; content?: string }) => void; projectId: string; userId?: string }) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState(preview.title);
  const [icon, setIcon] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [notepadFont, setNotepadFont] = useState<string>('inter');
  const baselineRef = useRef({ title: '', content: '' });
  const editorRef = useRef<WysiwygEditorHandle>(null);
  const matchText = useMemo(
    () => content.slice(preview.offset, preview.offset + preview.matchLen),
    [content, preview.offset, preview.matchLen],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const table = preview.kind === 'chapter' ? 'story_chapters' : 'notepads';
      const cols = preview.kind === 'notepad' ? 'title, content, icon, font' : 'title, content';
      const { data } = await supabase.from(table as any).select(cols).eq('id', preview.id).maybeSingle();
      if (cancelled) return;
      const row = (data as any) || { title: preview.title, content: '' };
      setTitle(row.title || '');
      setContent(row.content || '');
      setIcon(row.icon || '');
      if (preview.kind === 'notepad') setNotepadFont(row.font || 'inter');
      baselineRef.current = { title: row.title || '', content: row.content || '' };
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [preview.id, preview.kind, preview.title]);

  // Jump to the search match once, right after load. Must NOT re-run on every
  // keystroke or it would re-select text under the caret while typing.
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (jumpedRef.current === preview.id) return;
    jumpedRef.current = preview.id;
    const target = matchText || preview.q;
    const t = window.setTimeout(() => { editorRef.current?.scrollToText(target); }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, preview.id]);


  const commit = useCallback(async () => {
    const updates: Record<string, string> = {};
    if (title !== baselineRef.current.title) updates.title = title;
    if (content !== baselineRef.current.content) updates.content = content;
    if (!Object.keys(updates).length) return;
    const table = preview.kind === 'chapter' ? 'story_chapters' : 'notepads';
    const { error } = await supabase.from(table as any).update(updates as any).eq('id', preview.id);
    if (!error) {
      baselineRef.current = { title, content };
      onSaved?.(preview.id, updates);
    }
  }, [title, content, preview.id, preview.kind, onSaved]);

  useEffect(() => { const id = window.setInterval(() => { void commit(); }, 10000); return () => window.clearInterval(id); }, [commit]);
  useEffect(() => () => { void commit(); }, [commit]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-2 h-10 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.12)' }}>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onBack} aria-label="Back">
          <ArrowLeft weight="bold" className="w-3.5 h-3.5" />
        </Button>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {preview.kind === 'chapter' ? (
            <BookOpen weight="duotone" className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <EmojiPicker
              value={icon || '📝'}
              onChange={async (emoji) => {
                setIcon(emoji);
                await supabase.from('notepads' as any).update({ icon: emoji } as any).eq('id', preview.id);
                onIconChange?.(preview.id, emoji);
              }}
            />
          )}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => { void commit(); }}
            className="flex-1 min-w-0 bg-transparent text-xs font-medium outline-none border-none truncate"
            placeholder="Untitled"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {loading ? (
          <div className="text-xs text-muted-foreground p-3">Loading…</div>
        ) : (
          <div
            className={cn(
              'notepad-content prose prose-sm max-w-none rounded-lg border p-3',
              preview.kind === 'chapter'
                ? 'notepad-font-inter'
                : getFontById(notepadFont).className,
            )}
            style={{
              borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.15)',
              background: 'hsl(var(--notepad-bg, var(--background)) / 0.5)',
            }}
          >
            <WysiwygEditor
              ref={editorRef}
              value={content}
              onChange={setContent}
              onBlur={() => { void commit(); }}
              className="text-sm leading-relaxed min-h-[200px]"
              placeholder="Empty"
            />
            {preview.kind === 'notepad' && (
              <NotebookActions title={title} content={content} projectId={projectId} userId={userId} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Main browser ---------- */

function FoliosBrowserInner({ projectId, activeChapterId, activeChapterTitle, onSelectChapter }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Search state
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [searching, setSearching] = useState(false);
  const [chapterHits, setChapterHits] = useState<ChapterHit[]>([]);
  const [folioHits, setFolioHits] = useState<Folio[]>([]);
  const [notepadHits, setNotepadHits] = useState<Notepad[]>([]);
  const reqRef = useRef(0);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t); }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setChapterHits([]); setFolioHits([]); setNotepadHits([]); setSearching(false);
      return;
    }
    const myReq = ++reqRef.current;
    setSearching(true);
    const like = `%${debounced.replace(/[%_]/g, m => '\\' + m)}%`;
    (async () => {
      const [chRes, foRes, gridRes] = await Promise.all([
        supabase.from('story_chapters' as any).select('id, title, content').eq('project_id', projectId).or(`title.ilike.${like},content.ilike.${like}`).limit(25),
        supabase.from('notebook_grids' as any).select('id, title, icon').eq('project_id', projectId).ilike('title', like).limit(25),
        supabase.from('notebook_grids' as any).select('id').eq('project_id', projectId),
      ]);
      const gridIds = ((gridRes.data as any[]) || []).map(g => g.id);
      let nps: Notepad[] = [];
      if (gridIds.length) {
        const { data } = await supabase.from('notepads' as any).select('id, grid_id, title, content').in('grid_id', gridIds).or(`title.ilike.${like},content.ilike.${like}`).limit(40);
        nps = (data as any[]) || [];
      }
      if (myReq !== reqRef.current) return;
      setChapterHits(((chRes.data as any[]) || []) as ChapterHit[]);
      setFolioHits(((foRes.data as any[]) || []) as Folio[]);
      setNotepadHits(nps);
      setSearching(false);
    })();
  }, [debounced, projectId]);

  // Browse state
  const [folios, setFolios] = useState<Folio[]>(() => foliosCache.get(projectId) || []);
  const [foliosLoading, setFoliosLoading] = useState(() => !foliosCache.has(projectId));
  const [notepadsByGrid, setNotepadsByGrid] = useState<Record<string, Notepad[]>>(() => {
    const obj: Record<string, Notepad[]> = {};
    notepadsCache.forEach((v, k) => { if (k.startsWith(projectId + ':')) obj[k.slice(projectId.length + 1)] = v; });
    return obj;
  });
  const [loadingGrids, setLoadingGrids] = useState<Record<string, boolean>>({});
  const [openGrids, setOpenGrids] = useState<Record<string, boolean>>(() => openGridsCache.get(projectId) || {});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() => openNotesCache.get(projectId) || {});
  const [projectOpen, setProjectOpen] = useState(true);
  const [chapterOpen, setChapterOpen] = useState(true);
  const [projectTitle, setProjectTitle] = useState('');

  // Chapter folio state
  const [chapterNotebooks, setChapterNotebooks] = useState<ChapterNotebook[]>([]);
  const [chapterNotebooksLoading, setChapterNotebooksLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmResetRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cachedFolios = foliosCache.get(projectId);

    // Use the cache for an immediate render, but always revalidate it. Folios can
    // be created in the notes view while this browser is unmounted, so treating a
    // cached project as a reason to skip the query leaves this list stale until a
    // full-page refresh clears the module-level cache.
    setFolios(cachedFolios || []);
    setFoliosLoading(!cachedFolios);

    (async () => {
      const { data, error } = await supabase.from('notebook_grids' as any).select('id, title, icon').eq('project_id', projectId).order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        setFoliosLoading(false);
        return;
      }
      const list = (data as any[]) || [];
      foliosCache.set(projectId, list);
      setFolios(list);
      setFoliosLoading(false);
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => { openGridsCache.set(projectId, openGrids); }, [projectId, openGrids]);
  useEffect(() => { openNotesCache.set(projectId, openNotes); }, [projectId, openNotes]);
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProjectTitle(data?.title || '');
      });
    return () => { cancelled = true; };
  }, [projectId]);

  // Load chapter notebooks when active chapter changes
  const loadChapterNotebooks = useCallback(async () => {
    if (!activeChapterId) { setChapterNotebooks([]); return; }
    setChapterNotebooksLoading(true);
    const { data } = await supabase
      .from('notepads' as any)
      .select('id, title, content, chapter_id, grid_id, updated_at, icon')
      .eq('chapter_id', activeChapterId)
      .order('updated_at', { ascending: false });
    setChapterNotebooks(((data as any[]) || []) as ChapterNotebook[]);
    setChapterNotebooksLoading(false);
  }, [activeChapterId]);
  useEffect(() => { void loadChapterNotebooks(); }, [loadChapterNotebooks]);
  useEffect(() => {
    const onChanged = () => { void loadChapterNotebooks(); };
    window.addEventListener('storymode:chapter-notebooks-changed', onChanged);
    return () => window.removeEventListener('storymode:chapter-notebooks-changed', onChanged);
  }, [loadChapterNotebooks]);
  useEffect(() => {
    const openNotebook = (detail: OpenNotebookDetail) => {
      if (detail.section === 'project') {
        setProjectOpen(true);
        setOpenGrids(current => ({ ...current, [detail.gridId]: true }));
      } else {
        setChapterOpen(true);
      }
      setPreview({ kind: 'notepad', id: detail.id, gridId: detail.gridId, title: detail.title || 'Untitled', offset: 0, matchLen: 0, q: '' });
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenNotebookDetail>).detail;
      if (!detail?.id) return;
      pendingOpenNotebook = null;
      openNotebook(detail);
    };
    window.addEventListener('storymode:open-chapter-notebook', onOpen);
    // Replay an event dispatched while this tab was unmounted.
    if (pendingOpenNotebook) {
      const detail = pendingOpenNotebook;
      pendingOpenNotebook = null;
      openNotebook(detail);
    }
    return () => window.removeEventListener('storymode:open-chapter-notebook', onOpen);
  }, []);

  const toggleGrid = async (gid: string) => {
    const next = !openGrids[gid];
    setOpenGrids(s => ({ ...s, [gid]: next }));
    if (next && !notepadsByGrid[gid]) {
      const cacheKey = `${projectId}:${gid}`;
      if (notepadsCache.has(cacheKey)) { setNotepadsByGrid(s => ({ ...s, [gid]: notepadsCache.get(cacheKey)! })); return; }
      setLoadingGrids(s => ({ ...s, [gid]: true }));
      const { data } = await supabase.from('notepads' as any).select('id, grid_id, title, content, col_index, row_index, icon').eq('grid_id', gid).order('col_index', { ascending: true }).order('row_index', { ascending: true });
      const list = (data as any[]) || [];
      notepadsCache.set(cacheKey, list);
      setNotepadsByGrid(s => ({ ...s, [gid]: list }));
      setLoadingGrids(s => ({ ...s, [gid]: false }));
    }
  };

  const addChapterNotebook = async () => {
    if (!user || !activeChapterId) return;
    // Pick a "Chapter notes" hidden grid for this project (or fall back to first grid).
    let gridId: string | null = null;
    const { data: hidden } = await supabase.from('notebook_grids' as any).select('id').eq('project_id', projectId).eq('title', '__chapter_notes__').maybeSingle();
    if (hidden && (hidden as any).id) gridId = (hidden as any).id;
    if (!gridId) {
      const { data: newGrid } = await supabase.from('notebook_grids' as any).insert({ project_id: projectId, user_id: user.id, title: '__chapter_notes__', icon: '🔗', position: 9999 } as any).select('id').single();
      gridId = (newGrid as any)?.id ?? null;
    }
    if (!gridId) return;
    const { data } = await supabase.from('notepads' as any).insert({
      user_id: user.id, grid_id: gridId, chapter_id: activeChapterId,
      title: 'Chapter note', content: '', theme: 'clean-white', font: 'inter', icon: '📝', col_index: 0, row_index: 0,
    } as any).select('*').single();
    if (data) {
      const row = data as any as ChapterNotebook;
      setChapterNotebooks(prev => [{ ...row }, ...prev]);
      setPreview({ kind: 'notepad', id: row.id, gridId: row.grid_id, title: row.title || 'Untitled', offset: 0, matchLen: 0, q: '' });
    }
  };

  const deleteChapterNotebook = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      if (confirmResetRef.current) window.clearTimeout(confirmResetRef.current);
      confirmResetRef.current = window.setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    if (confirmResetRef.current) window.clearTimeout(confirmResetRef.current);
    setConfirmDeleteId(null);
    setChapterNotebooks(prev => prev.filter(n => n.id !== id));
    await supabase.from('notepads' as any).delete().eq('id', id);
  };

  const q = debounced;
  const total = chapterHits.length + folioHits.length + notepadHits.length;

  if (preview) {
    return <ResultPreview preview={preview} projectId={projectId} userId={user?.id} onBack={() => setPreview(null)} onSaved={(id, updates) => {
      setChapterNotebooks(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
      setNotepadsByGrid(prev => {
        const out: Record<string, Notepad[]> = {};
        for (const k of Object.keys(prev)) out[k] = prev[k].map(n => n.id === id ? { ...n, ...updates } : n);
        return out;
      });
    }} onIconChange={(id, ic) => {
      setChapterNotebooks(prev => prev.map(n => n.id === id ? { ...n, icon: ic } : n));
      setNotepadsByGrid(prev => {
        const out: Record<string, Notepad[]> = {};
        for (const k of Object.keys(prev)) out[k] = prev[k].map(n => n.id === id ? { ...n, icon: ic } : n);
        return out;
      });
    }} />;
  }

  const headingClass = 'w-full text-left px-2 py-1.5 rounded-md hover:bg-foreground/5 transition-colors flex items-center gap-1.5 text-sm font-medium';
  const snippetClass = 'w-full text-left pl-7 pr-2 py-1.5 rounded-md hover:bg-foreground/5 transition-colors block text-xs text-muted-foreground leading-relaxed';
  const sectionLabel = 'text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono px-2 pt-3 pb-1';

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.12)' }}>
        <div className="relative">
          {searching ? (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <span className="w-1 h-1 rounded-full bg-current/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" />
              <span className="w-1 h-1 rounded-full bg-current/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
              <span className="w-1 h-1 rounded-full bg-current/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }} />
            </div>
          ) : (
            <MagnifyingGlass weight="duotone" className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          )}
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            {...{placeholder: t('story.searchPlaceholder')}}
            className="h-8 pl-7 pr-7 text-xs bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-foreground/10"
              {...{"aria-label": t('story.clearSearch')}}
            >
              <X weight="bold" className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 text-sm">
        {/* SEARCH RESULTS MODE */}
        {q.length >= 2 && (
          <>
            {searching && total === 0 && (
              <div className="flex items-center justify-center gap-1 p-6 text-xs text-muted-foreground/70">
                <span>{t('story.searching')}</span>
                <span className="inline-flex gap-0.5 ml-0.5">
                  <span className="w-0.5 h-0.5 rounded-full bg-current animate-[dot-fade_1.2s_ease-in-out_infinite]" />
                  <span className="w-0.5 h-0.5 rounded-full bg-current animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
                  <span className="w-0.5 h-0.5 rounded-full bg-current animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }} />
                </span>
              </div>
            )}
            {!searching && total === 0 && (
              <div className="text-xs text-muted-foreground p-3">{t('story.noResults', { query: q })}</div>
            )}

            {chapterHits.length > 0 && (
              <div>
                <div className={sectionLabel}>{t('story.chapterResultsHeading', { count: chapterHits.length })}</div>
                {chapterHits.map(c => {
                  const matches = allMatches(c.content || '', q);
                  return (
                    <div key={c.id} className="mb-1">
                      <button className={headingClass} onClick={() => setPreview({ kind: 'chapter', id: c.id, title: c.title || 'Untitled', offset: matches[0]?.offset ?? 0, matchLen: q.length, q })}>
                        <BookOpen weight="duotone" className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate"><Highlight text={c.title || 'Untitled'} q={q} /></span>
                        {matches.length > 1 && <span className="text-[10px] text-muted-foreground font-mono">· {matches.length}</span>}
                      </button>
                      {matches.map((m, i) => (
                        <button key={i} className={snippetClass} onClick={() => setPreview({ kind: 'chapter', id: c.id, title: c.title || 'Untitled', offset: m.offset, matchLen: q.length, q })}>
                          <Highlight text={m.snippet} q={q} />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {folioHits.length > 0 && (
              <div>
                <div className={sectionLabel}>{t('story.folioResultsHeading', { count: folioHits.length })}</div>
                {folioHits.map(f => (
                  <button key={f.id} className={headingClass} onClick={() => window.open(`/grid/${f.id}`, '_self')}>
                    <span className="text-sm">{f.icon || '📁'}</span>
                    <span className="truncate"><Highlight text={f.title} q={q} /></span>
                  </button>
                ))}
              </div>
            )}

            {notepadHits.length > 0 && (
              <div>
                <div className={sectionLabel}>{t('story.notebookResultsHeading', { count: notepadHits.length })}</div>
                {notepadHits.map(n => {
                  const matches = allMatches(n.content || '', q);
                  return (
                    <div key={n.id} className="mb-1">
                      <button className={headingClass} onClick={() => setPreview({ kind: 'notepad', id: n.id, gridId: n.grid_id, title: cleanNotebookTitle(n.title) || 'Untitled', offset: matches[0]?.offset ?? 0, matchLen: q.length, q })}>
                        <Notebook weight="duotone" className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate"><Highlight text={cleanNotebookTitle(n.title) || 'Untitled'} q={q} /></span>
                        {matches.length > 1 && <span className="text-[10px] text-muted-foreground font-mono">· {matches.length}</span>}
                      </button>
                      {matches.map((m, i) => (
                        <button key={i} className={snippetClass} onClick={() => setPreview({ kind: 'notepad', id: n.id, gridId: n.grid_id, title: cleanNotebookTitle(n.title) || 'Untitled', offset: m.offset, matchLen: q.length, q })}>
                          <Highlight text={m.snippet} q={q} />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* BROWSE MODE */}
        {q.length < 2 && (
          <>
            {/* CHAPTER FOLIO */}
            <section className="mb-6 rounded-lg border border-foreground/10 bg-foreground/[0.025] px-2 py-2">
              <button
                onClick={() => setChapterOpen(o => !o)}
                className="w-full flex items-center gap-2.5 px-2 py-2 text-left hover:text-foreground transition-colors"
              >
                <FolderSimple weight="duotone" className="w-7 h-7 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-foreground/80 font-mono font-semibold">
                    {t('story.chapterFolio')}
                  </span>
                  <span className="block mt-0.5 text-xs text-muted-foreground truncate">
                    {activeChapterTitle || t('story.selectChapterForNotebooks')}
                  </span>
                </span>
                {chapterOpen ? <CaretDown weight="bold" className="w-3 h-3 shrink-0 text-muted-foreground" /> : <CaretRight weight="bold" className="w-3 h-3 shrink-0 text-muted-foreground" />}
              </button>
              {chapterOpen && (
                <div className="pl-2 pr-1">
                  {!activeChapterId && (
                    <div className="text-[11px] text-muted-foreground px-2 py-2">{t('story.selectChapterForNotebooks')}</div>
                  )}
                  {activeChapterId && chapterNotebooksLoading && (
                    <div className="text-[11px] text-muted-foreground px-2 py-2">Loading…</div>
                  )}
                  {activeChapterId && !chapterNotebooksLoading && chapterNotebooks.length === 0 && (
                    <div className="text-[11px] text-muted-foreground px-2 py-2">{t('story.noChapterNotebooks')}</div>
                  )}
                  {chapterNotebooks.map(n => (
                    <div key={n.id} className="group mb-1">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setOpenNotes(s => ({ ...s, [n.id]: !s[n.id] }))}
                          className="p-1 rounded hover:bg-foreground/5 shrink-0"
                          {...{"aria-label": openNotes[n.id] ? t('story.collapse') : t('story.expand')}}
                        >
                          {openNotes[n.id] ? <CaretDown weight="bold" className="w-3 h-3" /> : <CaretRight weight="bold" className="w-3 h-3" />}
                        </button>
                        <button
                          className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-foreground/5 text-left transition-colors"
                          onClick={() => setPreview({ kind: 'notepad', id: n.id, gridId: n.grid_id, title: cleanNotebookTitle(n.title) || 'Untitled', offset: 0, matchLen: 0, q: '' })}
                        >
                          {n.icon && <span className="text-sm leading-none shrink-0">{n.icon}</span>}
                          <span className="truncate text-sm">{cleanNotebookTitle(n.title) || 'Untitled'}</span>
                        </button>
                        <ActionTooltip label={confirmDeleteId === n.id ? t('story.removeChapterNotebookConfirm', 'Click again to confirm') : t('story.removeChapterNotebook')}>
                        <button
                          onClick={() => deleteChapterNotebook(n.id)}
                          className={cn(
                            'p-1 transition-opacity shrink-0',
                            confirmDeleteId === n.id
                              ? 'opacity-100 text-destructive'
                              : 'opacity-0 group-hover:opacity-60 hover:opacity-100',
                          )}
                          {...{"aria-label": confirmDeleteId === n.id ? t('story.removeChapterNotebookConfirm', 'Click again to confirm') : t('story.removeChapterNotebook')}}
                        >
                          <X weight="bold" className="w-3 h-3" />
                        </button>
                        </ActionTooltip>
                      </div>
                      {openNotes[n.id] && (
                        <div className={cn('ml-6 my-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3', NOTEBOOK_PREVIEW_CLASS)}>
                          {n.content
                            ? <Markdown variant="notebook" content={paragraphize(n.content)} readOnly />
                            : <em>{t('story.empty')}</em>}
                          {n.content && (
                            <NotebookActions title={cleanNotebookTitle(n.title)} content={n.content} projectId={projectId} userId={user?.id} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {activeChapterId && (
                    <button
                      onClick={addChapterNotebook}
                      className="mt-1 w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-foreground/5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-foreground/10 hover:border-foreground/25"
                    >
                      <Plus weight="bold" className="w-3 h-3" />
                      {t('story.addChapterNotebook')}
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* PROJECT FOLIOS */}
            <section>
              <button
                onClick={() => setProjectOpen(o => !o)}
                className="w-full flex items-center gap-2.5 px-2 py-2 text-left hover:text-foreground transition-colors"
              >
                <Folders weight="duotone" className="w-7 h-7 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-[0.2em] text-foreground/80 font-mono font-semibold">
                    {t('story.projectFolios')}
                  </span>
                  {projectTitle && (
                    <span className="block mt-0.5 text-xs text-muted-foreground truncate">{projectTitle}</span>
                  )}
                </span>
                {projectOpen ? <CaretDown weight="bold" className="w-3 h-3 shrink-0 text-muted-foreground" /> : <CaretRight weight="bold" className="w-3 h-3 shrink-0 text-muted-foreground" />}
              </button>
              {projectOpen && (
                <>
                  {foliosLoading && (
                    <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-current/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-current/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }} />
                    </div>
                  )}
                  {!foliosLoading && folios.filter(f => f.title !== '__chapter_notes__').length === 0 && (
                    <div className="text-xs text-muted-foreground p-3">{t('story.noFoliosYet')}</div>
                  )}
                  {folios.filter(f => f.title !== '__chapter_notes__').map(f => (
                    <div key={f.id} className="mb-1">
                      <button className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-foreground/5 text-left transition-colors" onClick={() => toggleGrid(f.id)}>
                        {openGrids[f.id] ? <CaretDown weight="bold" className="w-3 h-3" /> : <CaretRight weight="bold" className="w-3 h-3" />}
                        <span className="text-base">{f.icon || '📁'}</span>
                        <span className="truncate font-mono text-sm">{f.title}</span>
                      </button>
                      {openGrids[f.id] && (
                        <ul className="pl-5 space-y-0.5 mt-0.5">
                          {loadingGrids[f.id] && !notepadsByGrid[f.id] && (
                            <li className="px-2 py-1 text-xs text-muted-foreground">Loading…</li>
                          )}
                          {(notepadsByGrid[f.id] || []).map(n => (
                            <li key={n.id} className="group">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => setOpenNotes(s => ({ ...s, [n.id]: !s[n.id] }))}
                                  className="p-1 rounded hover:bg-foreground/5 shrink-0"
                                  {...{"aria-label": openNotes[n.id] ? t('story.collapse') : t('story.expand')}}
                                >
                                  {openNotes[n.id] ? <CaretDown weight="bold" className="w-3 h-3" /> : <CaretRight weight="bold" className="w-3 h-3" />}
                                </button>
                                <button
                                  className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-foreground/5 text-left transition-colors"
                                  onClick={() => setPreview({ kind: 'notepad', id: n.id, gridId: n.grid_id, title: cleanNotebookTitle(n.title) || 'Untitled', offset: 0, matchLen: 0, q: '' })}
                                >
                                  {n.icon && <span className="text-sm leading-none shrink-0">{n.icon}</span>}
                                  <span className="truncate text-sm">{cleanNotebookTitle(n.title) || 'Untitled'}</span>
                                </button>
                              </div>
                              {openNotes[n.id] && (
                                <div className={cn('my-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3', NOTEBOOK_PREVIEW_CLASS)}>
                                  {n.content
                                    ? <Markdown variant="notebook" content={paragraphize(n.content)} readOnly />
                                    : <em>{t('story.empty')}</em>}
                                  {n.content && (
                                    <NotebookActions title={cleanNotebookTitle(n.title)} content={n.content} projectId={projectId} userId={user?.id} />
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                          {notepadsByGrid[f.id] && notepadsByGrid[f.id].length === 0 && (
                            <li className="px-2 py-1 text-xs text-muted-foreground">{t('story.noNotebooks')}</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ))}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export const FoliosBrowser = memo(FoliosBrowserInner);
