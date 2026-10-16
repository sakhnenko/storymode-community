import { Seo } from "@/components/seo/Seo";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { pickRandomBackground } from "@/lib/backgrounds";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";
import { PublicNav } from "@/components/layout/PublicNav";
import { useUserPlan, type PlanType } from "@/hooks/useUserPlan";
import { PLAN_CREDITS } from "@/hooks/useUserCredits";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Scroll, Palette, Sparkle, CreditCard, Key } from "@/components/ui/icons";

const PLAN_META: { id: PlanType; price: string; cadence: string; accent: string; featureCount: number }[] = [
  { id: "draft",      price: "Free", cadence: "",    accent: "from-slate-500/20 to-slate-500/5",   featureCount: 3 },
  { id: "manuscript", price: "$5",   cadence: "/mo", accent: "from-emerald-500/20 to-emerald-500/5", featureCount: 4 },
  { id: "studio",     price: "$20",  cadence: "/mo", accent: "from-amber-500/20 to-amber-500/5",     featureCount: 4 },
];

export default function Plans() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { plan: currentPlan, startCheckout, openPortal } = useUserPlan();
  const { toast } = useToast();
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    // Refresh subscription in the background on mount
  }, []);

  const handleChoose = async (planId: PlanType) => {
    if (!user) { navigate("/auth"); return; }
    if (planId === "draft") return;
    setLoadingPlan(planId);
    try {
      await startCheckout(planId);
    } catch (e: any) {
      toast({ title: t("plans.checkoutError"), description: e?.message, variant: "destructive" });
    } finally {
      setLoadingPlan(null);
    }
  };

  const manage = async () => {
    try { await openPortal(); }
    catch (e: any) { toast({ title: t("plans.billing"), description: e?.message, variant: "destructive" }); }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative overflow-x-hidden"
      style={{ backgroundImage: `url("${background.url}")` }}
    >
      <Seo
        title="StoryMode Plans — Write Stories. Create Worlds."
        description="Compare StoryMode plans and AI credits. Start free, then upgrade for more chapters, AI editing feedback, map drawing and worldbuilding tools."
        path="/plans"
      />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/70" />
      <BackgroundCredit background={background} />

      <PublicNav />

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-28 pb-12">
        <button
          onClick={() => navigate(-1)}
          className="text-[#f3ead6]/80 hover:text-[#f3ead6] text-xs flex items-center gap-1.5 mb-8 transition-colors"
        >
          <ArrowLeft weight="bold" className="w-3.5 h-3.5" /> {t("common.back")}
        </button>

        <div className="text-center mb-12">
          <h1
            className="text-5xl md:text-6xl mb-4"
            style={{
              fontFamily: "'Newsreader', serif",
              fontWeight: 500,
              color: "#f3ead6",
              letterSpacing: "-0.5px",
              textShadow: "0 2px 24px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {t("plans.title")}
          </h1>
          <p
            className="text-[#f3ead6] text-base max-w-lg mx-auto"
            style={{ textShadow: "0 1px 12px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.6)" }}
          >
            {t("plans.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {PLAN_META.map(p => {
            const isCurrent = currentPlan === p.id;
            const credits = PLAN_CREDITS[p.id];
            const name = t(`plans.tiers.${p.id}.name`);
            const tagline = t(`plans.tiers.${p.id}.tagline`);
            const features = t(`plans.tiers.${p.id}.features`, { returnObjects: true }) as string[];
            return (
              <div
                key={p.id}
                className={`relative rounded-3xl border border-white/15 bg-gradient-to-br ${p.accent} backdrop-blur-2xl p-6 flex flex-col shadow-2xl transition-transform hover:-translate-y-1 hover:border-white/25`}
              >
                {isCurrent && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white/90 text-black text-[10px] uppercase tracking-widest">
                    {t("plans.current")}
                  </div>
                )}
                <div className="mb-4">
                  <h2 className="text-xl text-white">{name}</h2>
                  <p className="text-white/60 text-xs mt-1">{tagline}</p>
                </div>
                <div className="mb-5">
                  <div className="flex items-baseline gap-1 text-white">
                    <span className="text-3xl">{p.price}</span>
                    {p.cadence && <span className="text-sm text-white/50">{p.cadence}</span>}
                  </div>
                </div>

                <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-5">
                  <div className="flex items-center justify-between text-xs text-white/85">
                    <span className="flex items-center gap-1.5"><Sparkle weight="duotone" className="w-3.5 h-3.5" /> {t("plans.credits")}</span>
                    <span>{credits.toLocaleString()} {t("plans.perMonth")}</span>
                  </div>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {(Array.isArray(features) ? features : []).map(f => (
                    <li key={f} className="text-sm text-white/80 flex items-start gap-2">
                      <Check weight="bold" className="w-3.5 h-3.5 text-white/70 mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  p.id === "draft" ? (
                    <Button variant="outline" disabled className="w-full bg-white/5 border-white/20 text-white/60">{t("plans.yourPlan")}</Button>
                  ) : (
                    <Button variant="outline" onClick={manage} className="w-full bg-white/5 border-white/20 text-white hover:bg-white/10">
                      <CreditCard weight="duotone" className="w-4 h-4 mr-1.5" /> {t("plans.manageBilling")}
                    </Button>
                  )
                ) : p.id === "draft" ? (
                  <Button variant="outline" disabled className="w-full bg-white/5 border-white/20 text-white/50">
                    {t("plans.includedWithSignup")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => handleChoose(p.id)}
                    disabled={loadingPlan === p.id}
                    className="w-full bg-white/5 border-white/20 text-white hover:bg-white/10"
                  >
                    {p.id === "manuscript" ? (
                      <Scroll weight="duotone" className="w-4 h-4 mr-1.5" />
                    ) : (
                      <Palette weight="duotone" className="w-4 h-4 mr-1.5" />
                    )}
                    {loadingPlan === p.id ? t("plans.opening") : t("plans.choose", { name })}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="mt-10 text-center text-[#f3ead6]/90 text-xs max-w-xl mx-auto"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.6)" }}
        >
          {t("plans.footnote")}
        </div>

        <div className="mt-8 max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 flex gap-4">
          <div className="mt-0.5 flex-shrink-0">
            <Key weight="duotone" className="w-5 h-5 text-[#f3ead6]" />
          </div>
          <div>
            <h3 className="text-sm text-[#f3ead6] font-medium mb-1" style={{ textShadow: "0 1px 12px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.6)" }}>
              {t("plans.byokTitle")}
            </h3>
            <p className="text-[#f3ead6]/80 text-xs leading-relaxed" style={{ textShadow: "0 1px 10px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.6)" }}>
              {t("plans.byokBody")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}