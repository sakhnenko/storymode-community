/**
 * Shared glass surface styling used by floating popups, dropdowns and
 * toolbar-anchored panels (color picker, brush picker, notebook picker,
 * label editor, map selector). Matches the visual treatment of the floating
 * map toolbar.
 */
export const GLASS_SURFACE_CLASS =
  'bg-gradient-to-b from-white/95 via-white/90 to-white/85 ' +
  'dark:from-white/15 dark:via-white/10 dark:to-white/5 ' +
  'backdrop-blur-xl border border-white/60 dark:border-white/15 ' +
  'rounded-xl shadow-2xl';

/**
 * Shared glass card styling for dashboard/project/folio cards on dark
 * background images. Provides consistent borders and shimmer-ready structure.
 */
export const GLASS_CARD_CLASS =
  'border-white/15 hover:border-white/60 ' +
  'bg-white/10 backdrop-blur-sm ' +
  'rounded-xl shadow-[0_2px_4px_0_hsl(0_0%_0%/0.2)] ' +
  'active:shadow-[inset_0_2px_4px_0_hsl(0_0%_0%/0.25)] active:translate-y-[1px] ' +
  'overflow-hidden transition-all group';