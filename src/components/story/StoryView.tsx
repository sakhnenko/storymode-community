import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import { useStoryChapters } from '@/hooks/useStoryChapters';
import { ChapterList } from './ChapterList';
import { ChapterEditor } from './ChapterEditor';
import { StoryRightPanel } from './StoryRightPanel';
import { ThemeModal } from '@/components/notepad/ThemeModal';
import { getThemeById } from '@/lib/notepad-themes';
import { Button } from '@/components/ui/button';
import {
  PanelLeftOpen, PanelLeftClose, PanelRightOpen, ArrowsOut, ArrowsIn, Palette, BookOpen,
  Trash, X, ArrowUUpLeft, ArrowUUpRight,
} from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ViewLoadingOverlay } from '@/components/ui/ViewLoadingOverlay';
import { useUserPlan } from '@/hooks/useUserPlan';
import type { ReviewRequest } from './StoryChat';
import type { Editor } from '@tiptap/react';
import { flashQuote, replaceQuote, selectQuote } from '@/lib/tiptap-review-highlight';
import { useTranslation } from 'react-i18next';

const LS_PREFIX = 'storymode:story:';

interface Props {
  projectId: string;
  readOnly?: boolean;
  /** A passage to scroll to and flash once its chapter's editor is ready. */
  jumpToQuote?: { chapterId: string; quote: string } | null;
  onJumpedToQuote?: () => void;
}

const JUMP_RETRY_MS = 150;
const JUMP_GIVE_UP_MS = 5000;

function StoryToolbarButton({
  label,
  onClick,
  triggerOnMouseDown = false,
  disabled = false,
  tooltipAlign = 'center',
  children,
}: {
  label: string;
  onClick: () => void;
  triggerOnMouseDown?: boolean;
  disabled?: boolean;
  tooltipAlign?: 'center' | 'end';
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label={label}
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              if (triggerOnMouseDown) onClick();
            }}
            onClick={triggerOnMouseDown ? undefined : onClick}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align={tooltipAlign === 'end' ? 'end' : 'center'}
          className="font-mono text-xs"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DeleteChapterButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  return (
    <StoryToolbarButton
      label={confirm ? t('story.deleteChapterConfirm') : t('story.deleteChapter')}
      onClick={() => {
        if (confirm) { onConfirm(); setConfirm(false); }
        else { setConfirm(true); window.setTimeout(() => setConfirm(false), 2500); }
      }}
    >
      {confirm
        ? <X weight="bold" className="w-4 h-4 text-destructive" />
        : <Trash weight="duotone" className="w-4 h-4" />}
    </StoryToolbarButton>
  );
}

