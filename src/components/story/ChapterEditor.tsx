import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { editorMarkdown, storyEditorExtensions } from '@/lib/story-editor';
import { countWords, pageCount } from '@/lib/chapter-stats';
import { StoryChapter } from '@/hooks/useStoryChapters';
import { getFontById, getFontSizeById } from '@/lib/notepad-themes';
import { cn } from '@/lib/utils';
import { useChapterDrafts } from '@/hooks/useChapterDrafts';
import { ChapterDraftPicker } from './ChapterDraftPicker';
import { HistoryButton } from '@/components/HistoryButton';
import { ReviewHighlight, flashRange, type ReviewIntent } from '@/lib/tiptap-review-highlight';
import { BlockIndent } from '@/lib/tiptap-block-indent';
import { ParagraphNavigator } from './ParagraphNavigator';
import { useTranslation } from 'react-i18next';
import {
  TextB, TextItalic, TextUnderline, ListBullets, ListNumbers, TextHOne, TextHTwo, TextIndent, Sparkle, BookmarkSimple,
} from '@/components/ui/icons';
import { pendingSaveKey, pendingSaves } from '@/lib/pending-saves';

type ChapterUpdates = { title?: string; content?: string };

interface Props {
  chapter: StoryChapter;
  readOnly: boolean;
  themeClass: string;
  fontId: string;
  fontSizeId: string;
  onSave: (updates: ChapterUpdates) => boolean | void | Promise<boolean | void>;
  onTitleVisibilityChange?: (visible: boolean) => void;
  onTitleChange?: (title: string) => void;
  onStatsChange?: (stats: { words: number; pages: number }) => void;
  /** Existing highlights to re-apply onto the editor by quote match. */
  reviewHighlights?: Array<{ id: string; intent: ReviewIntent; quote: string }>;
  /** Called when the user picks a review intent in the bubble menu. */
  onCreateReviewHighlight?: (payload: {
    id: string;
    intent: ReviewIntent;
    quote: string;
    contextBefore: string;
    contextAfter: string;
  }) => void | Promise<void>;
  /** Currently-active draft id; used by the parent for scoping highlights. */
  activeDraftId?: string | null;
  onActiveDraftChange?: (id: string | null) => void;
  /** Persist a new active draft id to the parent chapter row. */
  onSetActiveDraft?: (id: string | null) => void;
  /** Exposes the live Tiptap editor instance to the parent for replace/scroll ops. */
  onEditorReady?: (editor: Editor | null) => void;
}

interface StoredChapterDraft {
  title: string;
  content: string;
  savedAt: number;
}

const chapterDraftStorageKey = (chapterId: string) => `storymode:chapter-draft:${chapterId}`;

function storeChapterDraft(chapterId: string, title: string, content: string) {
  try {
    localStorage.setItem(chapterDraftStorageKey(chapterId), JSON.stringify({ title, content, savedAt: Date.now() }));
  } catch {
    // Autosave remains available when browser storage is unavailable.
  }
}

