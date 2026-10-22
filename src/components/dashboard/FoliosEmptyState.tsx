import { GlassCard } from "@/components/ui/glass-card";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  SquaresFour,
  NotePencil,
  ClockCounterClockwise,
  MapTrifold,
  Plus,
  SpinnerGap,
} from "@/components/ui/icons";

interface FoliosEmptyStateProps {
  isReadOnly: boolean;
  isCreating: boolean;
  onCreate: () => void;
}

export function FoliosEmptyState({ isReadOnly, isCreating, onCreate }: FoliosEmptyStateProps) {
  const { t } = useTranslation();

  if (isReadOnly) {
    return (
      <div className="text-center py-16">
        <SquaresFour weight="duotone" className="w-16 h-16 mx-auto text-white/70 mb-4" />
        <h2 className="text-xl font-medium mb-2 text-white">{t("dashboard.noFolios")}</h2>
        <p className="text-white/70">{t("dashboard.noFoliosReader")}</p>
      </div>
    );
  }

  const items = [
    { icon: NotePencil, title: t("onboarding.folios.cards.notebooks.title"), body: t("onboarding.folios.cards.notebooks.body") },
    { icon: ClockCounterClockwise, title: t("onboarding.folios.cards.timeline.title"), body: t("onboarding.folios.cards.timeline.body") },
    { icon: MapTrifold, title: t("onboarding.folios.cards.mapStory.title"), body: t("onboarding.folios.cards.mapStory.body") },
  ];

  return (
    <div className="py-12 max-w-4xl mx-auto text-center">
      <SquaresFour weight="duotone" className="w-14 h-14 mx-auto text-white/80 mb-4" />
      <h2 className="text-2xl font-medium mb-2 text-white">{t("onboarding.folios.title")}</h2>
      <p className="text-white/75 max-w-xl mx-auto mb-8">{t("onboarding.folios.subtitle")}</p>

      <div className="grid gap-4 sm:grid-cols-3 mb-8 text-left">
        {items.map(({ icon: Icon, title, body }) => (
          <GlassCard key={title} className="p-4 cursor-default">
            <div className="relative z-10">
              <Icon weight="duotone" className="w-6 h-6 text-white/80 mb-2" />
              <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
              <p className="text-xs text-white/70 leading-relaxed">{body}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <GlassCard
          className="inline-flex items-center justify-center gap-2 px-5 py-3 cursor-pointer"
          onClick={onCreate}
          role="button"
          aria-label={t("onboarding.folios.createCta")}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          <div className="relative z-10 flex items-center gap-2">
            {isCreating ? (
              <SpinnerGap weight="duotone" className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Plus weight="duotone" className="w-4 h-4 text-white/80" />
            )}
            <span className="text-sm text-white/90 font-mono">{t("onboarding.folios.createCta")}</span>
          </div>
        </GlassCard>
        <p className="text-xs text-white/60">{t("onboarding.folios.createHint")}</p>
        <Link to="/guide" className="text-xs text-white/70 underline underline-offset-4 hover:text-white">
          {t("onboarding.folios.guideLink")}
        </Link>
      </div>
    </div>
  );
}
