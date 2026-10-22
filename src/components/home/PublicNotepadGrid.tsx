import { useState, useMemo, useRef, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { PublicNotepadCard, PublicNotepad } from './PublicNotepadCard';
import { Plus, Trash } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

// Sortable wrapper for public notepads with auto-height that switches to fixed on resize
function SortablePublicNotebook({
  notepad,
  isFocused,
  onFocus,
  onBlur,
  onUpdate,
  onDelete,
}: {
  notepad: PublicNotepad;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<PublicNotepad>) => void;
  onDelete: () => void;
}) {
  // null means auto-height (when height is 0), number means fixed height
  const [fixedHeight, setFixedHeight] = useState<number | null>(
    notepad.height > 0 ? notepad.height : null
  );
  // Track the height when entering edit mode to prevent collapse
  const [editModeHeight, setEditModeHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const darkThemes = ['midnight', 'charcoal', 'navy', 'forest', 'plum', 'slate', 'obsidian', 'mocha'];
  const isDarkTheme = darkThemes.includes(notepad.theme);

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

  // Capture height when entering edit mode
  const handleFocus = useCallback(() => {
    if (containerRef.current && fixedHeight === null) {
      setEditModeHeight(containerRef.current.offsetHeight);
    }
    onFocus();
  }, [onFocus, fixedHeight]);

  // Clear edit mode height when exiting edit mode
  const handleBlur = useCallback(() => {
    setEditModeHeight(null);
    onBlur();
  }, [onBlur]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startYRef.current = e.clientY;
    // Get current height from the container
    const currentHeight = containerRef.current?.offsetHeight || 200;
    startHeightRef.current = currentHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.max(100, startHeightRef.current + deltaY);
      setFixedHeight(newHeight);
      setEditModeHeight(null); // Clear edit mode height once user resizes
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Save the fixed height
      if (containerRef.current) {
        const finalHeight = containerRef.current.offsetHeight;
        onUpdate({ height: finalHeight });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onUpdate]);

  const style = {
    // Prevent the “squeeze” effect when sorting between items of different sizes
    // (dnd-kit can apply scaleX/scaleY during layout transforms)
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition: isDragging ? undefined : transition,
    // Hide the original element while dragging; the DragOverlay will render the floating preview.
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  // Determine the height to use: fixedHeight takes priority, then editModeHeight for stability
  const containerHeight = fixedHeight !== null 
    ? fixedHeight 
    : editModeHeight !== null 
      ? editModeHeight 
      : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      data-notepad-id={notepad.id}
    >
      {isOver && !isDragging && (
        <div className="absolute -top-1.5 left-0 right-0 z-50 pointer-events-none">
          <div className="h-2 bg-primary/40 rounded-full mx-1" />
        </div>
      )}
      {/* Auto-height or fixed height container */}
      <div 
        ref={containerRef} 
        className="relative p-1" 
        style={containerHeight !== undefined ? { height: `${containerHeight}px` } : undefined}
      >
        <PublicNotepadCard
          notepad={notepad}
          isFocused={isFocused}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onUpdate={onUpdate}
          onDelete={onDelete}
          dragHandleProps={{
            ref: setActivatorNodeRef,
            ...attributes,
            ...listeners,
          }}
          isDragging={isDragging}
        />
        {/* Resize Handle */}
        <div
          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 hover:opacity-100 transition-opacity"
          onMouseDown={handleMouseDown}
        >
          <div 
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-t-full rounded-b-none" 
            style={{ backgroundColor: isDarkTheme ? 'hsl(0 0% 100% / 0.35)' : 'hsl(var(--notepad-fg) / 0.25)' }} 
          />
        </div>
      </div>
    </div>
  );
}

function ColumnEndDropZone({ colIndex }: { colIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-end-${colIndex}`,
    data: {
      type: 'column-end',
      colIndex,
    },
  });

  return (
    <div ref={setNodeRef} className="relative h-10">
      {isOver && (
        <div className="absolute inset-x-1 top-1/2 -translate-y-1/2">
          <div className="h-2 bg-primary/40 rounded-full" />
        </div>
      )}
    </div>
  );
}

interface PublicNotepadGridProps {
  initialNotepads: PublicNotepad[];
}

export function PublicNotepadGrid({ initialNotepads }: PublicNotepadGridProps) {
  const [notepads, setNotepads] = useState<PublicNotepad[]>(initialNotepads);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<number | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<number | null>(null);
  const [deletingNotepadId, setDeletingNotepadId] = useState<string | null>(null);
  const [activeNotepad, setActiveNotepad] = useState<PublicNotepad | null>(null);
  const [draggedDimensions, setDraggedDimensions] = useState<{ width: number; height: number } | null>(null);

  // Organize notepads into columns
  const columns = useMemo(() => {
    const colMap = new Map<number, PublicNotepad[]>();

    notepads.forEach((notepad) => {
      const col = notepad.col_index;
      if (!colMap.has(col)) {
        colMap.set(col, []);
      }
      colMap.get(col)!.push(notepad);
    });

    colMap.forEach((pads) => {
      pads.sort((a, b) => a.row_index - b.row_index);
    });

    return Array.from(colMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([colIndex, pads]) => ({ colIndex, notepads: pads }));
  }, [notepads]);

  const handleAddColumn = () => {
    const newColIndex = columns.length > 0 ? Math.max(...columns.map((c) => c.colIndex)) + 1 : 0;
    const newNotepad: PublicNotepad = {
      id: `new-${Date.now()}`,
      title: 'New Notepad',
      content: 'Start writing...',
      theme: 'default',
      font: 'system',
      font_size: 'medium',
      col_index: newColIndex,
      row_index: 0,
      height: 200,
    };
    setNotepads([...notepads, newNotepad]);
  };

  const handleAddRow = (colIndex: number) => {
    const col = columns.find((c) => c.colIndex === colIndex);
    const newRowIndex = col ? Math.max(...col.notepads.map((n) => n.row_index)) + 1 : 0;
    const newNotepad: PublicNotepad = {
      id: `new-${Date.now()}`,
      title: 'New Notepad',
      content: 'Start writing...',
      theme: 'default',
      font: 'system',
      font_size: 'medium',
      col_index: colIndex,
      row_index: newRowIndex,
      height: 200,
    };
    setNotepads([...notepads, newNotepad]);
  };

  const handleUpdateNotepad = (id: string, updates: Partial<PublicNotepad>) => {
    setNotepads((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  };

  const handleDeleteNotepad = (id: string) => {
    setDeletingNotepadId(id);
    setTimeout(() => {
      setNotepads((prev) => prev.filter((n) => n.id !== id));
      setDeletingNotepadId(null);
    }, 300);
  };

  const handleDeleteColumn = (colIndex: number) => {
    setDeletingColumn(colIndex);
    setColumnToDelete(null);
    setTimeout(() => {
      setNotepads((prev) => prev.filter((n) => n.col_index !== colIndex));
      setDeletingColumn(null);
    }, 300);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const notepad = notepads.find((n) => n.id === event.active.id);
    setActiveNotepad(notepad || null);

    // Capture dimensions so the overlay keeps the original size when dragging between columns.
    const activeElement = document.querySelector(`[data-notepad-id="${event.active.id}"]`);
    if (activeElement) {
      const rect = activeElement.getBoundingClientRect();
      setDraggedDimensions({ width: rect.width, height: rect.height });
    } else {
      setDraggedDimensions(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNotepad(null);
    setDraggedDimensions(null);

    if (!over || active.id === over.id) return;

    const activeNotepad = notepads.find((n) => n.id === active.id);
    const overNotepad = notepads.find((n) => n.id === over.id);
    const overData = over.data.current as { type?: string; colIndex?: number } | undefined;
    const isColumnEnd = overData?.type === 'column-end' && typeof overData.colIndex === 'number';

    if (!activeNotepad) return;
    if (!overNotepad && !isColumnEnd) return;

    const sourceColIndex = activeNotepad.col_index;
    const targetColIndex = isColumnEnd ? (overData!.colIndex as number) : overNotepad!.col_index;
    const isSameColumn = sourceColIndex === targetColIndex;
    
    const updates: { id: string; col_index: number; row_index: number }[] = [];

    const targetColumnNotepads = notepads
      .filter((n) => n.col_index === targetColIndex && n.id !== active.id)
      .sort((a, b) => a.row_index - b.row_index);

    const overIndex = targetColumnNotepads.findIndex((n) => n.id === over.id);
    const insertIndex = isColumnEnd ? targetColumnNotepads.length : (overIndex === -1 ? targetColumnNotepads.length : overIndex);
    
    targetColumnNotepads.splice(insertIndex, 0, activeNotepad);
    
    targetColumnNotepads.forEach((n, index) => {
      updates.push({
        id: n.id,
        col_index: targetColIndex,
        row_index: index,
      });
    });

    if (!isSameColumn) {
      const sourceColumnNotepads = notepads
        .filter((n) => n.col_index === sourceColIndex && n.id !== active.id)
        .sort((a, b) => a.row_index - b.row_index);

      sourceColumnNotepads.forEach((n, index) => {
        updates.push({
          id: n.id,
          col_index: sourceColIndex,
          row_index: index,
        });
      });
    }

    setNotepads((prev) =>
      prev.map((n) => {
        const update = updates.find((u) => u.id === n.id);
        return update ? { ...n, col_index: update.col_index, row_index: update.row_index } : n;
      })
    );
  };

  if (columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No notepads yet</p>
          <Button onClick={handleAddColumn}>
            <Plus weight="duotone" className="w-4 h-4 mr-2" />
            Add First Notebook
          </Button>
        </div>
      </div>
    );
  }

  const getColDefaultSize = (colIdx: number) => {
    return Math.max(20, 100 / columns.length);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div data-scroll-container className="min-h-[500px]">
          <ResizablePanelGroup direction="horizontal" className="!h-auto min-h-[500px]">
            {columns.flatMap((column, colIdx) => {
              const elements: JSX.Element[] = [];

              if (colIdx > 0) {
                elements.push(
                  <ResizableHandle key={`h-handle-${column.colIndex}`} />
                );
              }

              elements.push(
                <ResizablePanel
                  key={`col-${column.colIndex}`}
                  id={`col-${column.colIndex}`}
                  order={colIdx}
                  minSize={15}
                  defaultSize={getColDefaultSize(colIdx)}
                  className={`${
                    deletingColumn === column.colIndex
                      ? 'opacity-0 scale-95 transition-all duration-300'
                      : ''
                  }`}
                >
                  <div className="flex flex-col px-1 py-1 relative">
                    <SortableContext
                      items={column.notepads.map((n) => n.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-1">
                        {column.notepads.map((notepad) => (
                          <div
                            key={notepad.id}
                            className={`transition-all duration-300 ${
                              deletingNotepadId === notepad.id
                                ? 'opacity-0 scale-95 -translate-x-4'
                                : 'opacity-100 scale-100 translate-x-0'
                            }`}
                          >
                            <SortablePublicNotebook
                              notepad={notepad}
                              isFocused={focusedId === notepad.id}
                              onFocus={() => setFocusedId(notepad.id)}
                              onBlur={() => setFocusedId(null)}
                              onUpdate={(updates) => handleUpdateNotepad(notepad.id, updates)}
                              onDelete={() => handleDeleteNotepad(notepad.id)}
                            />
                          </div>
                        ))}

                        {/* Allow dropping below the last card to append to the column */}
                        <ColumnEndDropZone colIndex={column.colIndex} />
                        
                        <div className="py-1">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddRow(column.colIndex)}
                              className="flex-1 text-muted-foreground hover:text-foreground"
                            >
                              <Plus weight="duotone" className="w-4 h-4 mr-1" />
                              Notebook
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setColumnToDelete(column.colIndex)}
                                >
                                  <Trash weight="duotone" className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete column</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </SortableContext>
                  </div>
                </ResizablePanel>
              );

              return elements;
            })}
          </ResizablePanelGroup>
        </div>

        {/* Floating drag preview so the card stays above all columns (not clipped by column overflow) */}
        <DragOverlay dropAnimation={null}>
          {activeNotepad && draggedDimensions ? (
            <div
              className="pointer-events-none shadow-2xl shadow-black/25 rounded-lg"
              style={{ width: draggedDimensions.width, height: draggedDimensions.height }}
            >
              {/* Match the original wrapper padding so the size stays identical */}
              <div className="relative p-1" style={{ height: '100%' }}>
                <PublicNotepadCard
                  notepad={activeNotepad}
                  isFocused={false}
                  onFocus={() => {}}
                  onBlur={() => {}}
                  onUpdate={() => {}}
                  onDelete={() => {}}
                  isDragging={false}
                />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AlertDialog
        open={columnToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setColumnToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete column?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all notepads in this column. Refresh the page to restore default content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (columnToDelete !== null) {
                  handleDeleteColumn(columnToDelete);
                }
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
