import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ResizableNotebook } from './ResizableNotebook';
import { Notepad } from '@/hooks/useNotepads';

interface SortableNotebookProps {
  notepad: Notepad;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate?: (updates: Partial<Notepad>) => boolean | void | Promise<boolean | void>;
  onDelete?: () => void;
  onCreateNotepad?: (content: string) => void;
  minHeight?: number;
  isReadOnly?: boolean;
}

export function SortableNotebook({
  notepad,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
  onCreateNotepad,
  minHeight = 100,
  isReadOnly = false,
}: SortableNotebookProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ 
    id: notepad.id,
    data: {
      notepad,
      colIndex: notepad.col_index,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition: isDragging ? undefined : transition,
    // Hide original when dragging - the DragOverlay shows the floating preview
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  // Get the height for the placeholder (from the notepad's saved height or use minHeight)
  const placeholderHeight = notepad.height > 0 ? notepad.height : minHeight;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      data-notepad-id={notepad.id}
    >
      {/* Drop preview indicator - light blue rectangle showing where item will land */}
      {isOver && !isDragging && (
        <div className="absolute -top-1.5 left-0 right-0 z-50 pointer-events-none">
          <div className="h-2 bg-primary/40 rounded-full mx-1" />
        </div>
      )}
      {/* Show a faint placeholder when this item is being dragged */}
      {isDragging ? (
        <div 
          className="rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30"
          style={{ height: `${placeholderHeight}px`, minHeight: `${minHeight}px` }}
        />
      ) : (
        <ResizableNotebook
          notepad={notepad}
          isFocused={isFocused}
          onFocus={onFocus}
          onBlur={onBlur}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onCreateNotepad={onCreateNotepad}
          minHeight={minHeight}
          dragHandleProps={isReadOnly ? undefined : {
            ref: setActivatorNodeRef,
            ...attributes,
            ...listeners,
          }}
          isDragging={isDragging}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  );
}
