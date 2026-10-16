import { ReactNode } from "react";
import { X } from "@/components/ui/icons";
import { BackgroundImage } from "@/lib/backgrounds";

interface OnboardingModalProps {
  kicker: string;
  heading: string;
  intro: string;
  art: BackgroundImage;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}

/**
 * Shared shell for the first-run onboarding modals (Folios, Timeline, Maps):
 * a painting on the left, copy and actions on the right.
 */
export function OnboardingModal({ kicker, heading, intro, art, onClose, closeLabel, children }: OnboardingModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-[3px] p-4">
      <div className="relative w-full max-w-4xl max-h-[86vh] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl grid grid-rows-[auto] md:grid-cols-[0.8fr_1.2fr]">
        <div className="relative hidden md:block min-h-full overflow-hidden bg-foreground/90">
          <img src={art.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
          <div className="relative h-full flex flex-col justify-end p-5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/70">
              {art.artist} · {art.title}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-y-auto p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-primary mb-2">{kicker}</p>
              <h2 className="text-2xl md:text-3xl font-medium leading-tight text-foreground">{heading}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X weight="bold" className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-4 text-sm md:text-base leading-relaxed text-muted-foreground">{intro}</p>

          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}