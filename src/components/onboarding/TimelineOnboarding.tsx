import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OnboardingModal } from "./OnboardingModal";
import { BackgroundImage } from "@/lib/backgrounds";

import { useAuth } from "@/hooks/useAuth";
import { readOnboardingFlag, writeOnboardingFlag, clearOnboardingFlag } from "@/lib/onboarding-flags";

const HIDDEN_KEY = "sm.onboarding.timeline.hidden";

export function useTimelineOnboarding(projectId: string | undefined, enabled: boolean) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || !projectId || !user) return;
    if (readOnboardingFlag(HIDDEN_KEY, user.id)) return;
    setOpen(true);
  }, [projectId, enabled, user]);

  const close = (dontShowAgain: boolean) => {
    setOpen(false);
    if (dontShowAgain) writeOnboardingFlag(HIDDEN_KEY, user?.id);
  };

  return {
    open,
    close,
    show: () => {
      clearOnboardingFlag(HIDDEN_KEY, user?.id);
      setOpen(true);
    },
  };
}

export function TimelineOnboarding({ art, onClose }: { art: BackgroundImage; onClose: (dontShowAgain: boolean) => void }) {
  const { t } = useTranslation();
  const [dontShow, setDontShow] = useState(false);

  return (
    <OnboardingModal
      kicker={t("onboarding.timelineModal.kicker")}
      heading={t("onboarding.timelineModal.heading")}
      intro={t("onboarding.timelineModal.intro")}
      art={art}
      onClose={() => onClose(dontShow)}
      closeLabel={t("onboarding.timelineModal.close")}
    >
      <div className="border-t border-border/60 pt-3">
        <div className="flex justify-between text-[10px] tracking-[0.2em] text-muted-foreground/60 pb-5">
          <span>1200</span>
          <span>1215</span>
          <span>1230</span>
          <span>1245</span>
          <span>1260</span>
        </div>
        <div className="relative h-[170px]">
          <div className="absolute inset-0 grid grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-l border-border/40 last:border-r" />
            ))}
          </div>
          <div className="absolute left-[4%] top-0 w-[42%]">
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
              <p className="text-[9.5px] tracking-[0.2em] text-muted-foreground/70 mb-1">
                {t("onboarding.timelineModal.example.character")}
              </p>
              <p className="text-sm text-muted-foreground">{t("onboarding.timelineModal.example.characterBody")}</p>
            </div>
            <div className="mt-2 h-[3px] bg-[repeating-linear-gradient(90deg,hsl(var(--muted-foreground)/0.4)_0_8px,transparent_8px_14px)]" />
          </div>
          <div className="absolute left-[30%] top-[96px] w-[36%] rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
            <p className="text-[9.5px] tracking-[0.2em] text-muted-foreground/70 mb-1">
              {t("onboarding.timelineModal.example.event")}
            </p>
            <p className="text-sm text-muted-foreground">{t("onboarding.timelineModal.example.eventBody")}</p>
          </div>
          <div className="absolute left-[70%] top-[42px] w-[28%] rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2">
            <p className="text-[9.5px] tracking-[0.2em] text-primary mb-1">
              {t("onboarding.timelineModal.example.chapter")}
            </p>
            <p className="text-sm text-muted-foreground">{t("onboarding.timelineModal.example.chapterBody")}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
        <p className="max-w-[300px] text-xs leading-relaxed text-muted-foreground/80">
          {t("onboarding.timelineModal.footnote")}
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
            {t("onboarding.timelineModal.dontShow")}
          </label>
          <Button size="sm" className="rounded-full" onClick={() => onClose(dontShow)}>
            {t("onboarding.timelineModal.cta")}
          </Button>
        </div>
      </div>
    </OnboardingModal>
  );
}