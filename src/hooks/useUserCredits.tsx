import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { SELF_HOSTED } from "@/lib/self-hosted";

export interface CreditsState {
  included: number;
  used: number;
  purchased: number;
  remaining: number;
  period_start: string | null;
}

const EMPTY_STATE: CreditsState = { included: 0, used: 0, purchased: 0, remaining: 0, period_start: null };

export const CREDITS_CHANGED_EVENT = "storymode:credits-changed";

/** Call after any AI action so every credit display refreshes. */
export function notifyCreditsChanged() {
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}

export function useUserCredits() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditsState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    // Self-hosted installs don't meter AI: no credits to show.
    if (!user || SELF_HOSTED) { setCredits(EMPTY_STATE); setLoading(false); return; }
    const { data, error } = await supabase.rpc("get_my_credits");
    if (!error && data) setCredits(data as unknown as CreditsState);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  // Refresh on tab focus, every minute, and right after any AI action spends credits
  useEffect(() => {
    if (!user || SELF_HOSTED) return;
    const onFocus = () => refetch();
    // Charges are written after the model responds; re-check shortly after too.
    const onChanged = () => { refetch(); setTimeout(refetch, 2500); };
    window.addEventListener("focus", onFocus);
    window.addEventListener(CREDITS_CHANGED_EVENT, onChanged);
    const interval = setInterval(refetch, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChanged);
      clearInterval(interval);
    };
  }, [user, refetch]);

  return { credits, loading, refetch };
}

export const CREDIT_PACKS = [
  { id: "credits_500",  credits: 500,  price: "$5"  },
  { id: "credits_2000", credits: 2000, price: "$18" },
  { id: "credits_5000", credits: 5000, price: "$40" },
];

export const PLAN_CREDITS: Record<"draft" | "manuscript" | "studio", number> = {
  draft: 30,
  manuscript: 800,
  studio: 3500,
};
