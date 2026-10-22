/**
 * Shared field styling for the auth / waitlist surfaces.
 * "Modern Minimalist Refined": soft rounded fields, quiet uppercase labels,
 * even vertical rhythm.
 */
export const FIELD_BASE_CLASS =
  "rounded-2xl border border-foreground/[0.10] bg-white text-foreground placeholder:text-muted-foreground/45 " +
  "shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] transition-all duration-200 " +
  "hover:border-foreground/20 focus-visible:bg-white focus-visible:border-primary/50 " +
  "focus-visible:ring-2 focus-visible:ring-primary/15 focus-visible:ring-offset-0";

export const INPUT_CLASS = `h-12 px-4 ${FIELD_BASE_CLASS}`;

export const TEXTAREA_CLASS = `px-4 py-3.5 resize-none ${FIELD_BASE_CLASS}`;

export const SELECT_TRIGGER_CLASS = `h-12 px-4 ${FIELD_BASE_CLASS} focus:ring-2 focus:ring-primary/15 focus:border-primary/40`;

/** Consistent quiet label: small uppercase, wide tracking, muted. */
export const LABEL_CLASS =
  "block text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground ml-1";

/** Primary submit button on these surfaces. */
export const SUBMIT_CLASS =
  "w-full h-12 rounded-2xl font-sans font-semibold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all";

/** Card shell for the centered auth/waitlist cards. */
export const AUTH_CARD_CLASS =
  "shadow-2xl border border-border/30 bg-white/95 backdrop-blur-xl rounded-[2.5rem] overflow-hidden";

export const AUTH_CARD_CONTENT_CLASS = "p-10";
