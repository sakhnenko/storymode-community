import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Project } from '@/hooks/useProjects';
import { GlassCard } from '@/components/ui/glass-card';

interface SortableProjectCardProps {
  project: Project;
  onNavigate: (id: string) => void;
}

export function SortableProjectCard({ project, onNavigate }: SortableProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <GlassCard
      ref={setNodeRef}
      style={style}
      className={`aspect-square touch-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-pointer'
      }`}
      {...attributes}
      {...listeners}
      onClick={() => onNavigate(project.id)}
    >
      <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      <CardHeader className="h-full flex flex-col items-center p-4 relative z-10">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-8xl">{project.icon || '📁'}</div>
        </div>
        <CardTitle className="text-center text-sm w-full font-mono font-medium text-white/95 line-clamp-2 leading-relaxed min-h-[2.5rem]">
          {project.title}
        </CardTitle>
      </CardHeader>
    </GlassCard>
  );
}
