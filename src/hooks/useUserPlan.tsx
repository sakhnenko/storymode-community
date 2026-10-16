import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorBody } from '@/lib/function-error';
import { useAuth } from './useAuth';
import { SELF_HOSTED } from '@/lib/self-hosted';

export type PlanType = 'draft' | 'manuscript' | 'studio';
export type AiTier = 'none' | 'basic' | 'full';

export const PLAN_LIMITS = {
  draft: { maxProjects: 1, maxFolios: 3, maxMaps: 1 },
  manuscript: { maxProjects: Infinity, maxFolios: Infinity, maxMaps: Infinity },
  studio: { maxProjects: Infinity, maxFolios: Infinity, maxMaps: Infinity },
} as const;

const AI_TIER_BY_PLAN: Record<PlanType, AiTier> = {
  // Draft users can try AI features with their small included credit pool.
  draft: 'basic',
  manuscript: 'basic',
  studio: 'full',
};

export function useUserPlan() {
  const { user } = useAuth();
  // Self-hosted installs have no plans: everyone gets everything.
  const [plan, setPlan] = useState<PlanType>(SELF_HOSTED ? 'studio' : 'draft');
  const [loading, setLoading] = useState(!SELF_HOSTED);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    if (SELF_HOSTED) return;
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('user_plans')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setPlan(data.plan as PlanType);
    }
    setLoading(false);
  }, [user]);

  const checkSubscription = useCallback(async () => {
    if (!user || SELF_HOSTED) return;
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data) {
        if (data.subscribed && (data.plan === 'manuscript' || data.plan === 'studio')) {
          setPlan(data.plan);
          setSubscriptionEnd(data.subscription_end);
        }
        // If not subscribed, keep the DB plan (admin may have set it)
      }
    } catch {
      // Silent fail — DB plan is the fallback
    }
  }, [user]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);
  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  const limits = PLAN_LIMITS[plan];
  const aiTier: AiTier = AI_TIER_BY_PLAN[plan];
  const hasAi = aiTier !== 'none';
  const hasPremiumAi = aiTier === 'full';
  const isAiTrial = plan === 'draft';

  const canCreate = useCallback((type: 'project' | 'folio' | 'map', currentCount: number): boolean => {
    // Never block while the plan is still unknown — a slow/failed plan read
    // must not make a paid account look like Draft.
    if (loading) return true;
    if (plan === 'manuscript' || plan === 'studio') return true;
    const key = type === 'project' ? 'maxProjects' : type === 'folio' ? 'maxFolios' : 'maxMaps';
    return currentCount < PLAN_LIMITS.draft[key];
  }, [plan, loading]);

  // Authoritative re-check straight from the database, used right before we
  // would show an upgrade wall so stale client state can't gate a paid user.
  const verifyCanCreate = useCallback(async (
    type: 'project' | 'folio' | 'map',
    currentCount: number,
  ): Promise<boolean> => {
    if (canCreate(type, currentCount)) return true;
    if (!user) return true;
    try {
      const { data, error } = await supabase
        .from('user_plans')
        .select('plan')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return true; // fail open on read errors
      const fresh = (data?.plan ?? 'draft') as PlanType;
      if (fresh !== plan) setPlan(fresh);
      if (fresh === 'manuscript' || fresh === 'studio') return true;
      const key = type === 'project' ? 'maxProjects' : type === 'folio' ? 'maxFolios' : 'maxMaps';
      return currentCount < PLAN_LIMITS.draft[key];
    } catch {
      return true;
    }
  }, [canCreate, plan, user]);

  const startCheckout = useCallback(async (targetPlan: 'manuscript' | 'studio' = 'studio') => {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { plan: targetPlan },
    });
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  }, []);

  const openPortal = useCallback(async () => {
    const resp = await supabase.functions.invoke('customer-portal');
    const data = resp.data;

    if (data?.url) {
      window.open(data.url, '_blank');
      return;
    }

    if (data?.code === 'NO_BILLING_ACCOUNT') {
      throw new Error(data.message || 'Your plan was granted by an administrator. There is no billing to manage.');
    }

    if (resp.error) {
      const body = await functionErrorBody(resp.error);
      if (String(body?.error ?? '').includes('No Stripe customer')) {
        throw new Error('Your plan was granted by an administrator. There is no billing to manage.');
      }
      throw new Error("Couldn't open billing portal. Please try again.");
    }

    throw new Error("Couldn't open billing portal. Please try again.");
  }, []);

  return {
    plan, loading, limits, canCreate, verifyCanCreate, refetch: fetchPlan,
    subscriptionEnd, startCheckout, openPortal,
    aiTier, hasAi, hasPremiumAi, isAiTrial,
  };
}
