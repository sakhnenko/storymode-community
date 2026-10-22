import { useState, useRef, useEffect, useCallback } from 'react';
import { Copy, ScanDocument, Theme, Trash, X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getThemeById, getFontById, getFontSizeById } from '@/lib/notepad-themes';
import { Markdown } from '@/components/Markdown';
import { WysiwygEditor, type WysiwygEditorHandle } from './WysiwygEditor';
import { ThemeModal } from './ThemeModal';
import { ScanDocumentModal } from './ScanDocumentModal';
import { HistoryButton } from '@/components/HistoryButton';
import { useUserPlan } from '@/hooks/useUserPlan';
import { Notepad } from '@/hooks/useNotepads';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { pendingSaveKey, pendingSaves } from '@/lib/pending-saves';

interface DragHandleProps {
  ref?: React.Ref<HTMLDivElement>;
  [key: string]: any;
}

interface NotepadCardProps {
  notepad: Notepad;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate?: (updates: Partial<Notepad>) => boolean | void | Promise<boolean | void>;
  onDelete?: () => void;
  onCreateNotepad?: (content: string) => void;
  dragHandleProps?: DragHandleProps;
  isDragging?: boolean;
  isReadOnly?: boolean;
  onClose?: () => void;
  /** When true (floating overlays in Timeline/Map), hide scan, history and delete actions. */
  compact?: boolean;
}

type SaveState = 'idle' | 'failed' | 'recovered';

interface StoredNotepadDraft {
  title: string;
  content: string;
  serverUpdatedAt: string;
  savedAt: number;
}

const draftStorageKey = (notepadId: string) => `storymode:notepad-draft:${notepadId}`;

