import { memo, useEffect, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, DotsSixVertical } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StoryChapter } from '@/hooks/useStoryChapters';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

interface Props {
  chapters: StoryChapter[];
  activeId: string | null;
  loading: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onReorder: (next: StoryChapter[]) => void;
}

function ChapterListInner({ chapters, activeId, loading, readOnly, onSelect, onCreate, onReorder }: Props) {
  const { t } = useTranslation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [draftInfo, setDraftInfo] = useState<Record<string, { count: number; activeLabel: number | null }>>({});

  const ids = chapters.map(c => c.id).join(',');
  useEffect(() => {
    if (!chapters.length) { setDraftInfo({}); return; }
    let cancelled = false;
    (async () => {
      const idList = chapters.map(c => c.id);
      const { data } = await supabase
        .from('story_chapter_drafts' as any)
        .select('id, chapter_id, draft_number, name')
        .in('chapter_id', idList);
      if (cancelled) return;
      const rows = (data as any[]) || [];
      const byChapter: Record<string, { id: string; draft_number: number; name: string | null }[]> = {};
      for (const r of rows) {
        (byChapter[r.chapter_id] ||= []).push({ id: r.id, draft_number: r.draft_number, name: r.name ?? null });
      }
      const info: Record<string, { count: number; activeLabel: number | null }> = {};
      for (const c of chapters) {
        const list = (byChapter[c.id] || []).slice().sort((a, b) => a.draft_number - b.draft_number);
        const activeIdx = list.findIndex(d => d.id === c.active_draft_id);
        let label: number | null = null;
        if (activeIdx >= 0) {
          const active = list[activeIdx];
          const m = active.name?.match(/\d+/);
          label = m ? parseInt(m[0], 10) : activeIdx + 1;
        }
        info[c.id] = { count: list.length, activeLabel: label };
      }
      setDraftInfo(info);
    })();
    return () => { cancelled = true; };
  }, [ids, chapters.map(c => c.active_draft_id).join(',')]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = chapters.findIndex(c => c.id === active.id);
      const newIndex = chapters.findIndex(c => c.id === over.id);
      onReorder(arrayMove(chapters, oldIndex, newIndex));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-xs text-muted-foreground p-3">{t('common.loading')}</div>
        ) : chapters.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3">{t('story.noChaptersYet')}</div>
        ) : (
          <DndContext sensors={readOnly ? [] : sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={chapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <TooltipProvider delayDuration={300}>
                <ul className="space-y-0.5">
                  {chapters.map((c, i) => (
                    <SortableChapterItem
                      key={c.id}
                      chapter={c}
                      index={i + 1}
                      active={c.id === activeId}
                      readOnly={readOnly}
                      onSelect={() => onSelect(c.id)}
                      draftCount={draftInfo[c.id]?.count ?? 0}
                      activeDraftNumber={draftInfo[c.id]?.activeLabel ?? null}
                    />
                  ))}
                </ul>
              </TooltipProvider>
            </SortableContext>
          </DndContext>
        )}
      </div>
      {!readOnly && (
        <div
          className="p-2 border-t"
          style={{ borderColor: 'hsl(var(--notepad-fg, var(--foreground)) / 0.06)' }}
        >
          <Button
            onClick={onCreate}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[hsl(var(--notepad-fg,var(--foreground))/0.65)] hover:text-[hsl(var(--notepad-fg,var(--foreground)))] hover:bg-[hsl(var(--notepad-fg,var(--foreground))/0.05)]"
          >
            <Plus weight="duotone" className="w-4 h-4" /> {t('story.newChapter')}
          </Button>
        </div>
      )}
    </div>
  );
}

export const ChapterList = memo(ChapterListInner);

function SortableChapterItem({
  chapter, index, active, readOnly, onSelect, draftCount, activeDraftNumber,
}: {
  chapter: StoryChapter;
  index: number;
  active: boolean;
  readOnly: boolean;
  onSelect: () => void;
  draftCount: number;
  activeDraftNumber: number | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id, disabled: readOnly });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative flex items-center gap-1 pl-4 pr-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
        active
          ? 'bg-[hsl(var(--notepad-fg,var(--foreground))/0.1)] text-[hsl(var(--notepad-fg,var(--foreground)))]'
          : 'text-[hsl(var(--notepad-fg,var(--foreground))/0.65)] hover:text-[hsl(var(--notepad-fg,var(--foreground)))] hover:bg-[hsl(var(--notepad-fg,var(--foreground))/0.05)]',
        isDragging && 'opacity-50'
      )}
      onClick={onSelect}
    >
      {!readOnly && (
        <button
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity p-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <DotsSixVertical weight="bold" className="w-3.5 h-3.5" />
        </button>
      )}
      <span className="text-[10px] font-mono opacity-60 w-4 text-right shrink-0">{index}.</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-1 min-w-0 truncate leading-snug">{chapter.title}</span>
        </TooltipTrigger>
        <TooltipContent side="right" align="start" className="max-w-xs break-words">
          {chapter.title}
        </TooltipContent>
      </Tooltip>
      {draftCount > 1 && activeDraftNumber != null && (
        <span className="shrink-0 text-[10px] font-mono leading-none px-1.5 py-0.5 rounded-full bg-[hsl(var(--notepad-fg,var(--foreground))/0.07)] text-[hsl(var(--notepad-fg,var(--foreground))/0.55)]">
          {activeDraftNumber}
        </span>
      )}
    </li>
  );
}
