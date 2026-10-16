import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, SpinnerGap } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OnboardingModal } from "./OnboardingModal";
import { BackgroundImage } from "@/lib/backgrounds";

import { useAuth } from "@/hooks/useAuth";
import { readOnboardingFlag, writeOnboardingFlag, clearOnboardingFlag } from "@/lib/onboarding-flags";

const HIDDEN_KEY = "sm.onboarding.folios.hidden";

export const FOLIO_SET_KEYS = ["characters", "locations", "scenes", "research", "factions"] as const;
export type FolioSetKey = (typeof FOLIO_SET_KEYS)[number];

export function useFoliosOnboarding(projectId: string | undefined, enabled: boolean) {
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

interface FoliosOnboardingProps {
  art: BackgroundImage;
  onClose: (dontShowAgain: boolean) => void;
  onCreate: (keys: FolioSetKey[], dontShowAgain: boolean) => Promise<void> | void;
}

export function FoliosOnboarding({ art, onClose, onCreate }: FoliosOnboardingProps) {
  const { t } = useTranslation();
  const [dontShow, setDontShow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({
    characters: true,
    locations: true,
    scenes: true,
    research: false,
    factions: false,
  });

  const pickedKeys = FOLIO_SET_KEYS.filter((k) => picked[k]);

  const handleCreate = async () => {
    if (pickedKeys.length === 0 || creating) return;
    setCreating(true);
    await onCreate(pickedKeys, dontShow);
    setCreating(false);
  };

  return (
    <OnboardingModal
      kicker={t("onboarding.foliosModal.kicker")}
      heading={t("onboarding.foliosModal.heading")}
      intro={t("onboarding.foliosModal.intro")}
      art={art}
      onClose={() => onClose(dontShow)}
      closeLabel={t("onboarding.foliosModal.close")}
    >
      <div className="border-t border-border/60">
        {FOLIO_SET_KEYS.map((key) => {
          const notes = t(`onboarding.folioSets.${key}.notes`, { returnObjects: true }) as { title: string }[];
          const count = Array.isArray(notes) ? notes.length : 0;
          const on = !!picked[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPicked((p) => ({ ...p, [key]: !p[key] }))}
              className="w-full grid grid-cols-[18px_1fr_auto] items-start gap-3 py-3 border-b border-border/50 text-left hover:bg-muted/40 transition-colors px-1"
              aria-pressed={on}
            >
              <span
                className={`mt-0.5 flex h-[17px] w-[17px] items-center justify-center rounded-[3px] border ${
                  on ? "border-primary bg-primary/15 text-primary" : "border-border"
                }`}
              >
                {on && <Check weight="bold" className="h-3 w-3" />}
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-foreground mb-1">
                  {t(`onboarding.folioSets.${key}.title`)}
                </span>
                <span className="block text-sm leading-snug text-muted-foreground">
                  {t(`onboarding.folioSets.${key}.body`)}
                </span>
              </span>
              <span className="text-[10px] tracking-[0.18em] text-muted-foreground/70 pt-0.5">
                {t("onboarding.foliosModal.noteCount", { count })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
          {t("onboarding.foliosModal.dontShow")}
        </label>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => onClose(dontShow)} disabled={creating}>
            {t("onboarding.foliosModal.startEmpty")}
          </Button>
          <Button size="sm" className="rounded-full" onClick={handleCreate} disabled={pickedKeys.length === 0 || creating}>
            {creating && <SpinnerGap weight="bold" className="mr-2 h-4 w-4 animate-spin" />}
            {t("onboarding.foliosModal.create", { count: pickedKeys.length })}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground/80">{t("onboarding.foliosModal.footnote")}</p>
    </OnboardingModal>
  );
}