function readChapterDraft(chapterId: string): StoredChapterDraft | null {
  try {
    const raw = localStorage.getItem(chapterDraftStorageKey(chapterId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredChapterDraft>;
    if (typeof value.title !== 'string' || typeof value.content !== 'string') return null;
    return { title: value.title, content: value.content, savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0 };
  } catch {
    return null;
  }
}

function clearChapterDraft(chapterId: string) {
  try {
    localStorage.removeItem(chapterDraftStorageKey(chapterId));
  } catch {
    // Nothing else to do when storage is unavailable.
  }
}

function extractPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~`#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getStats(text: string) {
  const words = countWords(text);
  return { words, pages: pageCount(words) };
}

function normalizeStoryMarkdown(markdown: string) {
  if (!markdown) return markdown;

  const normalizedNewlines = markdown.replace(/\r\n?/g, '\n');
  const accidentalFenceMatch = normalizedNewlines.match(/^```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)(?:\n```\s*)?$/);
  if (accidentalFenceMatch) {
    const inner = accidentalFenceMatch[1];
    const proseLineCount = inner.split('\n').filter((line) => /[A-Za-z].*[.!?]["')\]]?$/.test(line.trim())).length;
    if (proseLineCount >= 3) {
      return inner;
    }
  }

  // Replace any leading tabs or 4-space groups with non-breaking spaces so
  // markdown doesn't interpret them as a code block (common when the user
  // hits Tab to indent dialogue).
  const NBSP = '\u00A0';
  return normalizedNewlines
    .split('\n')
    .map((line) => {
      const match = line.match(/^([\t ]+)(\S.*)$/);
      if (!match) return line;
      const [, indent, rest] = match;
      // Count tabs as 4 spaces, then convert to NBSPs (preserves visual indent
      // without triggering markdown code-block parsing).
      let spaces = 0;
      for (const ch of indent) spaces += ch === '\t' ? 4 : 1;
      if (spaces < 2) return line;
      return NBSP.repeat(spaces) + rest;
    })
    .join('\n');
}

function ChapterEditorInner({
  chapter, readOnly, themeClass, fontId, fontSizeId,
  onSave, onTitleVisibilityChange, onTitleChange, onStatsChange,
  reviewHighlights, onCreateReviewHighlight, onActiveDraftChange, onSetActiveDraft, onEditorReady,
}: Props) {
  const { t } = useTranslation();
  const fontClass = getFontById(fontId).className;
  const sizeClass = getFontSizeById(fontSizeId).className;

  // Draft viewing: null = editing live chapter, otherwise we're viewing a snapshot read-only.
  const [viewingDraftId, setViewingDraftId] = useState<string | null>(null);
  // Optimistic active-draft id used immediately after creating/deleting a draft,
  // so the picker reflects the change before the parent prop round-trips back.
  const [optimisticActiveDraftId, setOptimisticActiveDraftId] = useState<string | null>(null);
  const { drafts, createNewDraft, setActive, deleteDraft, renameDraft, mirrorActive } = useChapterDrafts(
    chapter.id,
    chapter.content || '',
    chapter.title || '',
    optimisticActiveDraftId ?? chapter.active_draft_id ?? null,
  );
  // Clear the optimistic override once the parent catches up.
  useEffect(() => {
    if (optimisticActiveDraftId && chapter.active_draft_id === optimisticActiveDraftId) {
      setOptimisticActiveDraftId(null);
    }
  }, [chapter.active_draft_id, optimisticActiveDraftId]);
  // Also clear when switching chapters.
  useEffect(() => { setOptimisticActiveDraftId(null); }, [chapter.id]);
  const effectiveActiveDraftId = optimisticActiveDraftId ?? chapter.active_draft_id ?? null;

  // When viewing an old draft, override editor content/title with the snapshot.
  const viewingDraft = useMemo(
    () => (viewingDraftId ? drafts.find(d => d.id === viewingDraftId) ?? null : null),
    [viewingDraftId, drafts],
  );
  const [localDraft, setLocalDraft] = useState<StoredChapterDraft | null>(() => {
    if (readOnly) return null;
    const stored = readChapterDraft(chapter.id);
    if (!stored) return null;
    if (stored.title === chapter.title && stored.content === (chapter.content || '')) {
      clearChapterDraft(chapter.id);
      return null;
    }
    return stored;
  });
  const effectiveContent = viewingDraft ? viewingDraft.content : localDraft?.content ?? chapter.content ?? '';
  const effectiveTitle = viewingDraft ? viewingDraft.title : localDraft?.title ?? chapter.title;
  const effectiveReadOnly = readOnly || !!viewingDraft;

  const editorContent = useMemo(() => normalizeStoryMarkdown(effectiveContent), [effectiveContent]);

  // Reset viewing-draft when switching chapters.
  useEffect(() => { setViewingDraftId(null); }, [chapter.id]);

  // Tell the parent which draft is currently in view (for scoping AI highlights).
  useEffect(() => {
    const id = viewingDraftId ?? effectiveActiveDraftId;
    onActiveDraftChange?.(id);
  }, [viewingDraftId, effectiveActiveDraftId, onActiveDraftChange]);

  // Mirror current values in refs so the autosave / unmount flush always sees the latest.
  const titleRef = useRef(localDraft?.title ?? chapter.title);
  const contentRef = useRef(localDraft?.content ?? chapter.content ?? '');
  const dirtyRef = useRef(!!localDraft);
  const editorRef = useRef<Editor | null>(null);
  const baselineTitleRef = useRef(chapter.title);
  const baselineContentRef = useRef(chapter.content || '');
  const onSaveRef = useRef(onSave);
  const mirrorActiveRef = useRef(mirrorActive);
  const readOnlyRef = useRef(readOnly);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveAgainRef = useRef(false);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { mirrorActiveRef.current = mirrorActive; }, [mirrorActive]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  const persistAndQueue = useCallback(() => {
    dirtyRef.current = titleRef.current !== baselineTitleRef.current || contentRef.current !== baselineContentRef.current;
    const key = pendingSaveKey('chapter', chapter.id);
    if (dirtyRef.current) {
      storeChapterDraft(chapter.id, titleRef.current, contentRef.current);
      pendingSaves.upsert(key, () => flushRef.current());
    } else {
      clearChapterDraft(chapter.id);
      pendingSaves.clear(key);
    }
  }, [chapter.id]);

  const syncContentFromEditor = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (!editorRef.current || editorRef.current.isDestroyed) return;
    const md = editorMarkdown(editorRef.current) ?? editorRef.current.getText();
    contentRef.current = md;
    persistAndQueue();
  }, [persistAndQueue]);

  // Serializing the whole document and writing it to browser storage is heavy
  // in long chapters, so keep it off the keystroke path and run it once typing
  // pauses. Teardown handlers below still capture the latest text immediately.
  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      syncContentFromEditor();
    }, 3000);
  }, [syncContentFromEditor]);

  useEffect(() => () => {
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
  }, []);

  useEffect(() => {
    if (dirtyRef.current) return;
    titleRef.current = chapter.title;
    contentRef.current = chapter.content || '';
    baselineTitleRef.current = chapter.title;
    baselineContentRef.current = chapter.content || '';
  }, [chapter.id, chapter.title, chapter.content]);

  useEffect(() => {
    if (!localDraft || dirtyRef.current) return;
    if (chapter.title === localDraft.title && (chapter.content || '') === localDraft.content) {
      setLocalDraft(null);
    }
  }, [chapter.title, chapter.content, localDraft]);

  const flushPendingChanges = useCallback((): Promise<boolean> => {
    const key = pendingSaveKey('chapter', chapter.id);
    if (!dirtyRef.current) {
      pendingSaves.clear(key);
      return Promise.resolve(true);
    }
    if (readOnlyRef.current) return Promise.resolve(false);
    syncContentFromEditor();
    if (savePromiseRef.current) {
      saveAgainRef.current = true;
      return savePromiseRef.current;
    }

    const title = titleRef.current;
    const content = contentRef.current;
    const updates: ChapterUpdates = {};
    if (title !== baselineTitleRef.current) updates.title = title;
    if (content !== baselineContentRef.current) updates.content = content;
    if (Object.keys(updates).length === 0) {
      dirtyRef.current = false;
      clearChapterDraft(chapter.id);
      pendingSaves.clear(key);
      return Promise.resolve(true);
    }

    const save = onSaveRef.current;
    const mirror = mirrorActiveRef.current;
    const request = Promise.resolve()
      .then(async () => {
        const saved = await save(updates);
        if (saved === false) return false;
        const mirrored = await mirror(updates);
        return mirrored !== false;
      })
      .then((succeeded) => {
        if (!succeeded) {
          dirtyRef.current = true;
          storeChapterDraft(chapter.id, titleRef.current, contentRef.current);
          pendingSaves.upsert(key, () => flushRef.current());
          pendingSaves.reportFailure();
          return false;
        }

        baselineTitleRef.current = title;
        baselineContentRef.current = content;
        const hasNewerChanges = titleRef.current !== title || contentRef.current !== content;
        dirtyRef.current = hasNewerChanges;
        if (hasNewerChanges) {
          storeChapterDraft(chapter.id, titleRef.current, contentRef.current);
          pendingSaves.upsert(key, () => flushRef.current());
        } else {
          // Keep this seed until the confirmed parent props catch up. It
          // prevents one intermediate render from restoring the older text.
          setLocalDraft({ title, content, savedAt: Date.now() });
          clearChapterDraft(chapter.id);
          pendingSaves.clear(key);
        }
        return true;
      })
      .catch(() => {
        dirtyRef.current = true;
        storeChapterDraft(chapter.id, titleRef.current, contentRef.current);
        pendingSaves.upsert(key, () => flushRef.current());
        pendingSaves.reportFailure();
        return false;
      })
      .finally(() => {
        savePromiseRef.current = null;
        if (saveAgainRef.current && dirtyRef.current) {
          saveAgainRef.current = false;
          queueMicrotask(() => { void flushRef.current(); });
        }
      });

    savePromiseRef.current = request;
    return request;
  }, [chapter.id, syncContentFromEditor]);
  flushRef.current = flushPendingChanges;

  useEffect(() => {
    if (!localDraft || readOnly || !dirtyRef.current) return;
    pendingSaves.upsert(pendingSaveKey('chapter', chapter.id), () => flushRef.current());
  }, [chapter.id, localDraft, readOnly]);

  // Autosave every 15s while not read-only (folio editor parity).
  useEffect(() => {
    if (effectiveReadOnly) return;
    const id = window.setInterval(() => { void flushPendingChanges(); }, 15000);
    return () => window.clearInterval(id);
  }, [effectiveReadOnly, flushPendingChanges]);

  // Flush on chapter switch / unmount.
  useEffect(() => () => { void flushPendingChanges(); }, [flushPendingChanges]);

  const commit = () => effectiveReadOnly ? Promise.resolve(true) : flushPendingChanges();

  useEffect(() => {
    const preserveDraft = () => {
      if (!dirtyRef.current) return;
      syncContentFromEditor();
      storeChapterDraft(chapter.id, titleRef.current, contentRef.current);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      preserveDraft();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', preserveDraft);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('pagehide', preserveDraft);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [chapter.id, syncContentFromEditor]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const titleElRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    onTitleVisibilityChange?.(true);
    onTitleChange?.(effectiveTitle);
    onStatsChange?.(getStats(extractPlainText(effectiveContent)));
  }, [chapter.id, effectiveTitle, effectiveContent, onTitleVisibilityChange, onTitleChange, onStatsChange]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const titleEl = titleElRef.current;
    if (!scrollEl || !titleEl) return;

    const updateTitleVisibility = () => {
      const scrollBounds = scrollEl.getBoundingClientRect();
      const titleBounds = titleEl.getBoundingClientRect();
      onTitleVisibilityChange?.(titleBounds.bottom > scrollBounds.top + 8);
    };

    updateTitleVisibility();
    scrollEl.addEventListener('scroll', updateTitleVisibility, { passive: true });
    window.addEventListener('resize', updateTitleVisibility);

    return () => {
      scrollEl.removeEventListener('scroll', updateTitleVisibility);
      window.removeEventListener('resize', updateTitleVisibility);
    };
  }, [chapter.id, onTitleVisibilityChange]);

  const statsTimerRef = useRef<number | null>(null);
  const blurCommitTimerRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [paraRevision, setParaRevision] = useState(0);
  const paraTimerRef = useRef<number | null>(null);
  const scheduleParaRevision = () => {
    if (paraTimerRef.current) window.clearTimeout(paraTimerRef.current);
    paraTimerRef.current = window.setTimeout(() => setParaRevision(r => r + 1), 500);
  };
  const [liveStats, setLiveStats] = useState(() => getStats(extractPlainText(effectiveContent)));
  const scheduleStats = () => {
    if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current);
    statsTimerRef.current = window.setTimeout(() => {
      if (!editorRef.current) return;
      const s = getStats(editorRef.current.getText());
      setLiveStats(s);
      onStatsChange?.(s);
    }, 600);
  };
  const scheduleCommit = () => {
    if (readOnly) return;
    if (blurCommitTimerRef.current) window.clearTimeout(blurCommitTimerRef.current);
    blurCommitTimerRef.current = window.setTimeout(() => {
      blurCommitTimerRef.current = null;
      commit();
    }, 0);
  };

  const handleScrollActivity = useCallback(() => {
    setIsScrolling(true);
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => setIsScrolling(false), 700);
  }, []);

  // Persist and restore scroll position per chapter.
  const scrollStorageKey = `chapter-scroll:${chapter.id}`;
  const scrollSaveTimerRef = useRef<number | null>(null);
  const handleScrollPersist = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollSaveTimerRef.current) window.clearTimeout(scrollSaveTimerRef.current);
    scrollSaveTimerRef.current = window.setTimeout(() => {
      try { localStorage.setItem(scrollStorageKey, String(top)); } catch { /* noop */ }
    }, 200);
  }, [scrollStorageKey]);

  const scrollRestoredRef = useRef<string | null>(null);
  // Reset restore flag when switching chapters.
  useEffect(() => { scrollRestoredRef.current = null; }, [chapter.id]);

  // --- Reading bookmark -------------------------------------------------
  // Remember the caret/last-edited line per chapter, restore it centered and
  // mark it with a bookmark icon that fades once the writer resumes editing.
  const caretStorageKey = `chapter-caret:${chapter.id}`;
  const caretSaveTimerRef = useRef<number | null>(null);
  const saveCaret = useCallback((pos: number) => {
    if (caretSaveTimerRef.current) window.clearTimeout(caretSaveTimerRef.current);
    caretSaveTimerRef.current = window.setTimeout(() => {
      try { localStorage.setItem(caretStorageKey, String(pos)); } catch { /* noop */ }
    }, 300);
  }, [caretStorageKey]);

  const [bookmarkTop, setBookmarkTop] = useState<number | null>(null);
  const [bookmarkFading, setBookmarkFading] = useState(false);
  const bookmarkTopRef = useRef<number | null>(null);
  const bookmarkFadeTimerRef = useRef<number | null>(null);
  useEffect(() => { bookmarkTopRef.current = bookmarkTop; }, [bookmarkTop]);
  const dismissBookmark = useCallback(() => {
    if (bookmarkTopRef.current == null) return;
    setBookmarkFading(true);
    if (bookmarkFadeTimerRef.current) window.clearTimeout(bookmarkFadeTimerRef.current);
    bookmarkFadeTimerRef.current = window.setTimeout(() => {
      setBookmarkTop(null);
      setBookmarkFading(false);
    }, 1400);
  }, []);
  useEffect(() => {
    setBookmarkTop(null);
    setBookmarkFading(false);
  }, [chapter.id]);


  useEffect(() => () => {
    if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current);
    if (blurCommitTimerRef.current) window.clearTimeout(blurCommitTimerRef.current);
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    if (scrollSaveTimerRef.current) window.clearTimeout(scrollSaveTimerRef.current);
    if (caretSaveTimerRef.current) window.clearTimeout(caretSaveTimerRef.current);
    if (bookmarkFadeTimerRef.current) window.clearTimeout(bookmarkFadeTimerRef.current);
  }, []);

  const editor = useEditor({
    extensions: storyEditorExtensions(t('story.beginWriting'), [ReviewHighlight, BlockIndent]),
    content: editorContent,
    editable: !effectiveReadOnly,
    editorProps: {
      attributes: {
        class: 'tiptap-chapter max-w-none min-h-[55vh] focus:outline-none leading-[1.7]',
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Tab') return false;
        event.preventDefault();
        const INDENT = '\u00A0\u00A0\u00A0\u00A0';
        const FIRST_LINE = '\u2003\u2003';
        const { state } = view;
        const { from, to, empty } = state.selection;

        // Collect the text blocks the selection touches.
        const starts: number[] = [];
        let fullySelected = !empty;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isTextblock) return;
          const start = pos + 1;
          const end = pos + node.nodeSize - 1;
          starts.push(start);
          // Whole-paragraph indent only when the selection covers the block.
          if (from > start || to < end) fullySelected = false;
        });
        if (!starts.length) return true;

        // Not a full-paragraph selection: indent just the first line at the caret.
        if (!event.shiftKey && !fullySelected) {
          view.dispatch(state.tr.insertText(FIRST_LINE, from, to));
          return true;
        }

        const tr = state.tr;
        // Apply back-to-front so earlier positions stay valid.
        for (const pos of starts.slice().reverse()) {
          if (event.shiftKey) {
            const text = state.doc.textBetween(pos, Math.min(pos + INDENT.length, state.doc.content.size));
            const lead = text.match(/^[\u00A0\u2003]+/)?.[0] ?? '';
            if (lead) tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + Math.min(lead.length, INDENT.length)));
          } else {
            tr.insertText(INDENT, tr.mapping.map(pos));
          }
        }
        if (tr.docChanged) view.dispatch(tr);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      // Mark dirty and register the pending save cheaply; the expensive
      // markdown serialization + storage write happens once typing pauses.
      dirtyRef.current = true;
      pendingSaves.upsert(pendingSaveKey('chapter', chapter.id), () => flushRef.current());
      schedulePersist();
      scheduleStats();
      scheduleParaRevision();
      if (!viewingDraftId) saveCaret(editor.state.selection.head);
      dismissBookmark();
    },
    onSelectionUpdate: ({ editor }) => {
      if (viewingDraftId) return;
      saveCaret(editor.state.selection.head);
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      const s = getStats(editor.getText());
      setLiveStats(s);
      onStatsChange?.(s);
      onEditorReady?.(editor);
    },
    onDestroy: () => {
      // When the editor is recreated (chapter/draft/read-only change) the new
      // instance's onCreate can fire BEFORE the old instance's onDestroy.
      // Don't let the stale teardown wipe the live editor reference — only
      // clear when the destroyed editor is still the current one.
      if (editorRef.current && !editorRef.current.isDestroyed) return;
      editorRef.current = null;
      onEditorReady?.(null);
    },
    onBlur: scheduleCommit,
  }, [chapter.id, viewingDraftId, effectiveReadOnly]);

  // When the viewing draft (or chapter) changes, swap editor content without
  // recreating the editor (preserves scroll). The deps above only recreate
  // on chapter/draft switch; we don't recreate on every autosave.
  const lastLoadedContentRef = useRef<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const key = `${chapter.id}::${viewingDraftId ?? 'live'}`;
    const isSwitch = loadedKeyRef.current !== key;
    loadedKeyRef.current = key;
    if (lastLoadedContentRef.current === editorContent) return;
    lastLoadedContentRef.current = editorContent;
    // Only force setContent when our local edits aren't dirty (i.e. external
    // change like a draft switch). Otherwise we'd clobber the user's edits.
    if (dirtyRef.current) return;
    // While the writer is typing in this chapter, never re-seed the document
    // from the prop: the save round-trip echoes the content back and a
    // setContent would drop the caret at the end of the text mid-sentence.
    if (!isSwitch && editor.isFocused) return;
    // Belt-and-braces: if the editor already holds the exact markdown we're
    // about to set (just via a different route than `lastLoadedContentRef`),
    // skip the setContent call. This prevents a stale chapter.content prop
    // from clobbering live edits in the editor (e.g. when a sibling state
    // update — like dismissing a review highlight — re-renders this component
    // before the autosave round-trip has flushed the user's typing).
    try {
      const currentMd = editorMarkdown(editor) ?? '';
      if (currentMd === editorContent) return;
    } catch { /* fall through to setContent */ }
    // Preserve the caret across the swap so an in-place content refresh can
    // never teleport the cursor to the end of the chapter.
    const prevSelection = isSwitch ? null : { from: editor.state.selection.from, to: editor.state.selection.to };
    try {
      editor.commands.setContent(editorContent, { emitUpdate: false });
    } catch { return; }
    if (prevSelection) {
      try {
        const size = editor.state.doc.content.size;
        editor.commands.setTextSelection({
          from: Math.min(prevSelection.from, size),
          to: Math.min(prevSelection.to, size),
        });
      } catch { /* selection no longer valid */ }
    }
    setParaRevision(r => r + 1);
  }, [editor, editorContent, chapter.id, viewingDraftId]);


  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editorRef.current = editor;
    try { editor.setEditable(!effectiveReadOnly); } catch { /* editor is mounting or tearing down */ }
  }, [editor, effectiveReadOnly]);

  // Restore scroll after content is loaded into the editor.
  useEffect(() => {
    if (!editor) return;
    if (viewingDraftId) return; // only restore for live chapter view
    if (scrollRestoredRef.current === chapter.id) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        try {
          // Prefer the remembered caret line: center it and drop a bookmark.
          let placed = false;
          const savedCaret = localStorage.getItem(caretStorageKey);
          const pos = savedCaret == null ? NaN : Number(savedCaret);
          const docSize = editor.state.doc.content.size;
          // Never mark the first line: a caret at the very top isn't a
          // meaningful "resume here" spot, so only bookmark below it.
          const firstBlockSize = editor.state.doc.firstChild?.nodeSize ?? 0;
          if (!Number.isNaN(pos) && pos > firstBlockSize && pos <= docSize) {
            const coords = editor.view.coordsAtPos(Math.min(pos, docSize));
            const elRect = el.getBoundingClientRect();
            const docTop = coords.top - elRect.top + el.scrollTop;
            const lineMid = docTop + Math.max(0, coords.bottom - coords.top) / 2;
            el.scrollTop = Math.max(0, lineMid - el.clientHeight / 2);
            setBookmarkFading(false);
            setBookmarkTop(lineMid);
            placed = true;
          }
          if (!placed) {
            const saved = localStorage.getItem(scrollStorageKey);
            if (saved != null) {
              const top = Number(saved);
              if (!Number.isNaN(top)) el.scrollTop = top;
            }
          }
        } catch { /* noop */ }
        scrollRestoredRef.current = chapter.id;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [editor, chapter.id, viewingDraftId, scrollStorageKey, caretStorageKey]);

  // Re-apply review highlight marks whenever the highlight list (or content) changes.
  // Marks already on the doc keep their position (so freshly-created marks placed via
  // setReviewHighlight aren't relocated by an indexOf fallback that may match elsewhere).
  // Only re-paint marks for highlights that don't already have a mark in the doc, and
  // only remove marks whose highlight has been deleted.
  useEffect(() => {
    if (!editor) return;
    if (editor.isDestroyed) return;
    const list = reviewHighlights || [];
    const markType = editor.schema.marks.reviewHighlight;
    if (!markType) return;
    const tr = editor.state.tr;
    const wantedIds = new Set(list.map(h => h.id));
    const presentIds = new Set<string>();
    // Strip marks for highlights that no longer exist; remember which ids
    // are already correctly placed so we don't relocate them.
    editor.state.doc.descendants((node, pos) => {
      if (!node || !node.isText) return;
      node.marks.forEach((m) => {
        if (m.type !== markType) return;
        const id = m.attrs.id as string | null;
        if (id && wantedIds.has(id)) {
          presentIds.add(id);
        } else {
          tr.removeMark(pos, pos + node.nodeSize, markType);
        }
      });
    });
    // For any highlight without a mark in the doc, paint by exact-text match
    // using a position-accurate walker so the painted range lines up with the
    // saved quote down to the character. Build a flat character buffer with a
    // parallel array of ProseMirror positions (-1 for synthetic block
    // separators). This mirrors how triggerReview captured the quote via
    // doc.textBetween(from, to, '\n', '\n') and avoids the off-by-N drift the
    // old descendants-based mapping suffered from with nested blocks.
    let bufText = '';
    const bufMap: number[] = [];
    let needSep = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText) {
        if (needSep && bufText.length > 0) {
          bufText += '\n';
          bufMap.push(-1);
          needSep = false;
        }
        const s = node.text || '';
        for (let i = 0; i < s.length; i++) {
          bufText += s[i];
          bufMap.push(pos + i);
        }
        return false;
      }
      if (node.isBlock) needSep = true;
      return true;
    });
    for (const h of list) {
      if (presentIds.has(h.id)) continue;
      const q = (h.quote || '').trim();
      if (!q) continue;
      const idx = bufText.indexOf(q);
      if (idx === -1) continue; // can't locate exactly — skip rather than guess
      const startPos = bufMap[idx];
      const endPos = bufMap[idx + q.length - 1];
      if (startPos < 0 || endPos < 0) continue;
      const from = startPos;
      const to = endPos + 1;
      if (to > from) {
        tr.addMark(from, to, markType.create({ id: h.id, intent: h.intent }));
      }
    }
    if (tr.docChanged || tr.steps.length > 0) {
      editor.view.dispatch(tr.setMeta('addToHistory', false));
    }
  }, [editor, reviewHighlights, editorContent]);

  const handleCreateDraft = async () => {
    // Flush current edits into live chapter + current draft first.
    commit();
    const created = await createNewDraft();
    if (created) {
      setOptimisticActiveDraftId(created.id);
      setViewingDraftId(null);
      // Reflect the new active draft id in the parent (hook already wrote it to DB).
      onSetActiveDraft?.(created.id);
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    commit();
    if (viewingDraftId === draftId) setViewingDraftId(null);
    const fallback = await deleteDraft(draftId);
    // If the deleted draft was the live one, sync the new active id to the parent.
    if (effectiveActiveDraftId === draftId) {
      setOptimisticActiveDraftId(fallback);
      onSetActiveDraft?.(fallback);
    }
  };

  const handleViewDraft = (draftId: string | null) => {
    // Flush before switching context.
    commit();
    setViewingDraftId(draftId);
    if (draftId) {
      // Just viewing — don't change the active draft.
      return;
    }
  };

  // When user clicks a draft that IS the active one, treat as "return to live" (no viewing).
  const onPickerView = (id: string | null) => {
    if (id && id === effectiveActiveDraftId) {
      handleViewDraft(null);
    } else {
      handleViewDraft(id);
    }
  };

  const triggerReview = (intent: ReviewIntent) => {
    if (!editor || effectiveReadOnly || !onCreateReviewHighlight) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const quote = editor.state.doc.textBetween(from, to, '\n', '\n').trim();
    if (!quote) return;
    const before = editor.state.doc.textBetween(Math.max(0, from - 600), from, '\n', '\n');
    const after = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 600), '\n', '\n');
    // Assign the id up front and paint the mark on the exact selection so the
    // visible highlight always matches what the user picked (the indexOf
    // fallback used during re-paint could otherwise land on a different
    // occurrence of the same text).
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    // Flash the passage briefly to confirm it was handed to the AI Editor,
    // then let the highlight fade away on its own.
    // Keep the viewport still: the user is already looking at the passage.
    editor.chain().setTextSelection({ from: to, to }).run();
    flashRange(editor, from, to, 2600, false);
    void onCreateReviewHighlight({ id, intent, quote, contextBefore: before, contextAfter: after });
  };

  return (
    <div
      ref={scrollRef}
      className={cn('relative flex-1 min-h-0 overflow-y-auto scrollbar-auto', isScrolling && 'scrollbar-visible', themeClass)}
      onScroll={(e) => { handleScrollActivity(); handleScrollPersist(e); }}
      style={{
        background: 'hsl(var(--notepad-bg, var(--background)))',
        color: 'hsl(var(--notepad-fg, var(--foreground)))',
      }}
    >
      {bookmarkTop != null && (
        <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: bookmarkTop }}>
          <div className="relative mx-auto max-w-3xl px-8">
            <BookmarkSimple
              weight="fill"
              className={cn(
                'absolute left-1.5 -translate-y-1/2 w-5 h-5 transition-opacity duration-[1200ms]',
                bookmarkFading ? 'opacity-0' : 'opacity-70',
              )}
              style={{ color: 'hsl(var(--primary))' }}
            />
          </div>
        </div>
      )}
      <div className="pointer-events-none sticky top-0 z-30 h-0">
        <div className="pointer-events-none absolute left-0 top-0 h-screen w-8">

          <ParagraphNavigator editor={editor} scrollRef={scrollRef} revision={paraRevision} />
        </div>
      </div>
      <div className={cn('relative mx-auto flex min-h-full max-w-3xl flex-col px-8 py-12', fontClass, sizeClass)}>
        <div ref={titleElRef} className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <ChapterDraftPicker
              drafts={drafts}
              activeDraftId={effectiveActiveDraftId}
              viewingDraftId={viewingDraftId}
              onView={onPickerView}
              onCreateNew={handleCreateDraft}
              onDelete={handleDeleteDraft}
              onRename={renameDraft}
              readOnly={readOnly}
            />
            {effectiveActiveDraftId && !readOnly && (
              <HistoryButton
                entityType="chapter_draft"
                entityId={effectiveActiveDraftId}
                onRestore={(snap) => {
                  // Replace the live editor + persist through the usual save path.
                  editor?.commands.setContent(snap.content || '');
                  titleRef.current = snap.title || titleRef.current;
                  contentRef.current = snap.content || '';
                  persistAndQueue();
                  void flushPendingChanges();
                }}
              />
            )}
            {viewingDraft && (
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] opacity-60">
                {t('story.readOnlySnapshot')}
              </span>
            )}
          </div>
          <input
            type="text"
            key={`${chapter.id}:${viewingDraftId ?? 'live'}`}
            defaultValue={effectiveTitle}
            onChange={(e) => {
              titleRef.current = e.target.value;
              onTitleChange?.(e.target.value);
              persistAndQueue();
            }}
            onBlur={scheduleCommit}
            readOnly={effectiveReadOnly}
            className="w-full bg-transparent outline-none border-none text-4xl font-semibold tracking-tight"
            style={{ color: 'hsl(var(--notepad-fg, var(--foreground)))' }}
            placeholder={t('story.chapterTitlePlaceholder')}
          />
          <div
            className="mt-3 text-[11px] font-mono uppercase tracking-[0.18em] opacity-50"
            style={{ color: 'hsl(var(--notepad-fg, var(--foreground)))' }}
          >
            {t('story.wordsAndPages', { words: liveStats.words.toLocaleString(), pages: liveStats.pages, count: liveStats.pages })}
          </div>
        </div>
        <div
          className="pb-24 min-h-[60vh] cursor-text"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && editor && !effectiveReadOnly) {
              e.preventDefault();
              editor.chain().focus('end').run();
            }
          }}
        >
          <EditorContent
            editor={editor}
            className="w-full min-h-[50vh]"
            style={{ color: 'hsl(var(--notepad-fg, var(--foreground)))' }}
          />
          {editor && !effectiveReadOnly && (
            <BubbleMenu editor={editor} options={{ placement: 'top' }}>
              <div
                className="flex items-center gap-0.5 rounded-md border bg-popover px-1 py-1 shadow-lg"
                style={{ borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.18)' }}
              >
                <BubbleBtn label={t('story.bubbleBold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
                  <TextB weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleBtn label={t('story.bubbleItalic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
                  <TextItalic weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleBtn label={t('story.bubbleUnderline')} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                  <TextUnderline weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleSep />
                <BubbleBtn label={t('story.bubbleHeading1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                  <TextHOne weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleBtn label={t('story.bubbleHeading2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                  <TextHTwo weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleSep />
                <BubbleBtn label={t('story.bubbleBulletList')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                  <ListBullets weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleBtn label={t('story.bubbleOrderedList')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                  <ListNumbers weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                <BubbleBtn label={t('story.bubbleIndent')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                  <TextIndent weight="bold" className="w-4 h-4" />
                </BubbleBtn>
                {onCreateReviewHighlight && (
                  <>
                    <BubbleSep />
                    <button
                      type="button"
                      aria-label="Mark for review"
                      title="Flag this passage for feedback"
                      onMouseDown={(e) => { e.preventDefault(); triggerReview('mark_for_review'); }}
                      className="ml-0.5 inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium hover:bg-foreground/10 transition-colors"
                      style={{ color: 'hsl(var(--primary))' }}
                    >
                      <Sparkle weight="duotone" className="w-3.5 h-3.5" />
                      {t('story.bubbleMarkForReview')}
                    </button>
                  </>
                )}
              </div>
            </BubbleMenu>
          )}
        </div>
      </div>
    </div>
  );
}

function BubbleBtn({
  label, onClick, active, tint, children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded transition-colors',
        'hover:bg-foreground/10',
        active && 'bg-foreground/15',
      )}
      style={tint && active ? { color: tint } : tint ? { color: tint, opacity: 0.85 } : undefined}
    >
      {children}
    </button>
  );
}

const BubbleSep = forwardRef<HTMLSpanElement>(function BubbleSep(_, ref) {
  return <span ref={ref} className="mx-0.5 h-5 w-px bg-foreground/15" aria-hidden />;
});

export const ChapterEditor = memo(ChapterEditorInner, (prev, next) => (
  prev.chapter.id === next.chapter.id &&
  prev.chapter.theme === next.chapter.theme &&
  prev.chapter.active_draft_id === next.chapter.active_draft_id &&
  prev.readOnly === next.readOnly &&
  prev.themeClass === next.themeClass &&
  prev.fontId === next.fontId &&
  prev.fontSizeId === next.fontSizeId &&
  prev.reviewHighlights === next.reviewHighlights &&
  prev.onCreateReviewHighlight === next.onCreateReviewHighlight &&
  prev.onActiveDraftChange === next.onActiveDraftChange &&
  prev.onEditorReady === next.onEditorReady
));
