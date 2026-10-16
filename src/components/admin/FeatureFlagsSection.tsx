import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { CHAPTER_MAP_OUTLINE_FLAG, EDITOR_SPEED_TIERS_FLAG, HOME_SHOWCASE_FLAG, MEMORY_BOOK_CONTEXT_FLAG, PROJECT_MEMORY_FLAG } from '@/hooks/useFeatureAccess';
import { LABEL, TITLE } from '@/components/admin/admin-ui';
import { cn } from '@/lib/utils';
import { SELF_HOSTED } from '@/lib/self-hosted';

/** Label and description keys for known flags; others show their key. */
const FLAG_TEXT: Record<string, { label: string; description: string }> = {
  [PROJECT_MEMORY_FLAG]: { label: 'memory.title', description: 'memory.flagDescription' },
  [CHAPTER_MAP_OUTLINE_FLAG]: { label: 'admin.featureFlags.mapOutline', description: 'admin.featureFlags.mapOutlineDescription' },
  [MEMORY_BOOK_CONTEXT_FLAG]: { label: 'admin.featureFlags.memoryBook', description: 'admin.featureFlags.memoryBookDescription' },
  [EDITOR_SPEED_TIERS_FLAG]: { label: 'admin.featureFlags.speedTiers', description: 'admin.featureFlags.speedTiersDescription' },
  [HOME_SHOWCASE_FLAG]: { label: 'admin.featureFlags.homeShowcase', description: 'admin.featureFlags.homeShowcaseDescription' },
};

/** Flags for features that can't run on a self-hosted install (map outline: Jev, Lovable only). */
const HOSTED_ONLY_FLAGS = new Set<string>([CHAPTER_MAP_OUTLINE_FLAG]);

/** Who a flagged feature is open to. Off stops it for everyone, admins included. */
type Rollout = 'off' | 'admins' | 'everyone';
const ROLLOUTS: Rollout[] = ['off', 'admins', 'everyone'];
const rolloutOf = (flag: { enabled_for_all: boolean; disabled?: boolean }): Rollout =>
  flag.disabled ? 'off' : flag.enabled_for_all ? 'everyone' : 'admins';

export function FeatureFlagsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data: flags, isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: async () => {
      // `*`, so the list still loads before the Off option's column is deployed.
      const { data, error } = await supabase.from('feature_flags')
        .select('*').order('key');
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  const migrationPending = (loadError as { code?: string } | null)?.code === 'PGRST205';
  const labelOf = (key: string) => (FLAG_TEXT[key] ? t(FLAG_TEXT[key].label) : key);

  const setRollout = async (key: string, rollout: Rollout) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('feature_flags')
        .update({
          disabled: rollout === 'off',
          enabled_for_all: rollout === 'everyone',
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('key', key)
        .select('key')
        .single();
      if (error) throw error;
      if (!data) throw new Error(t('admin.featureFlags.saveFailed'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] }),
        queryClient.invalidateQueries({ queryKey: ['feature-access'] }),
      ]);
      toast({ title: t(`admin.featureFlags.${rollout}Saved`, { feature: labelOf(key) }) });
    } catch (error) {
      toast({
        title: t('admin.featureFlags.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="feature-flags-heading">
      <h2 id="feature-flags-heading" className={TITLE}>{t('admin.featureFlags.title')}</h2>
      <p className="mb-5 mt-1 text-sm text-foreground/55">{t('admin.featureFlags.description')}</p>
      <div className="border-t border-foreground/[0.08]">
        {isLoading ? (
          <p className="py-4 text-sm text-foreground/55">{t('admin.featureFlags.loading')}</p>
        ) : isError || !flags ? (
          <div className="space-y-2 py-4 text-sm">
            <p className="text-foreground/55">
              {t(migrationPending ? 'admin.featureFlags.migrationPending' : 'admin.featureFlags.loadFailed')}
            </p>
            <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => void refetch()}>
              {t('admin.featureFlags.retry')}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-foreground/[0.06]">
            {flags.filter(flag => !(SELF_HOSTED && HOSTED_ONLY_FLAGS.has(flag.key))).map(flag => {
              const rollout = rolloutOf(flag);
              return (
                <div key={flag.key} className="flex items-center justify-between gap-8 py-4">
                  <div className="max-w-2xl">
                    <p className="text-sm font-medium">{labelOf(flag.key)}</p>
                    {FLAG_TEXT[flag.key] && <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/55">{t(FLAG_TEXT[flag.key].description)}</p>}
                    <p className={cn(LABEL, 'mt-2', rollout === 'everyone' && 'text-primary', rollout === 'off' && 'text-destructive/80')}>
                      {t(`admin.featureFlags.${rollout}Status`)}
                    </p>
                  </div>
                  <div role="radiogroup" aria-label={t('admin.featureFlags.whoCanUse', { feature: labelOf(flag.key) })}
                    className="flex shrink-0 gap-0.5 rounded-full bg-foreground/[0.05] p-0.5">
                    {ROLLOUTS.map(option => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={rollout === option}
                        disabled={saving}
                        onClick={() => rollout !== option && void setRollout(flag.key, option)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-50',
                          rollout === option ? 'bg-background text-foreground shadow-sm' : 'text-foreground/55 hover:text-foreground',
                        )}
                      >
                        {t(`admin.featureFlags.${option}`)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
