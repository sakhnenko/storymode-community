// The admin pages' look, after the Codex Journeys view: the page font instead
// of the mono display font, hairlines instead of boxes, small quiet labels,
// pill buttons and soft surfaces.

/** On a page or dialog: the page font everywhere, including inside buttons, badges and tabs. */
export const ADMIN_SCOPE = 'font-body [&_.font-mono]:font-body';

/** Small uppercase label above a group of controls or numbers. */
export const LABEL = 'text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45';

/** Section title. */
export const TITLE = 'text-base font-medium text-foreground';

/** A soft tinted panel. */
export const SURFACE = 'rounded-2xl bg-foreground/[0.03] p-5';

/** Quiet pill button, for Button className with variant="ghost". */
export const PILL = 'h-8 rounded-full bg-foreground/[0.05] px-3.5 text-xs font-normal text-foreground hover:bg-foreground/[0.09] hover:text-foreground';

/** Main action pill, for Button className with the default variant. */
export const PILL_PRIMARY = 'h-8 rounded-full px-4 text-xs font-normal';

/** Around a Table: hairline rows, quiet headers, a light hover. */
export const TABLE = [
  'border-t border-foreground/[0.08]',
  '[&_th]:h-9 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:text-xs [&_th]:font-normal [&_th]:text-foreground/45',
  '[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-foreground/[0.06] [&_tbody_tr:hover]:bg-foreground/[0.02]',
].join(' ');

/** Admin tabs: a segmented pill like the Codex's Cards and Journeys switch. */
export const TABS_LIST = 'h-auto gap-0.5 rounded-full bg-foreground/[0.05] p-0.5 text-foreground';
export const TAB = 'rounded-full px-3.5 py-1.5 text-[13px] font-normal text-foreground/60 hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm';