export function StoryView({ projectId, readOnly = false, jumpToQuote, onJumpedToQuote }: Props) {
  const { t } = useTranslation();
  const { chapters, loading, createChapter, updateChapter, deleteChapter, reorderChapters } =
    useStoryChapters(projectId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(() => {
    const v = localStorage.getItem(LS_PREFIX + projectId + ':leftOpen');
    return v === null ? true : v === 'true';
  });
  const [rightOpen, setRightOpen] = useState(() => {
    const v = localStorage.getItem(LS_PREFIX + projectId + ':rightOpen');
    return v === null ? true : v === 'true';
  });
  const [maximized, setMaximized] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [fontId, setFontId] = useState<string>(() => localStorage.getItem(LS_PREFIX + 'font') || 'source');
  const [fontSizeId, setFontSizeId] = useState<string>(() => localStorage.getItem(LS_PREFIX + 'fontSize') || 'large');
  const [defaultThemeId, setDefaultThemeId] = useState<string>(
    () => localStorage.getItem(LS_PREFIX + 'theme') || 'cream'
  );
  const [rightTab, setRightTab] = useState<'folios' | 'info' | 'editor'>(() => {
    const v = localStorage.getItem(LS_PREFIX + projectId + ':rightTab');
    if (v === 'chat') return 'editor';
    if (v === 'folios' || v === 'info' || v === 'editor') return v;
    // The AI editor is where a project opens; the side panel falls back to Info without AI.
    return 'editor';
  });
  const [activeDraftId, setActiveDraftId] = useState<string | null | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const [titleVisible, setTitleVisible] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleEditorReady = useCallback((ed: Editor | null) => {
    // Ignore stale teardowns: a recreated editor's onCreate fires before the
    // old instance's onDestroy, so a `null` arriving while we hold a live
    // editor is the old instance signing off.
    if (ed === null && editorRef.current && !editorRef.current.isDestroyed) return;
    editorRef.current = ed;
    if (!ed || ed.isDestroyed) { setCanUndo(false); setCanRedo(false); return; }
    const refresh = () => {
      if (!ed || ed.isDestroyed) return;
      try {
        setCanUndo(ed.can().undo());
        setCanRedo(ed.can().redo());
      } catch { /* editor view torn down */ }
    };
    refresh();
    ed.on('transaction', refresh);
    ed.on('update', refresh);
  }, []);


  const handleUndo = useCallback(() => {
    editorRef.current?.chain().focus().undo().run();
  }, []);
  const handleRedo = useCallback(() => {
    editorRef.current?.chain().focus().redo().run();
  }, []);
  const [headerTitle, setHeaderTitle] = useState('');
  const [chapterStats, setChapterStats] = useState({ words: 0, pages: 0 });

  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(LS_PREFIX + 'leftWidth') || '', 10);
    return Number.isFinite(v) && v >= 180 ? v : 256;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(LS_PREFIX + 'rightWidth') || '', 10);
    return Number.isFinite(v) && v >= 240 ? v : 360;
  });
  useEffect(() => { localStorage.setItem(LS_PREFIX + 'leftWidth', String(leftWidth)); }, [leftWidth]);
  useEffect(() => { localStorage.setItem(LS_PREFIX + 'rightWidth', String(rightWidth)); }, [rightWidth]);
  useEffect(() => { localStorage.setItem(LS_PREFIX + projectId + ':leftOpen', String(leftOpen)); }, [leftOpen, projectId]);
  useEffect(() => { localStorage.setItem(LS_PREFIX + projectId + ':rightOpen', String(rightOpen)); }, [rightOpen, projectId]);
  useEffect(() => { localStorage.setItem(LS_PREFIX + projectId + ':rightTab', rightTab); }, [rightTab, projectId]);
  useEffect(() => {
    const onOpenChapterNotebook = () => { setRightOpen(true); setRightTab('folios'); };
    window.addEventListener('storymode:open-chapter-notebook', onOpenChapterNotebook);
    return () => window.removeEventListener('storymode:open-chapter-notebook', onOpenChapterNotebook);
  }, []);
  useEffect(() => {
    const onChatAboutText = () => { setRightOpen(true); setRightTab('editor'); };
    window.addEventListener('storymode:chat-about-text', onChatAboutText);
    return () => window.removeEventListener('storymode:chat-about-text', onChatAboutText);
  }, []);

  const dragRef = useRef<{ side: 'left' | 'right'; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const delta = e.clientX - d.startX;
      if (d.side === 'left') {
        const w = Math.min(560, Math.max(180, d.startW + delta));
        setLeftWidth(w);
      } else {
        const w = Math.min(640, Math.max(240, d.startW - delta));
        setRightWidth(w);
      }
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  const startLeftResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { side: 'left', startX: e.clientX, startW: leftWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth]);
  const startRightResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { side: 'right', startX: e.clientX, startW: rightWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [rightWidth]);

  // Toggle global focus mode (hides main app Header)
  useEffect(() => {
    document.body.classList.toggle('story-focus-mode', maximized);
    return () => { document.body.classList.remove('story-focus-mode'); };
  }, [maximized]);

  // Pick a default active chapter when loaded
  useEffect(() => {
    if (!loading && chapters.length > 0 && !chapters.find(c => c.id === activeId)) {
      const last = localStorage.getItem(LS_PREFIX + projectId + ':active');
      const picked = (last && chapters.find(c => c.id === last)) || chapters[0];
      setActiveId(picked.id);
    }
  }, [loading, chapters, activeId, projectId]);

  useEffect(() => {
    if (activeId) localStorage.setItem(LS_PREFIX + projectId + ':active', activeId);
  }, [activeId, projectId]);

  // New projects start with an empty Chapter 1 instead of a blank story view.
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (loading || readOnly || autoCreatedRef.current) return;
    if (chapters.length > 0) return;
    autoCreatedRef.current = true;
    (async () => {
      const ch = await createChapter('Chapter 1');
      if (ch) setActiveId(ch.id);
    })();
  }, [loading, readOnly, chapters.length, createChapter]);

  const activeChapter = useMemo(
    () => chapters.find(c => c.id === activeId) || null,
    [chapters, activeId]
  );

  const effectiveTheme = defaultThemeId;
  const themeClass = getThemeById(effectiveTheme).className;

  useEffect(() => {
    if (!activeChapter) {
      setHeaderTitle('');
      setChapterStats({ words: 0, pages: 0 });
    }
  }, [activeChapter]);

  const handleSave = useCallback((updates: { title?: string; content?: string }) => {
    if (!activeChapter) return false;
    return updateChapter(activeChapter.id, updates);
  }, [activeChapter, updateChapter]);

  // Passages marked for review become chat questions, queued one after another.
  const [reviewQueue, setReviewQueue] = useState<ReviewRequest[]>([]);
  const handleReviewHandled = useCallback((id: string) => {
    setReviewQueue(prev => prev.filter(r => r.id !== id));
  }, []);

  // Clicking a quote in the AI Editor jumps to that passage and flashes it.
  const handleQuoteClick = useCallback((quote: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    // Jump back to the passage and re-select it in the editor.
    if (!selectQuote(ed, quote)) flashQuote(ed, quote, 2600);
  }, []);


  // The editor mounts a moment after the chapter is chosen, so keep looking
  // briefly. A quote the chapter no longer contains just opens the chapter.
  useEffect(() => {
    if (!jumpToQuote || activeChapter?.id !== jumpToQuote.chapterId) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const ed = editorRef.current;
      const found = !!ed && !ed.isDestroyed && flashQuote(ed, jumpToQuote.quote, 4000);
      if (found || Date.now() - started > JUMP_GIVE_UP_MS) {
        window.clearInterval(timer);
        onJumpedToQuote?.();
      }
    }, JUMP_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [jumpToQuote, activeChapter?.id, onJumpedToQuote]);

  // Applying a suggestion swaps the quoted passage for the suggested text.
  const handleQuoteReplace = useCallback((quote: string, replacement: string) => {
    const ed = editorRef.current;
    if (!ed) return false;
    return replaceQuote(ed, quote, replacement);
  }, []);

  const { hasAi } = useUserPlan();

  const handleCreateReview = useCallback(async (payload: {
    id: string;
    intent: 'sounds_wrong' | 'needs_ideas' | 'mark_for_review';
    quote: string; contextBefore: string; contextAfter: string;
  }) => {
    setReviewQueue(prev => prev.some(item => item.id === payload.id)
      ? prev
      : [...prev, {
          id: payload.id,
          quote: payload.quote,
          intent: payload.intent,
          createdAt: Date.now(),
          contextBefore: payload.contextBefore,
          contextAfter: payload.contextAfter,
        }]);
    setRightTab('editor');
    setRightOpen(true);
  }, []);

  const handleCreate = useCallback(async () => {
    const ch = await createChapter(`Chapter ${chapters.length + 1}`);
    if (ch) setActiveId(ch.id);
  }, [createChapter, chapters.length]);

  const handleRename = useCallback((id: string, title: string) => {
    updateChapter(id, { title });
  }, [updateChapter]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteChapter(id);
    if (activeId === id) {
      const rest = chapters.filter(c => c.id !== id);
      setActiveId(rest[0]?.id ?? null);
    }
  }, [deleteChapter, activeId, chapters]);

  // Stable style objects so memoized children don't see new prop refs each render.
  const surfaceStyle = useMemo<React.CSSProperties>(() => ({
    backgroundColor: 'hsl(var(--notepad-bg, var(--background)))',
    backgroundImage: 'none',
    color: 'hsl(var(--notepad-fg, var(--foreground)))',
  }), []);
  const panelStyle = useMemo<React.CSSProperties>(() => ({
    color: 'hsl(var(--notepad-fg, var(--foreground)))',
    backgroundColor: 'var(--notepad-panel-bg, hsl(var(--notepad-bg, var(--background))))',
    backgroundImage: 'none',
    boxShadow:
      '0 1px 2px -1px hsl(0 0% 0% / 0.12), ' +
      '0 3px 8px -3px hsl(0 0% 0% / 0.15)',
  }), []);
  const dividerStyle = useMemo<React.CSSProperties>(() => ({
    borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.06)',
  }), []);

  return (
    <div className={cn('flex-1 min-h-0 flex relative notepad-themed gap-3 p-3', themeClass)} style={surfaceStyle}>
      {(loading || (chapters.length > 0 && !activeChapter)) && (
        <div className="absolute inset-0 z-50 flex">
          <ViewLoadingOverlay view="story" />
        </div>
      )}
      {/* Left panel */}
      {!maximized && leftOpen && (
        <div className="shrink-0 h-full rounded-md p-px story-panel-border">
          <aside
            className="h-full rounded-[5px] flex flex-col relative overflow-hidden shadow-sm"
            style={{ ...panelStyle, width: leftWidth }}
          >
            <div className="flex items-center justify-between px-3 h-10 border-b" style={dividerStyle}>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">{t('story.chaptersLabel')}</span>
              <div className="flex items-center gap-1">
                <StoryToolbarButton label={t('story.themeAndTypography')} onClick={() => setThemeOpen(true)} triggerOnMouseDown>
                  <Palette weight="duotone" className="w-4 h-4" />
                </StoryToolbarButton>
                <StoryToolbarButton label={t('story.hideChapters')} onClick={() => setLeftOpen(false)}>
                  <PanelLeftClose weight="duotone" className="w-4 h-4" />
                </StoryToolbarButton>
              </div>
            </div>
            <ChapterList
              chapters={chapters}
              activeId={activeId}
              loading={loading}
              readOnly={readOnly}
              onSelect={setActiveId}
              onCreate={handleCreate}
              onReorder={reorderChapters}
            />
            <div
              onMouseDown={startLeftResize}
              className="absolute right-0 top-0 bottom-0 w-1 -mr-0.5 cursor-col-resize z-20 hover:bg-foreground/20 transition-colors"
            />
          </aside>
        </div>
      )}

      {/* Center editor — flat page, no container chrome */}
      <div className="flex-1 min-w-0 h-full">
        <section className="h-full flex flex-col overflow-hidden bg-transparent" style={{ color: 'hsl(var(--notepad-fg, var(--foreground)))' }}>
        <div className="flex items-center justify-between px-3 h-10">
          <div className="flex items-center gap-1">
            {!maximized && !leftOpen && (
              <>
                <StoryToolbarButton label={t('story.showChapters')} onClick={() => setLeftOpen(true)}>
                  <PanelLeftOpen weight="duotone" className="w-4 h-4" />
                </StoryToolbarButton>
                <StoryToolbarButton label={t('story.themeAndTypography')} onClick={() => setThemeOpen(true)} triggerOnMouseDown>
                  <Palette weight="duotone" className="w-4 h-4" />
                </StoryToolbarButton>
              </>
            )}
          </div>
          <div
            className={cn(
              'flex-1 min-w-0 px-3 flex items-baseline justify-start gap-3 transition-opacity duration-200',
              titleVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {headerTitle || activeChapter?.title}
            </span>
            <span className="shrink-0 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground opacity-70">
              {t('story.wordsAndPages', { words: chapterStats.words.toLocaleString(), pages: chapterStats.pages, count: chapterStats.pages })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!readOnly && activeChapter && !maximized && (
              <DeleteChapterButton onConfirm={() => handleDelete(activeChapter.id)} />
            )}
            {!readOnly && activeChapter && (
              <>
                <StoryToolbarButton label={t('story.undoTooltip')} onClick={handleUndo} disabled={!canUndo}>
                  <ArrowUUpLeft weight="duotone" className="w-4 h-4" />
                </StoryToolbarButton>
                <StoryToolbarButton label={t('story.redoTooltip')} onClick={handleRedo} disabled={!canRedo}>
                  <ArrowUUpRight weight="duotone" className="w-4 h-4" />
                </StoryToolbarButton>
              </>
            )}
            <StoryToolbarButton label={maximized ? t('story.exitFocusMode') : t('story.focusMode')} onClick={() => setMaximized(m => !m)}>
              {maximized ? <ArrowsIn weight="duotone" className="w-4 h-4" /> : <ArrowsOut weight="duotone" className="w-4 h-4" />}
            </StoryToolbarButton>
            {!maximized && !rightOpen && (
              <StoryToolbarButton label={t('story.showSidePanel')} tooltipAlign="end" onClick={() => setRightOpen(true)}>
                <PanelRightOpen weight="duotone" className="w-4 h-4" />
              </StoryToolbarButton>
            )}
          </div>
        </div>

        {activeChapter ? (
          <ChapterEditor
            key={activeChapter.id}
            chapter={activeChapter}
            readOnly={readOnly}
            themeClass={themeClass}
            fontId={fontId}
            fontSizeId={fontSizeId}
            onSave={handleSave}
            onTitleVisibilityChange={setTitleVisible}
            onTitleChange={setHeaderTitle}
            onStatsChange={setChapterStats}
            onCreateReviewHighlight={hasAi ? handleCreateReview : undefined}
            onActiveDraftChange={setActiveDraftId}
            onSetActiveDraft={(id) => updateChapter(activeChapter.id, { active_draft_id: id })}
            onEditorReady={handleEditorReady}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-muted-foreground">
            <BookOpen weight="duotone" className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm mb-3">{readOnly ? t('story.noChaptersYet') : t('story.startWithFirstChapter')}</p>
            {!readOnly && (
              <Button onClick={handleCreate} variant="outline" size="sm">{t('story.createFirstChapter')}</Button>
            )}
          </div>
        )}
        </section>
      </div>

      {/* Right panel */}
      <div className={(!maximized && rightOpen) ? 'contents' : 'hidden'}>
        <StoryRightPanel
          projectId={projectId}
          activeTab={rightTab}
          onTabChange={setRightTab}
          onClose={() => setRightOpen(false)}
          panelStyle={panelStyle}
          dividerStyle={dividerStyle}
          width={rightWidth}
          onResizeStart={startRightResize}
          activeChapterId={activeChapter?.id}
          activeChapterTitle={activeChapter?.title}
          activeChapterContent={activeChapter?.content}
          activeChapterUpdatedAt={activeChapter?.updated_at}
          onSelectChapter={setActiveId}
          reviewQueue={reviewQueue}
          onReviewHandled={handleReviewHandled}
          onQuoteClick={handleQuoteClick}
          onQuoteReplace={handleQuoteReplace}
        />
      </div>

      <ThemeModal
        open={themeOpen}
        onOpenChange={setThemeOpen}
        currentTheme={effectiveTheme}
        currentFont={fontId}
        currentFontSize={fontSizeId}
        onThemeChange={(id) => {
          localStorage.setItem(LS_PREFIX + 'theme', id);
          setDefaultThemeId(id);
        }}
        onFontChange={(id) => {
          localStorage.setItem(LS_PREFIX + 'font', id);
          setFontId(id);
        }}
        onFontSizeChange={(id) => {
          localStorage.setItem(LS_PREFIX + 'fontSize', id);
          setFontSizeId(id);
        }}
      />
    </div>
  );
}
