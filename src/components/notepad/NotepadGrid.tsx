import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { SortableNotebook } from './SortableNotebook';
import { ResizableNotebook } from './ResizableNotebook';
import { Notepad, useNotepads } from '@/hooks/useNotepads';
import { Plus, Trash } from '@/components/ui/icons';
import { NewNotebookButton } from './NewNotebookButton';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useTranslation } from 'react-i18next';

/**
 * Dropping here moves a notebook to the end of the column. With children (the
 * new-notebook button) the zone is that row, one notebook gap below the last
 * notebook, and the drop line shows above it; empty, it is a 40 px strip.
 */
function ColumnEndDropZone({ colIndex, children }: { colIndex: number; children?: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-end-${colIndex}`,
    data: { type: 'column-end', colIndex },
  });
  return (
    <div ref={setNodeRef} className={children ? 'relative' : 'relative h-10'}>
      {isOver && (
        <div className={children ? 'pointer-events-none absolute inset-x-1 -top-1.5 z-50' : 'absolute inset-x-1 top-1/2 -translate-y-1/2'}>
          <div className="h-2 bg-primary/40 rounded-full" />
        </div>
      )}
      {children}
    </div>
  );
}

interface NotepadGridProps {
  gridId: string;
  colSizes?: string[];
  onColSizesChange?: (sizes: string[]) => void;
  onAddColumnRef?: (fn: () => void) => void;
  isReadOnly?: boolean;
}

export function NotepadGrid({ gridId, colSizes, onColSizesChange, onAddColumnRef, isReadOnly = false }: NotepadGridProps) {
  const { t } = useTranslation();
  const { notepads, loading, createNotepad, updateNotepad, deleteNotepad, deleteColumn, reorderNotepads } = useNotepads(gridId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<number | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<number | null>(null);
  const [deletingNotepadId, setDeletingNotepadId] = useState<string | null>(null);
  const [activeNotepad, setActiveNotepad] = useState<Notepad | null>(null);
  const [draggedDimensions, setDraggedDimensions] = useState<{ width: number; height: number } | null>(null);

  const columns = useMemo(() => {
    const colMap = new Map<number, Notepad[]>();
    notepads.forEach((notepad) => {
      const col = notepad.col_index;
      if (!colMap.has(col)) colMap.set(col, []);
      colMap.get(col)!.push(notepad);
    });
    colMap.forEach((pads) => pads.sort((a, b) => a.row_index - b.row_index));
    return Array.from(colMap.entries()).sort(([a], [b]) => a - b).map(([colIndex, pads]) => ({ colIndex, notepads: pads }));
  }, [notepads]);

  const handleAddColumn = async () => {
    const newColIndex = columns.length > 0 ? Math.max(...columns.map((c) => c.colIndex)) + 1 : 0;
    await createNotepad(newColIndex, 0);
  };

  useEffect(() => { if (onAddColumnRef) onAddColumnRef(handleAddColumn); }, [onAddColumnRef, columns]);

  const handleAddRow = async (colIndex: number, content?: string, title?: string) => {
    const col = columns.find((c) => c.colIndex === colIndex);
    const newRowIndex = col ? Math.max(...col.notepads.map((n) => n.row_index)) + 1 : 0;
    await createNotepad(colIndex, newRowIndex, content, title);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (event: DragStartEvent) => {
    const notepad = notepads.find((n) => n.id === event.active.id);
    setActiveNotepad(notepad || null);
    const activeElement = document.querySelector(`[data-notepad-id="${event.active.id}"]`);
    if (activeElement) {
      const rect = activeElement.getBoundingClientRect();
      setDraggedDimensions({ width: rect.width, height: rect.height });
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
    const targetColumnNotepads = notepads.filter((n) => n.col_index === targetColIndex && n.id !== active.id).sort((a, b) => a.row_index - b.row_index);
    const overIndex = targetColumnNotepads.findIndex((n) => n.id === over.id);
    const insertIndex = isColumnEnd ? targetColumnNotepads.length : (overIndex === -1 ? targetColumnNotepads.length : overIndex);
    targetColumnNotepads.splice(insertIndex, 0, activeNotepad);
    targetColumnNotepads.forEach((n, index) => updates.push({ id: n.id, col_index: targetColIndex, row_index: index }));
    if (!isSameColumn) {
      const sourceColumnNotepads = notepads.filter((n) => n.col_index === sourceColIndex && n.id !== active.id).sort((a, b) => a.row_index - b.row_index);
      sourceColumnNotepads.forEach((n, index) => updates.push({ id: n.id, col_index: sourceColIndex, row_index: index }));
    }
    reorderNotepads(updates);
  };

  if (loading) {
    return (
      <div className="h-full p-4 flex gap-4">
        {[0, 1].map((col) => (
          <div key={col} className="flex-1 flex flex-col gap-4">
            {[0, 1].map((row) => <Skeleton key={row} className="flex-1 rounded-lg" />)}
          </div>
        ))}
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        {isReadOnly ? (
          <p className="text-muted-foreground">{t('notepad.grid.emptyCanvas')}</p>
        ) : (
          <div className="max-w-md rounded-xl border border-border/50 bg-muted/20 p-6 text-center">
            <h2 className="text-base font-medium mb-2">{t('onboarding.folioEmpty.title')}</h2>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {t('onboarding.folioEmpty.body')}
            </p>
            <Button onClick={() => createNotepad(0, 0)}>
              <Plus weight="duotone" className="w-4 h-4 mr-2" />
              {t('notepad.grid.addFirstNotebook')}
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">{t('onboarding.folioEmpty.hint')}</p>
          </div>
        )}
      </div>
    );
  }

  const getColDefaultSize = (colIdx: number) => {
    if (colSizes && colSizes[colIdx]) return parseFloat(colSizes[colIdx]);
    return Math.max(20, 100 / columns.length);
  };

  const handleLayoutChange = (sizes: number[]) => {
    if (onColSizesChange) onColSizesChange(sizes.map(s => s.toString()));
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-full min-h-0 flex">
          <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 h-full" onLayout={handleLayoutChange}>
            {columns.flatMap((column, colIdx) => {
              const elements: JSX.Element[] = [];
              if (colIdx > 0) elements.push(<ResizableHandle key={`h-handle-${column.colIndex}`} />);
              elements.push(
                <ResizablePanel key={`col-${column.colIndex}`} id={`col-${column.colIndex}`} order={colIdx} minSize={15} defaultSize={getColDefaultSize(colIdx)}
                  className={`min-h-0 ${deletingColumn === column.colIndex ? 'opacity-0 scale-95 transition-all duration-300' : ''}`}>
                  <div className="h-full min-h-0 flex flex-col px-1 py-1 relative">
                    <div className="flex-1 min-h-0 overflow-auto pr-0.5" data-scroll-container>
                      <SortableContext items={column.notepads.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-1">
                          {column.notepads.map((notepad) => (
                            <div key={notepad.id} className={`transition-all duration-300 ${deletingNotepadId === notepad.id ? 'opacity-0 scale-95 -translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}>
                              <SortableNotebook
                                notepad={notepad}
                                isFocused={focusedId === notepad.id}
                                onFocus={() => setFocusedId(notepad.id)}
                                onBlur={() => setFocusedId(null)}
                                onUpdate={isReadOnly ? undefined : (updates) => updateNotepad(notepad.id, updates)}
                                onDelete={isReadOnly ? undefined : () => {
                                  setDeletingNotepadId(notepad.id);
                                  setTimeout(() => { deleteNotepad(notepad.id); setDeletingNotepadId(null); }, 300);
                                }}
                                onCreateNotepad={isReadOnly ? undefined : (content) => handleAddRow(column.colIndex, content)}
                                minHeight={100}
                                isReadOnly={isReadOnly}
                              />
                            </div>
                          ))}
                          <ColumnEndDropZone colIndex={column.colIndex}>
                            {!isReadOnly && (
                              <NewNotebookButton
                                title={t('notepad.newNotebook')}
                                count={column.notepads.length}
                                onCreate={() => handleAddRow(column.colIndex, undefined, t('notepad.newNotebook'))}
                                aside={
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setColumnToDelete(column.colIndex)}>
                                        <Trash weight="duotone" className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('notepad.grid.deleteColumn')}</TooltipContent>
                                  </Tooltip>
                                }
                              />
                            )}
                          </ColumnEndDropZone>
                        </div>
                      </SortableContext>
                    </div>
                  </div>
                </ResizablePanel>
              );
              return elements;
            })}
          </ResizablePanelGroup>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeNotepad && draggedDimensions ? (
            <div className="shadow-2xl shadow-black/20 rounded-lg" style={{ width: draggedDimensions.width, height: draggedDimensions.height }}>
              <ResizableNotebook notepad={activeNotepad} isFocused={false} onFocus={() => {}} onBlur={() => {}} minHeight={100} isReadOnly={true} isDragging={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AlertDialog open={columnToDelete !== null} onOpenChange={(open) => { if (!open) setColumnToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notepad.grid.deleteColumnDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('notepad.grid.deleteColumnDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('notepad.grid.deleteColumnDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (columnToDelete === null) return;
                setDeletingColumn(columnToDelete);
                setColumnToDelete(null);
                setTimeout(async () => { await deleteColumn(columnToDelete); setDeletingColumn(null); }, 300);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('notepad.grid.deleteColumnDialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
