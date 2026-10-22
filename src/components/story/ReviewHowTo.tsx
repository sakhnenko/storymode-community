import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Sparkle, TextB, TextItalic, TextUnderline } from '@/components/ui/icons';

/** One loop: select a paragraph, the toolbar pops up, tap Mark for review, it's sent. */
const LOOP_S = 5.6;
const loop = (times: number[]) => ({ duration: LOOP_S, times, repeat: Infinity, ease: 'easeInOut' as const });

/** The selected paragraph's lines, as a share of the page width. */
const PARAGRAPH = [0.96, 0.9, 0.58];
/** When the selection starts, and how long each line takes to fill (shares of the loop). */
const SELECT_FROM = 0.08;
const PER_LINE = 0.07;
const SELECTED = SELECT_FROM + PER_LINE * PARAGRAPH.length;
const TOOLBAR_IN = SELECTED + 0.06;
const TAP = 0.56;
const SENT = 0.66;

/** A line of manuscript, drawn as a soft bar. */
const Line = ({ width }: { width: string }) => (
  <div className="h-1.5 rounded-full bg-foreground/[0.12]" style={{ width }} />
);

/**
 * A small looping illustration of asking for a review: a paragraph is
 * selected line by line, the editor's floating toolbar appears above it, Mark
 * for review is tapped, and the passage heads off to the AI editor. With
 * reduced motion it shows the moment just before the tap.
 */
export function ReviewHowTo() {
  const { t } = useTranslation();
  const still = useReducedMotion();

  // Frames are written as whole poses; motion wants one keyframe list per property.
  const anim = (frames: Record<string, number | string>[], times: number[], at: Record<string, number | string>) => {
    if (still) return { initial: false as const, animate: at };
    const tracks: Record<string, (number | string)[]> = {};
    for (const frame of frames) for (const [key, value] of Object.entries(frame)) (tracks[key] ??= []).push(value);
    // No `initial={false}` here: with keyframes it would jump to the last one and stay.
    return { animate: tracks, transition: loop(times) };
  };

  // The pointer's path depends on the panel's width: measure the paragraph and the button.
  const paragraphRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const [path, setPath] = useState<{ startY: number; endX: number; endY: number; buttonX: number; buttonY: number } | null>(null);
  useEffect(() => {
    const paragraph = paragraphRef.current, button = buttonRef.current;
    if (!paragraph || !button) return;
    const measure = () => {
      const lines = Array.from(paragraph.querySelectorAll<HTMLElement>('[data-line]'));
      const toolbar = button.parentElement;
      if (!lines.length || !toolbar) return;
      const last = lines[lines.length - 1];
      setPath({
        startY: lines[0].offsetTop + lines[0].offsetHeight / 2,
        endX: last.offsetWidth,
        endY: last.offsetTop + last.offsetHeight / 2,
        buttonX: toolbar.offsetLeft + button.offsetLeft + button.offsetWidth / 2,
        buttonY: toolbar.offsetTop + button.offsetTop + button.offsetHeight / 2,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, []);

  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded-xl border border-foreground/[0.08] bg-background px-5 pb-5 pt-14">
      <div className="space-y-2.5">
        <Line width="92%" />
        <Line width="64%" />
      </div>

      {/* The paragraph being selected */}
      <div ref={paragraphRef} className="relative mt-4 space-y-1">
        {PARAGRAPH.map((width, i) => {
          const from = SELECT_FROM + PER_LINE * i, to = from + PER_LINE;
          return (
            <div key={i} data-line className="relative h-3.5" style={{ width: `${width * 100}%` }}>
              <motion.div
                className="absolute inset-0 origin-left rounded-[3px] bg-primary/25"
                {...anim(
                  [{ scaleX: 0, opacity: 1 }, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1 }, { scaleX: 1, opacity: 1 }, { scaleX: 1, opacity: 0 }, { scaleX: 0, opacity: 0 }],
                  [0, from, to, TAP + 0.04, SENT + 0.04, 1],
                  { scaleX: 1, opacity: 1 },
                )}
              />
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/[0.18]" />
            </div>
          );
        })}

        {/* The floating toolbar, as in the editor, above the selection */}
        <motion.div
          className="absolute -top-11 left-[12%] flex items-center gap-0.5 rounded-md border border-foreground/[0.14] bg-popover px-1 py-1 shadow-lg"
          {...anim(
            [{ opacity: 0, y: 6, scale: 0.94 }, { opacity: 0, y: 6, scale: 0.94 }, { opacity: 1, y: 0, scale: 1 }, { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -4, scale: 0.98 }, { opacity: 0, y: 6, scale: 0.94 }],
            [0, SELECTED, TOOLBAR_IN, TAP + 0.04, SENT, 1],
            { opacity: 1, y: 0, scale: 1 },
          )}
        >
          {[TextB, TextItalic, TextUnderline].map((Icon, i) => (
            <span key={i} className="grid h-6 w-6 place-items-center rounded text-foreground/55">
              <Icon weight="bold" className="h-3.5 w-3.5" />
            </span>
          ))}
          <motion.span
            ref={buttonRef}
            className="ml-0.5 inline-flex h-6 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-medium text-primary"
            {...anim(
              [{ scale: 1, backgroundColor: 'hsl(var(--primary) / 0)' }, { scale: 1, backgroundColor: 'hsl(var(--primary) / 0)' }, { scale: 0.92, backgroundColor: 'hsl(var(--primary) / 0.16)' }, { scale: 1, backgroundColor: 'hsl(var(--primary) / 0.1)' }, { scale: 1, backgroundColor: 'hsl(var(--primary) / 0)' }],
              [0, TAP - 0.04, TAP, TAP + 0.05, 1],
              { scale: 1, backgroundColor: 'hsl(var(--primary) / 0.1)' },
            )}
          >
            <Sparkle weight="duotone" className="h-3.5 w-3.5" />
            {t('story.bubbleMarkForReview')}
          </motion.span>
        </motion.div>

        {/* The pointer: drags from the paragraph's start to its end, then taps the button */}
        {!still && path && (
          <motion.svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-0 top-0 h-4 w-4 drop-shadow"
            // The tip of the arrow is its top-left corner, so it points at each stop.
            animate={{
              x: [0, 0, 0, path.endX, path.endX, path.buttonX, path.buttonX, path.buttonX],
              y: [path.startY, path.startY, path.startY, path.endY, path.endY, path.buttonY, path.buttonY, path.buttonY],
              opacity: [0, 1, 1, 1, 1, 1, 0, 0],
            }}
            transition={loop([0, SELECT_FROM - 0.03, SELECT_FROM, SELECTED, TOOLBAR_IN, TAP - 0.06, SENT, 1])}
          >
            <path d="M2 1l11 6.5-4.6 1.1L6.3 13 2 1z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round" />
          </motion.svg>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
        <Line width="84%" />
      </div>

      {/* The passage heads off to the AI editor */}
      {!still && (
        <motion.div
          className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground"
          animate={{ opacity: [0, 0, 1, 1, 0], x: [-40, -40, 0, 0, 8], scale: [0.8, 0.8, 1, 1, 0.9] }}
          transition={loop([0, TAP + 0.02, SENT + 0.02, 0.86, 0.94])}
        >
          <Sparkle weight="fill" className="h-3 w-3" />
          1
        </motion.div>
      )}
    </div>
  );
}
