import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Sparkle, Key } from "@/components/ui/icons";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useUserPlan } from "@/hooks/useUserPlan";
import { BuyCreditsModal } from "./BuyCreditsModal";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

function CreditsBar({ included, used, purchased, remaining }: { included: number; used: number; purchased: number; remaining: number }) {
  const total = included + purchased;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-end mb-1.5">
        <div className="text-xs font-mono text-muted-foreground">
          {remaining.toLocaleString()} <span className="opacity-60">/ {total.toLocaleString()} left</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className="h-full transition-all bg-primary" style={{ width: `${100 - pct}%` }} />
      </div>
      {purchased > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground/70 mt-1">
          Includes {purchased.toLocaleString()} extra credits added to your account (top-ups or grants; they don't expire)
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed">
        Credits are spent based on how much work each AI request takes. A quick chapter question costs a credit or two;
        a book-wide analysis or an AI Draw sticker costs more.
      </p>
    </div>
  );
}

export function CreditsCard() {
  const { t } = useTranslation();
  const { credits, loading, refetch } = useUserCredits();
  const { plan } = useUserPlan();
  const { user } = useAuth();
  const [buyOpen, setBuyOpen] = useState(false);
  const [byokLast4, setByokLast4] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handle Stripe redirect back with session_id
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("credits");
    const sid = params.get("session_id");
    if (status === "success" && sid) {
      (async () => {
        const { data } = await supabase.functions.invoke("verify-credit-purchase", { body: { session_id: sid } });
        if (data?.credited) {
          toast({ title: "Credits added!", description: `${data.credits} credits are ready to use.` });
          refetch();
        }
        // Clear query
        window.history.replaceState({}, "", window.location.pathname);
      })();
    } else if (status === "canceled") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refetch, toast]);

  // Show whether a personal OpenAI key is connected.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_api_keys" as any)
      .select("openai_key_last4")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setByokLast4((data as any)?.openai_key_last4 ?? null);
      });
  }, [user]);


  // Monthly allowance renews one month after the current period started
  // (each account has its own signup anniversary).
  const periodStart = credits.period_start ? new Date(credits.period_start) : new Date();
  const reset = new Date(periodStart);
  reset.setMonth(reset.getMonth() + 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-mono font-normal flex items-center gap-2">
            <Sparkle weight="duotone" className="w-4 h-4 text-primary" /> AI Credits
          </CardTitle>
          <button
            onClick={() => navigate("/plans")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-dotted"
          >
            View plans
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <CreditsBar
              included={credits.included}
              used={credits.used}
              purchased={credits.purchased}
              remaining={credits.remaining}
            />

            <div className="flex items-start gap-2 pt-2 border-t border-border">
              <Key weight="duotone" className="w-4 h-4 text-primary/80 mt-0.5" />
              <div className="flex-1 text-xs text-muted-foreground">
                {byokLast4 ? (
                  <span>{t("credits.byokConnected", { last4: byokLast4 })}</span>
                ) : (
                  <span>{t("credits.byokBody")}</span>
                )}
                <button
                  onClick={() => navigate("/profile")}
                  className="ml-1 underline underline-offset-4 decoration-dotted hover:text-foreground transition-colors"
                >
                  {t("credits.byok")}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground">
                {`Renews ${reset.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              </div>
              <div className="flex gap-2">
                {plan === "draft" ? (
                  <Button size="sm" variant="outline" onClick={() => navigate("/plans")} className="font-mono">
                    <Sparkle weight="duotone" className="w-3.5 h-3.5 mr-1.5" /> Upgrade
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setBuyOpen(true)} className="font-mono">
                    <ShoppingBag weight="duotone" className="w-3.5 h-3.5 mr-1.5" /> Buy more
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>

      <BuyCreditsModal open={buyOpen} onClose={() => { setBuyOpen(false); refetch(); }} />
    </Card>
  );
}