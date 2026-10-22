import { useState, useRef, useEffect } from 'react';
import { Palette, Trash, Check, Copy } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getThemeById, getFontById, getFontSizeById } from '@/lib/notepad-themes';
import { Markdown } from '@/components/Markdown';
import { ThemeModal } from '@/components/notepad/ThemeModal';
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

export interface PublicNotepad {
  id: string;
  title: string;
  content: string;
  theme: string;
  font: string;
  font_size: string;
  col_index: number;
  row_index: number;
  height: number;
}

interface DragHandleProps {
  ref?: React.Ref<HTMLDivElement>;
  [key: string]: any;
}

interface PublicNotepadCardProps {
  notepad: PublicNotepad;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<PublicNotepad>) => void;
  onDelete: () => void;
  dragHandleProps?: DragHandleProps;
  isDragging?: boolean;
}

export function PublicNotepadCard({
  notepad,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  dragHandleProps,
  isDragging = false,
}: PublicNotepadCardProps) {
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [localTitle, setLocalTitle] = useState(notepad.title);
  const [localContent, setLocalContent] = useState(notepad.content);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const contentDisplayRef = useRef<HTMLDivElement>(null);

  const theme = getThemeById(notepad.theme);
  const font = getFontById(notepad.font);
  const fontSize = getFontSizeById(notepad.font_size || 'medium');
  const darkThemes = ['midnight', 'charcoal', 'navy', 'forest', 'plum', 'slate', 'obsidian', 'mocha'];
  const isDarkTheme = darkThemes.includes(notepad.theme);

  useEffect(() => {
    setLocalTitle(notepad.title);
    setLocalContent(notepad.content);
  }, [notepad.title, notepad.content]);

  useEffect(() => {
    if (isFocused && contentRef.current) {
      contentRef.current.focus();
    }
  }, [isFocused]);

  const handleBlur = () => {
    if (localTitle !== notepad.title || localContent !== notepad.content) {
      onUpdate({ title: localTitle, content: localContent });
    }
    onBlur();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (!isFocused) {
      e.preventDefault();
      onFocus();
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
      if (isFocused) {
        handleBlur();
      }
    }
  };

  useEffect(() => {
    if (isFocused) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFocused, localTitle, localContent]);

  const handleCopyContent = async () => {
    if (!contentDisplayRef.current) return;
    
    try {
      const htmlContent = contentDisplayRef.current.innerHTML;
      const textContent = contentDisplayRef.current.innerText;
      
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([textContent], { type: 'text/plain' }),
      });
      
      await navigator.clipboard.write([clipboardItem]);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      const textContent = contentDisplayRef.current.innerText;
      await navigator.clipboard.writeText(textContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = localContent.substring(start, end);

    if (e.key === 'b') {
      e.preventDefault();
      const before = localContent.substring(0, start);
      const after = localContent.substring(end);
      const newContent = `${before}**${selectedText}**${after}`;
      setLocalContent(newContent);
      setTimeout(() => {
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = end + 2;
      }, 0);
    }

    if (e.key === 'i') {
      e.preventDefault();
      const before = localContent.substring(0, start);
      const after = localContent.substring(end);
      const newContent = `${before}*${selectedText}*${after}`;
      setLocalContent(newContent);
      setTimeout(() => {
        textarea.selectionStart = start + 1;
        textarea.selectionEnd = end + 1;
      }, 0);
    }

    if (e.key === 'v' && selectedText) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        const urlPattern = /^(https?:\/\/|www\.)/i;
        if (clipboardText && urlPattern.test(clipboardText.trim())) {
          e.preventDefault();
          const before = localContent.substring(0, start);
          const after = localContent.substring(end);
          const newContent = `${before}[${selectedText}](${clipboardText.trim()})${after}`;
          setLocalContent(newContent);
          setTimeout(() => {
            const newEnd = start + selectedText.length + clipboardText.trim().length + 4;
            textarea.selectionStart = newEnd;
            textarea.selectionEnd = newEnd;
          }, 0);
        }
      } catch {
        // Clipboard access denied
      }
    }
  };

  return (
    <>
      <div
        ref={cardRef}
        onClick={handleCardClick}
        className={cn(
          'h-full flex flex-col rounded-t-lg rounded-b-lg border-2 notepad-transition',
          theme.className,
          font.className,
          fontSize.className,
          isFocused
            ? 'border-notepad-border-focus shadow-focus'
            : 'border-notepad-border hover:border-notepad-border-focus/50 cursor-pointer'
        )}
        style={{
          backgroundColor: `hsl(var(--notepad-bg))`,
          color: `hsl(var(--notepad-fg))`,
        }}
      >
        {/* Header */}
        <div 
          ref={dragHandleProps?.ref}
          {...(dragHandleProps ? dragHandleProps : {})}
          className={cn(
            "relative flex items-center justify-between px-3 py-2 touch-none",
            dragHandleProps && (isDragging ? "cursor-grabbing" : "cursor-grab")
          )}
          style={{
            backgroundColor: isDarkTheme ? `hsl(0 0% 0% / 0.15)` : `hsl(0 0% 0% / 0.05)`,
            borderBottom: `1px solid hsl(var(--notepad-fg) / 0.1)`,
            borderRadius: '0.375rem 0.375rem 0 0',
          }}
          onMouseEnter={() => setIsHeaderHovered(true)}
          onMouseLeave={() => setIsHeaderHovered(false)}
        >
          {isFocused ? (
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="flex-1 bg-transparent font-bold focus:outline-none"
              style={{ fontFamily: "'Boulder Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
              placeholder="Untitled"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <h3 className="font-bold truncate flex-1" style={{ fontFamily: "'Boulder Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}>{notepad.title}</h3>
          )}

          {/* Copy button */}
          {!isFocused && (
            <div
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 flex items-center transition-opacity duration-150",
                isHeaderHovered || copySuccess ? "opacity-100" : "opacity-0"
              )}
            >
              <Tooltip open={copySuccess ? true : undefined}>
                <TooltipTrigger asChild>
                  <button
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
                    <Copy weight="duotone" className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent 
                  side="bottom" 
                  align="end"
                  className={cn(copySuccess && "!bg-emerald-600 !text-white !border-emerald-600")}
                >
                  {copySuccess ? "Copied!" : "Copy content"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          <div className={cn("flex items-center gap-1 ml-2", !isFocused && "invisible")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowThemeModal(true);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-black/10"
                  )}
                >
                  <Palette weight="duotone" className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">Change Theme</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors text-destructive",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-destructive/10"
                  )}
                >
                  <Trash weight="duotone" className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">Delete notepad</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBlur();
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isDarkTheme ? "hover:bg-white/15" : "hover:bg-black/10"
                  )}
                >
                  <Check weight="duotone" className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">Done editing</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Content */}
        <div 
          className={cn(
            "flex-1",
            isFocused 
              ? "overflow-hidden" 
              : "overflow-auto scrollbar-hidden hover:scrollbar-auto"
          )}
        >
          {isFocused ? (
            <textarea
              ref={contentRef}
              value={localContent}
              onChange={(e) => setLocalContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-full bg-transparent resize-none focus:outline-none leading-relaxed overflow-auto px-4 py-3"
              placeholder="Start writing in markdown..."
            />
          ) : (
          <div ref={contentDisplayRef} className="notepad-content prose-sm px-4 py-3">
              {localContent ? (
                <Markdown
                  variant="notebook"
                  content={localContent}
                  onContentChange={(newContent) => {
                    setLocalContent(newContent);
                    onUpdate({ content: newContent });
                  }}
                />
              ) : (
                <p className="italic opacity-40">Click to edit...</p>
              )}
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
        onThemeChange={(themeId) => onUpdate({ theme: themeId })}
        onFontChange={(fontId) => onUpdate({ font: fontId })}
        onFontSizeChange={(fontSizeId) => onUpdate({ font_size: fontSizeId })}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete notepad?</AlertDialogTitle>
            <AlertDialogDescription>
              This notepad will be removed. Refresh the page to restore all default content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
