import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { Plus } from '@/components/ui/icons';
import { getFontById, getThemeById } from '@/lib/notepad-themes';
import { cn } from '@/lib/utils';

// The morph follows motion-primitives' MorphingPopover (MIT, ibelick/motion-primitives):
// shared layoutIds carry the button into what it becomes, on a soft spring.
const TRANSITION = { type: 'spring', bounce: 0.12, duration: 0.55 } as const;
/** When the spring has visibly settled: the notebook is saved after this, so it lands on a finished card. */
const SETTLE_MS = 450;

/** A new notebook's look, so the card hands over to it seamlessly (its body starts blank). */
const NEW_NOTEBOOK = { theme: 'clean-white', font: 'inter', height: 200 };
const TITLE_FONT = "'Boulder Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * "+ New notebook" at the foot of a folio column. Clicking it grows the button
 * into the new notebook's card, the label sliding into the card's title bar,
 * and holds the card in the notebook's place until it is saved and takes over.
 * The button then fades back in below. `aside` sits beside the button.
 */
export function NewNotebookButton({ title, count, onCreate, aside }: {
  /** The new notebook's title, shown on the button and carried into the card. */
  title: string;
  /** Notebooks in the column. The card leaves in the very render the new one arrives in, so
   *  the two are never on screen together (waiting for onCreate to settle showed both). */
  count: number;
  onCreate: () => Promise<unknown>;
  aside?: ReactNode;
}) {
  const id = useId();
  // The column's notebook count when the button was clicked, while that notebook is being saved.
  const [startCount, setStartCount] = useState<number | null>(null);
  const creating = startCount !== null && count === startCount;
  // The ids follow the count, so once the notebook arrives the button fades back in instead of
  // shrinking out of the card. (If saving fails the count stays put, and the card shrinks back.)
  const round = creating ? startCount : count;
  const card = `${id}-card-${round}`, label = `${id}-label-${round}`;
  const theme = getThemeById(NEW_NOTEBOOK.theme), font = getFontById(NEW_NOTEBOOK.font);

  const create = async () => {
    if (startCount !== null) return;
    setStartCount(count);
    try {
      // Saving takes ~250 ms, less than the morph: let the card finish growing first, or the
      // notebook replaces it halfway and pops to full size.
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(r => setTimeout(r, SETTLE_MS));
      await onCreate();
    } finally {
      setStartCount(null);
    }
  };

  // The button fades back in after a notebook is added, but not when the column first renders.
  const shown = useRef(false);
  useEffect(() => { shown.current = true; }, []);

  // No AnimatePresence: the card must leave in the very frame the notebook arrives, and an
  // exit animation waits for the morph to finish, leaving both on screen.
  return (
    <MotionConfig transition={TRANSITION} reducedMotion="user">
      {creating ? (
        <motion.div
          key="card"
          layoutId={card}
          aria-hidden="true"
          className={cn('flex flex-col overflow-hidden border-2 border-notepad-border', theme.className, font.className)}
          style={{ height: NEW_NOTEBOOK.height, borderRadius: 6, backgroundColor: 'hsl(var(--notepad-bg))', color: 'hsl(var(--notepad-fg))' }}
        >
          <div
            className="flex min-h-[44px] items-center px-3 py-2"
            style={{ backgroundColor: 'hsl(0 0% 0% / 0.05)', borderBottom: '1px solid hsl(var(--notepad-fg) / 0.1)' }}
          >
            <motion.span layoutId={label} layout="position" className="text-sm font-bold leading-tight" style={{ fontFamily: TITLE_FONT }}>
              {title}
            </motion.span>
          </div>
        </motion.div>
      ) : (
        <motion.div key={`row-${round}`} className="flex items-center gap-1" initial={shown.current ? { opacity: 0 } : false} animate={{ opacity: 1 }}>
          <motion.button
            type="button"
            layoutId={card}
            onClick={() => void create()}
            style={{ borderRadius: 8 }}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus weight="duotone" className="h-4 w-4" />
            <motion.span layoutId={label} layout="position">{title}</motion.span>
          </motion.button>
          {aside}
        </motion.div>
      )}
    </MotionConfig>
  );
}
