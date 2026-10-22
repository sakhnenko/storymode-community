import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OnboardingModal } from "./OnboardingModal";
import { BackgroundImage } from "@/lib/backgrounds";
import { useAuth } from "@/hooks/useAuth";
import { readOnboardingFlag, writeOnboardingFlag, clearOnboardingFlag } from "@/lib/onboarding-flags";
import painterly from "@/assets/onboarding/style-painterly.webp";
import flat from "@/assets/onboarding/style-flat.webp";
import pixel from "@/assets/onboarding/style-pixel.webp";

export type MapOnboardingChoice = "hand" | "ai" | null;

const HIDDEN_KEY = "sm.onboarding.mapGuide.hidden";

export function useMapOnboarding(mapId: string | null, enabled: boolean) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || !mapId || !user) return;
    if (readOnboardingFlag(HIDDEN_KEY, user.id)) return;
    setOpen(true);
  }, [mapId, enabled, user]);

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

const STYLES = [
  { key: "painterly", src: painterly, pixelated: false },
  { key: "flat", src: flat, pixelated: false },
  { key: "pixel", src: pixel, pixelated: true },
] as const;

export function MapOnboarding({
  art,
  onClose,
}: {
  art: BackgroundImage;
  onClose: (dontShowAgain: boolean, choice: MapOnboardingChoice) => void;
}) {
  const { t } = useTranslation();
  const [dontShow, setDontShow] = useState(false);

  return (
    <OnboardingModal
      kicker={t("onboarding.mapModal.kicker")}
      heading={t("onboarding.mapModal.heading")}
      intro={t("onboarding.mapModal.intro")}
      art={art}
      onClose={() => onClose(dontShow, null)}
      closeLabel={t("onboarding.mapModal.close")}
    >
      <div className="border-t border-border/60">
        <div className="grid grid-cols-[30px_1fr] gap-3 py-4 border-b border-border/50">
          <span className="pt-0.5 text-[11px] font-bold tracking-[0.16em] text-primary">01</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground mb-1">
              {t("onboarding.mapModal.hand.title")}
            </p>
            <p className="text-sm leading-snug text-muted-foreground">{t("onboarding.mapModal.hand.body")}</p>
          </div>
        </div>
        <div className="grid grid-cols-[30px_1fr] gap-3 py-4">
          <span className="pt-0.5 text-[11px] font-bold tracking-[0.16em] text-primary">02</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground mb-1">
              {t("onboarding.mapModal.ai.title")}
            </p>
            <p className="text-sm leading-snug text-muted-foreground mb-4">{t("onboarding.mapModal.ai.body")}</p>
            <div className="grid grid-cols-3 gap-3">
              {STYLES.map((s) => (
                <div key={s.key}>
                  <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-border/60 bg-muted/40 p-2">
                    <img
                      src={s.src}
                      alt={t(`onboarding.mapModal.styles.${s.key}`)}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                      style={s.pixelated ? { imageRendering: "pixelated" } : undefined}
                    />
                  </div>
                  <p className="mt-2 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                    {t(`onboarding.mapModal.styles.${s.key}`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
          {t("onboarding.mapModal.dontShow")}
        </label>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => onClose(dontShow, "hand")}>
            {t("onboarding.mapModal.drawMyself")}
          </Button>
          <Button size="sm" className="rounded-full" onClick={() => onClose(dontShow, "ai")}>
            {t("onboarding.mapModal.drawWithAi")}
          </Button>
        </div>
      </div>
    </OnboardingModal>
  );
}