import { CalendarBlank, MapPin, BookOpen } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getThemeById } from '@/lib/notepad-themes';

type View = 'timeline' | 'map' | 'story';

/**
 * Reads the saved story theme synchronously so the very first loading frame
 * already uses the writer's chosen paper colours (no flash of the default
 * app theme before the themed screen appears).
 */
function storyThemeClass(): string {
  try {
    return getThemeById(localStorage.getItem('storymode:story:theme') || 'cream').className;
  } catch {
    return getThemeById('cream').className;
  }
}

export function ViewLoadingOverlay({ view }: { view: View }) {
  const { t } = useTranslation();
  const label = view === 'timeline' ? t('viewLoading.timeline') : view === 'map' ? t('viewLoading.map') : t('viewLoading.story');
  const themed = view === 'story';
  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center justify-center',
        themed ? cn('notepad-themed', storyThemeClass()) : 'bg-background/80 backdrop-blur-sm',
      )}
      style={
        themed
          ? {
              backgroundColor: 'hsl(var(--notepad-bg, var(--background)))',
              color: 'hsl(var(--notepad-fg, var(--foreground)))',
            }
          : undefined
      }
    >
      {view === 'timeline' ? <TimelineLoader /> : view === 'map' ? <MapLoader /> : <StoryLoader />}
      <p
        className="mt-5 text-xs font-mono tracking-wider animate-pulse"
        style={themed ? { color: 'hsl(var(--notepad-fg, var(--foreground)) / 0.55)' } : undefined}
      >
        {label}
      </p>
    </div>
  );
}

function StoryLoader() {
  return (
    <div className="flex flex-col items-center gap-4">
      <BookOpen weight="duotone" className="w-10 h-10 text-primary animate-[bounce-gentle_1.6s_ease-in-out_infinite]" />
      <div className="flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-primary/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      </div>
    </div>
  );
}

function TimelineLoader() {
  return (
    <div className="flex flex-col items-center gap-4">
      <CalendarBlank weight="duotone" className="w-10 h-10 text-primary animate-[calendar-pulse_2s_ease-in-out_infinite]" />
      <div className="flex items-center gap-2">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-primary/60 animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      </div>
    </div>
  );
}

function MapLoader() {
  return (
    <div className="flex flex-col items-center gap-3">
      <MapPin weight="duotone" className="w-10 h-10 text-primary animate-[bounce-gentle_1.4s_ease-in-out_infinite]" />
      <svg width="80" height="24" viewBox="0 0 80 24" fill="none" className="text-primary/50">
        <path d="M4 20 Q20 4, 40 12 T76 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" className="animate-[draw-line_2s_ease-in-out_infinite]" style={{ strokeDasharray: 120, strokeDashoffset: 120 }} />
      </svg>
    </div>
  );
}
