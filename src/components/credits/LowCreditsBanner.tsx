import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useAuth } from "@/hooks/useAuth";
import { Sparkle, X, ShoppingBag } from "@/components/ui/icons";
import { BuyCreditsModal } from "./BuyCreditsModal";

const DISMISS_KEY = "low_credits_dismissed";

export function LowCreditsBanner() {
  const { user } = useAuth();
  const { credits, loading } = useUserCredits();
  const { plan } = useUserPlan();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return;
      const { day } = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (day === today) setDismissed(true);
    } catch { /* storage unavailable: the banner just shows again */ }
  }, [location.pathname]);

  const low = useMemo(() => {
    if (!user || loading) return false;
    const total = credits.included + credits.purchased;
    return total > 0 && credits.remaining <= Math.max(1, Math.ceil(total * 0.1));
  }, [credits, loading, user]);

  // Never show on marketing/auth surfaces
  const hidePaths = ["/", "/auth", "/set-password", "/waitlist", "/welcome", "/plans", "/guide"];
  if (!user || !low || dismissed || hidePaths.includes(location.pathname)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ day: new Date().toISOString().slice(0, 10) }));
    } catch { /* storage unavailable: dismissal lasts this visit */ }
    setDismissed(true);
  };

  const remaining = credits.remaining;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[65] px-4 py-2 flex items-center justify-center gap-3 text-xs font-mono backdrop-blur-md bg-primary/10 border-b border-primary/20 text-foreground">
        <Sparkle weight="duotone" className="w-4 h-4 text-primary" />
        <span>
          Only {remaining} AI credit{remaining === 1 ? "" : "s"} left this month.
        </span>
        {plan === "draft" ? (
          <button
            onClick={() => navigate("/plans")}
            className="px-3 py-1 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Upgrade plan
          </button>
        ) : (
          <button
            onClick={() => setBuyOpen(true)}
            className="px-3 py-1 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1"
          >
            <ShoppingBag weight="duotone" className="w-3 h-3" /> Buy more
          </button>
        )}
        <button onClick={dismiss} className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
          <X weight="bold" className="w-3.5 h-3.5" />
        </button>
      </div>
      <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </>
  );
}