function storeNotepadDraft(notepadId: string, title: string, content: string, serverUpdatedAt: string) {
  try {
    const draft: StoredNotepadDraft = { title, content, serverUpdatedAt, savedAt: Date.now() };
    localStorage.setItem(draftStorageKey(notepadId), JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in private browsing. Autosave still works.
  }
}

function readNotepadDraft(notepadId: string): StoredNotepadDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(notepadId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredNotepadDraft>;
    if (typeof value.title !== 'string' || typeof value.content !== 'string') return null;
    return {
      title: value.title,
      content: value.content,
      serverUpdatedAt: typeof value.serverUpdatedAt === 'string' ? value.serverUpdatedAt : '',
      savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function clearNotepadDraft(notepadId: string) {
  try {
    localStorage.removeItem(draftStorageKey(notepadId));
  } catch {
    // Nothing else to do when storage is unavailable.
  }
}

export function NotepadCard({
  notepad,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onCreateNotepad,
  dragHandleProps,
  isDragging = false,
  isReadOnly = false,
  onClose,
  compact = false,
}: NotepadCardProps) {
  const { t } = useTranslation();
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { hasAi } = useUserPlan();
  const [localTitle, setLocalTitle] = useState(notepad.title);
  const [localContent, setLocalContent] = useState(notepad.content);
  const localTitleRef = useRef(notepad.title);
  const localContentRef = useRef(notepad.content);
  const savedTitleRef = useRef(notepad.title);
  const savedContentRef = useRef(notepad.content);
  const dirtyRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  const isReadOnlyRef = useRef(isReadOnly);
  const notepadIdRef = useRef(notepad.id);
  const serverUpdatedAtRef = useRef(notepad.updated_at);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const saveAgainRef = useRef(false);
  const recoveredDraftIdRef = useRef<string | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const editorRef = useRef<WysiwygEditorHandle>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const contentDisplayRef = useRef<HTMLDivElement>(null);
  const showHeaderActions = isFocused || isHeaderHovered || copySuccess;

  const theme = getThemeById(notepad.theme);
  const font = getFontById(notepad.font);
  const fontSize = getFontSizeById(notepad.font_size || 'medium');
  const darkThemes = ['midnight', 'charcoal', 'navy', 'forest', 'plum', 'slate', 'obsidian', 'mocha'];
  const isDarkTheme = darkThemes.includes(notepad.theme);

  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { isReadOnlyRef.current = isReadOnly; }, [isReadOnly]);
  useEffect(() => {
    notepadIdRef.current = notepad.id;
    serverUpdatedAtRef.current = notepad.updated_at;
  }, [notepad.id, notepad.updated_at]);

  // Recover text written before an immediate refresh/tab close. If the server
  // already contains the same values, the leftover local copy is obsolete.
  useEffect(() => {
    if (isReadOnly || recoveredDraftIdRef.current === notepad.id) return;
    recoveredDraftIdRef.current = notepad.id;
    const draft = readNotepadDraft(notepad.id);
    if (!draft) return;
    if (draft.title === notepad.title && draft.content === notepad.content) {
      clearNotepadDraft(notepad.id);
      return;
    }
    localTitleRef.current = draft.title;
    localContentRef.current = draft.content;
    dirtyRef.current = true;
    setLocalTitle(draft.title);
    setLocalContent(draft.content);
    setSaveState('recovered');
    pendingSaves.upsert(pendingSaveKey('notepad', notepad.id), () => flushRef.current());
  }, [isReadOnly, notepad.id, notepad.title, notepad.content]);

  useEffect(() => {
    if (!dirtyRef.current) {
      savedTitleRef.current = notepad.title;
      savedContentRef.current = notepad.content;
      localTitleRef.current = notepad.title;
      localContentRef.current = notepad.content;
      setLocalTitle(notepad.title);
      setLocalContent(notepad.content);
    }
  }, [notepad.title, notepad.content]);

  // Writing the whole note to browser storage on every keystroke gets slow in
  // long notes, so debounce it until typing pauses. Teardown handlers below
  // still write the latest text synchronously.
  const draftWriteTimerRef = useRef<number | null>(null);
  const cancelScheduledDraftWrite = useCallback(() => {
    if (draftWriteTimerRef.current !== null) {
      window.clearTimeout(draftWriteTimerRef.current);
      draftWriteTimerRef.current = null;
    }
  }, []);
  const scheduleDraftWrite = useCallback(() => {
    cancelScheduledDraftWrite();
    draftWriteTimerRef.current = window.setTimeout(() => {
      draftWriteTimerRef.current = null;
      if (!dirtyRef.current) return;
      storeNotepadDraft(notepadIdRef.current, localTitleRef.current, localContentRef.current, serverUpdatedAtRef.current);
    }, 3000);
  }, [cancelScheduledDraftWrite]);
  useEffect(() => cancelScheduledDraftWrite, [cancelScheduledDraftWrite]);

  const setDraftTitle = useCallback((title: string) => {
    localTitleRef.current = title;
    dirtyRef.current = title !== savedTitleRef.current || localContentRef.current !== savedContentRef.current;
    if (dirtyRef.current) {
      scheduleDraftWrite();
      pendingSaves.upsert(pendingSaveKey('notepad', notepadIdRef.current), () => flushRef.current());
    } else {
      cancelScheduledDraftWrite();
      clearNotepadDraft(notepadIdRef.current);
      pendingSaves.clear(pendingSaveKey('notepad', notepadIdRef.current));
      setSaveState('idle');
    }
    setLocalTitle(title);
  }, [scheduleDraftWrite, cancelScheduledDraftWrite]);

  const setDraftContent = useCallback((content: string) => {
    localContentRef.current = content;
    dirtyRef.current = localTitleRef.current !== savedTitleRef.current || content !== savedContentRef.current;
    if (dirtyRef.current) {
      scheduleDraftWrite();
      pendingSaves.upsert(pendingSaveKey('notepad', notepadIdRef.current), () => flushRef.current());
    } else {
      cancelScheduledDraftWrite();
      clearNotepadDraft(notepadIdRef.current);
      pendingSaves.clear(pendingSaveKey('notepad', notepadIdRef.current));
      setSaveState('idle');
    }
    setLocalContent(content);
  }, [scheduleDraftWrite, cancelScheduledDraftWrite]);

  const flushPendingChanges = useCallback((): Promise<boolean> => {
    const update = onUpdateRef.current;
    if (!dirtyRef.current) {
      pendingSaves.clear(pendingSaveKey('notepad', notepadIdRef.current));
      return Promise.resolve(true);
    }
    if (isReadOnlyRef.current || !update) return Promise.resolve(false);
    if (savePromiseRef.current) {
      saveAgainRef.current = true;
      return savePromiseRef.current;
    }

    const title = localTitleRef.current;
    const content = localContentRef.current;
    const request = Promise.resolve()
      .then(() => update({ title, content }))
      .then((result) => {
        if (result === false) {
          dirtyRef.current = true;
          storeNotepadDraft(notepadIdRef.current, localTitleRef.current, localContentRef.current, serverUpdatedAtRef.current);
          pendingSaves.upsert(pendingSaveKey('notepad', notepadIdRef.current), () => flushRef.current());
          pendingSaves.reportFailure();
          setSaveState('failed');
          return false;
        }

        savedTitleRef.current = title;
        savedContentRef.current = content;
        const hasNewerChanges = localTitleRef.current !== title || localContentRef.current !== content;
        dirtyRef.current = hasNewerChanges;
        if (hasNewerChanges) {
          storeNotepadDraft(notepadIdRef.current, localTitleRef.current, localContentRef.current, serverUpdatedAtRef.current);
          pendingSaves.upsert(pendingSaveKey('notepad', notepadIdRef.current), () => flushRef.current());
        } else {
          clearNotepadDraft(notepadIdRef.current);
          pendingSaves.clear(pendingSaveKey('notepad', notepadIdRef.current));
        }
        setSaveState('idle');
        return true;
      })
      .catch(() => {
        dirtyRef.current = true;
        storeNotepadDraft(notepadIdRef.current, localTitleRef.current, localContentRef.current, serverUpdatedAtRef.current);
        pendingSaves.upsert(pendingSaveKey('notepad', notepadIdRef.current), () => flushRef.current());
        pendingSaves.reportFailure();
        setSaveState('failed');
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
  }, []);
  flushRef.current = flushPendingChanges;

  // Auto-save shortly after typing stops. The refs let unmount/drag cleanup
  // flush the newest editor value even before React has rendered it again.
  useEffect(() => {
    if (!isFocused || isReadOnly || !onUpdate || !dirtyRef.current) return;
    const timeout = window.setTimeout(flushPendingChanges, 1500);
    return () => window.clearTimeout(timeout);
  }, [isFocused, isReadOnly, onUpdate, localTitle, localContent, flushPendingChanges]);

  // Dragging can replace the card with a placeholder. Navigating can also
  // unmount it, so always make one final attempt to persist pending text.
  useEffect(() => () => { void flushPendingChanges(); }, [flushPendingChanges]);

  // An async request cannot be relied on during page teardown, so preserve the
  // latest values synchronously and let the browser warn about pending work.
  useEffect(() => {
    const preserveDraft = () => {
      if (!dirtyRef.current) return;
      storeNotepadDraft(notepadIdRef.current, localTitleRef.current, localContentRef.current, serverUpdatedAtRef.current);
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
  }, []);

  const handleBlur = useCallback(() => {
    flushPendingChanges();
    onBlur();
  }, [flushPendingChanges, onBlur]);

  const handleCardClick = () => {
    // Focus controls the active styling/actions, not whether the editor exists.
    if (isReadOnly) return;
    if (!isFocused) {
      onFocus();
    }
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    // Ignore clicks on the floating WYSIWYG bubble menu (rendered outside the card via a portal).
    if (target && target.closest?.('[data-wysiwyg-bubble="true"]')) return;
    if (cardRef.current && !cardRef.current.contains(target as Node)) {
      if (isFocused) {
        handleBlur();
      }
    }
  }, [handleBlur, isFocused]);

  useEffect(() => {
    if (isFocused) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFocused, handleClickOutside]);

  // Scan action handlers
  const handleScanReplace = (text: string) => {
    setDraftContent(text);
    flushPendingChanges();
  };

  const handleScanAddToBeginning = (text: string) => {
    const newContent = text + '\n\n' + localContent;
    setDraftContent(newContent);
    flushPendingChanges();
  };

  const handleScanAddToEnd = (text: string) => {
    const newContent = localContent + '\n\n' + text;
    setDraftContent(newContent);
    flushPendingChanges();
  };

  const handleScanAddToNewNotebook = (text: string) => {
    if (onCreateNotepad) {
      onCreateNotepad(text);
    }
  };

  const handleCopyContent = async () => {
    const editor = editorRef.current?.editor;
    const htmlContent = editor?.getHTML() ?? contentDisplayRef.current?.innerHTML ?? '';
    const textContent = editor?.getText() ?? contentDisplayRef.current?.innerText ?? localContentRef.current;

    try {
      // Create clipboard data with both HTML and plain text
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([textContent], { type: 'text/plain' }),
      });
      
      await navigator.clipboard.write([clipboardItem]);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback to plain text copy
      await navigator.clipboard.writeText(textContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Note: bold/italic/list shortcuts are handled natively by Tiptap StarterKit.

  return (
    <>
      <div
        ref={cardRef}
        onClick={handleCardClick}
        onMouseEnter={() => setIsHeaderHovered(true)}
        onMouseLeave={() => setIsHeaderHovered(false)}
        className={cn(
          'h-full flex flex-col rounded-md border-2 notepad-transition',
          theme.className,
          font.className,
          fontSize.className,
          isFocused
            ? 'border-notepad-border-focus shadow-focus'
            : cn(
                'border-notepad-border',
                !isReadOnly && 'hover:border-notepad-border-focus/50 cursor-pointer'
              )
        )}
        style={{
          backgroundColor: `hsl(var(--notepad-bg))`,
          color: `hsl(var(--notepad-fg))`,
        }}
      >
        {/* Header - entire header is draggable */}
        <div 
          ref={dragHandleProps?.ref}
          {...(dragHandleProps ? dragHandleProps : {})}
          onPointerDown={dragHandleProps ? (e) => {
            flushPendingChanges();
            dragHandleProps.onPointerDown?.(e);
          } : undefined}
          className={cn(
            "relative flex items-center justify-between gap-0 px-3 py-2 min-h-[44px] touch-none",
            dragHandleProps && (isDragging ? "cursor-grabbing" : "cursor-grab")
          )}
          style={{
            backgroundColor: isDarkTheme ? `hsl(0 0% 0% / 0.15)` : `hsl(0 0% 0% / 0.05)`,
            borderBottom: `1px solid hsl(var(--notepad-fg) / 0.1)`,
            borderRadius: '0.375rem 0.375rem 0 0',
          }}
        >
          {!isReadOnly ? (
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onFocus={() => { if (!isFocused) onFocus(); }}
              className="flex-1 min-w-0 bg-transparent font-bold text-sm leading-tight focus:outline-none"
              style={{ fontFamily: "'Boulder Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <h3
              className="font-bold truncate flex-1 min-w-0 text-sm leading-tight"
              style={{ fontFamily: "'Boulder Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >{notepad.title}</h3>
          )}

          {(saveState === 'failed' || saveState === 'recovered') && (
            <span
              className="shrink-0 px-1.5 text-[10px] font-medium opacity-50"
              aria-live="polite"
            >
              {t('notepad.card.notSaved')}
            </span>
          )}

          {/* Notebook actions fade in on hover and stay visible while focused. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 overflow-hidden transition-[opacity,max-width,margin] duration-150",
              showHeaderActions
                ? "ml-2 max-w-[12rem] overflow-visible opacity-100"
                : "pointer-events-none ml-0 max-w-0 opacity-0"
            )}
          >
            {hasAi && !compact && !isReadOnly && <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('notepad.card.scanDocument')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowScanModal(true);
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-black/10"
                  )}
                >
                  <ScanDocument size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">{t('notepad.card.scanDocument')}</TooltipContent>
            </Tooltip>}
            {!isReadOnly && <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('notepad.card.changeTheme')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowThemeModal(true);
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-black/10"
                  )}
                >
                  <Theme size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">{t('notepad.card.changeTheme')}</TooltipContent>
            </Tooltip>}
            {!isReadOnly && !compact && (
              <HistoryButton
                entityType="notepad"
                entityId={notepad.id}
                className={cn(isDarkTheme ? 'hover:bg-white/15' : 'hover:bg-black/10')}
                iconClassName="w-[15px] h-[15px]"
                onRestore={(snap) => {
                  setDraftContent(snap.content);
                  editorRef.current?.editor?.commands.setContent(snap.content);
                  flushPendingChanges();
                }}
              />
            )}
            {!compact && <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('notepad.card.deleteNotepad')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors text-destructive",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-destructive/10"
                  )}
                >
                  <Trash size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">{t('notepad.card.deleteNotepad')}</TooltipContent>
            </Tooltip>}
            <Tooltip open={copySuccess ? true : undefined}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={copySuccess ? t('notepad.card.copied') : t('notepad.card.copyContent')}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyContent();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-black/10"
                  )}
                >
                  <Copy size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                className={cn(copySuccess && "!bg-emerald-600 !text-white !border-emerald-600")}
              >
                {copySuccess ? t('notepad.card.copied') : t('notepad.card.copyContent')}
              </TooltipContent>
            </Tooltip>
            {onClose && (
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  isDarkTheme ? "hover:bg-white/15" : "hover:bg-black/10"
                )}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div 
          className={cn(
            "flex-1",
            isReadOnly
              ? "overflow-auto scrollbar-hidden hover:scrollbar-auto"
              : "overflow-hidden"
          )}
        >
          {!isReadOnly ? (
            <div
              className="notepad-content prose-sm w-full h-full overflow-auto px-4 py-3 cursor-text"
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (e.target === e.currentTarget || !target.closest('.ProseMirror')) {
                  e.preventDefault();
                  editorRef.current?.focusAtEnd();
                }
              }}
            >
              <WysiwygEditor
                ref={editorRef}
                value={localContent}
                onChange={setDraftContent}
                onFocus={() => { if (!isFocused) onFocus(); }}
                className="min-h-full"
                placeholder={t('notepad.card.startWriting')}
                autoFocus={isFocused}
              />
            </div>
          ) : (
          <div ref={contentDisplayRef} className="notepad-content prose-sm px-4 py-3">
            <div className="contents">
              {localContent ? (
                <Markdown
                  variant="notebook"
                  content={localContent}
                  onContentChange={(newContent) => {
                    setDraftContent(newContent);
                    flushPendingChanges();
                  }}
                  readOnly={isReadOnly}
                />
              ) : (
                <p className="italic opacity-40">{t('notepad.card.empty')}</p>
              )}
            </div>
            </div>
          )}
        </div>
      </div>

      <ThemeModal
        open={showThemeModal}
        onOpenChange={setShowThemeModal}
        currentTheme={notepad.theme}
        currentFont={notepad.font}
        currentFontSize={notepad.font_size || 'medium'}
        onThemeChange={(themeId) => onUpdate?.({ theme: themeId })}
        onFontChange={(fontId) => onUpdate?.({ font: fontId })}
        onFontSizeChange={(fontSizeId) => onUpdate?.({ font_size: fontSizeId })}
      />

      <ScanDocumentModal
        open={showScanModal}
        onOpenChange={setShowScanModal}
        notepadTheme={notepad.theme}
        notepadFont={notepad.font}
        notepadFontSize={notepad.font_size || 'medium'}
        onReplace={handleScanReplace}
        onAddToBeginning={handleScanAddToBeginning}
        onAddToEnd={handleScanAddToEnd}
        onAddToNewNotebook={handleScanAddToNewNotebook}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notepad.card.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('notepad.card.deleteDialog.description', { title: notepad.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('notepad.card.deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearNotepadDraft(notepad.id);
                pendingSaves.clear(pendingSaveKey('notepad', notepad.id));
                onDelete?.();
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('notepad.card.deleteDialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
