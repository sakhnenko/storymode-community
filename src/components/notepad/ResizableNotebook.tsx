import { useState, useRef, useCallback, forwardRef } from 'react';

import { NotepadCard } from './NotepadCard';
import { Notepad } from '@/hooks/useNotepads';

interface DragHandleProps {
  ref?: React.Ref<HTMLDivElement>;
  [key: string]: any;
}

interface ResizableNotebookProps {
  notepad: Notepad;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate?: (updates: Partial<Notepad>) => boolean | void | Promise<boolean | void>;
  onDelete?: () => void;
  onCreateNotepad?: (content: string) => void;
  minHeight?: number;
  dragHandleProps?: DragHandleProps;
  isDragging?: boolean;
  isReadOnly?: boolean;
}

export function ResizableNotebook({
  notepad,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onCreateNotepad,
  minHeight = 100,
  dragHandleProps,
  isDragging = false,
  isReadOnly = false,
}: ResizableNotebookProps) {
  const [height, setHeight] = useState(notepad.height || 200);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const finalHeightRef = useRef(height);

  const darkThemes = ['midnight', 'charcoal', 'navy', 'forest', 'plum', 'slate', 'obsidian', 'mocha'];
  const isDarkTheme = darkThemes.includes(notepad.theme);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    // Find the scrollable parent container with data-scroll-container attribute
    const findScrollableParent = (element: HTMLElement | null): HTMLElement | null => {
      if (!element) return null;
      if (element.hasAttribute('data-scroll-container')) {
        return element;
      }
      return findScrollableParent(element.parentElement);
    };
    
    const scrollableParent = findScrollableParent(containerRef.current);
    let animationFrameId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.max(minHeight, startHeightRef.current + deltaY);
      setHeight(newHeight);
      finalHeightRef.current = newHeight;

      // Auto-scroll when near the bottom of the scrollable container
      if (scrollableParent) {
        const rect = scrollableParent.getBoundingClientRect();
        const distanceFromBottom = rect.bottom - e.clientY;
        const scrollThreshold = 80;
        
        // Cancel any pending animation frame
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        
        if (distanceFromBottom < scrollThreshold && distanceFromBottom > -50) {
          const scrollSpeed = Math.max(3, (scrollThreshold - distanceFromBottom) / 2);
          
          const doScroll = () => {
            scrollableParent.scrollTop += scrollSpeed;
            animationFrameId = requestAnimationFrame(doScroll);
          };
          animationFrameId = requestAnimationFrame(doScroll);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Save the height to the database
      if (finalHeightRef.current !== notepad.height && onUpdate) {
        onUpdate({ height: finalHeightRef.current });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, minHeight, notepad.height, onUpdate]);

  return (
    <div
      ref={containerRef}
      className="relative p-1"
      style={{ height: `${height}px` }}
    >
      <NotepadCard
        notepad={notepad}
        isFocused={isFocused}
        onFocus={onFocus}
        onBlur={onBlur}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCreateNotepad={onCreateNotepad}
        dragHandleProps={dragHandleProps}
        isDragging={isDragging}
        isReadOnly={isReadOnly}
      />
      
      {/* Resize Handle - hidden in read-only mode */}
      {!isReadOnly && (
        <div
          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 hover:opacity-100 transition-opacity"
          onMouseDown={handleMouseDown}
        >
          <div 
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-t-full rounded-b-none" 
            style={{ backgroundColor: isDarkTheme ? 'hsl(0 0% 100% / 0.35)' : 'hsl(var(--notepad-fg) / 0.25)' }} 
          />
        </div>
      )}
    </div>
  );
}
