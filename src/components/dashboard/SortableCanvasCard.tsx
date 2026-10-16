import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Globe } from '@/components/ui/icons';
import { NotebookGrid } from '@/hooks/useNotebookGrids';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GlassCard } from '@/components/ui/glass-card';
import { useTranslation } from 'react-i18next';

interface SortableCanvasCardProps {
  grid: NotebookGrid;
  onNavigate: (id: string) => void;
}

export function SortableCanvasCard({ grid, onNavigate }: SortableCanvasCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: grid.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const isPublic = grid.is_public;

  return (
    <GlassCard
      ref={setNodeRef}
      style={style}
      className={`w-44 h-44 touch-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-pointer'
      }`}
      {...attributes}
      {...listeners}
      onClick={() => onNavigate(grid.id)}
    >
      <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      
      {/* Status icons in top-left corner */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10 pointer-events-auto">
        {isPublic && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                type="button"
                className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-sm border border-white/30 flex items-center justify-center cursor-default"
                title={t('map.publicFolio')}
                aria-label={t('map.publicFolio')}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Globe weight="duotone" className="w-3 h-3 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('map.publicFolio')}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <CardHeader className="h-full flex flex-col items-center p-3 pb-4 relative z-10 gap-0">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-3xl leading-none">{grid.icon || '📓'}</div>
        </div>
        <CardTitle className="text-center text-xs w-full font-mono font-normal text-white/90 line-clamp-2 leading-tight">
          {grid.title}
        </CardTitle>
      </CardHeader>
    </GlassCard>
  );
}
