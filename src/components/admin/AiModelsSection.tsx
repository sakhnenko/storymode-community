import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { LABEL, TITLE } from '@/components/admin/admin-ui';
import { cn } from '@/lib/utils';
import {
  FAMILY_MODELS, IMAGE_MODELS, normalizeModelSettings,
  type ImageFamily, type ModelFamily, type ModelSettings,
} from '../../../supabase/functions/_shared/model-catalog';

const FAMILIES: ModelFamily[] = ['google', 'openai', 'anthropic'];
const IMAGE_FAMILIES: ImageFamily[] = ['google', 'openai'];
const TIERS = ['fast', 'thoughtful', 'creative'] as const;

/** "google/gemini-3.1-pro-preview" → "gemini-3.1-pro-preview". */
const modelName = (id: string) => id.slice(id.indexOf('/') + 1);

type Check = { ok: boolean; model?: string; ownKey?: boolean; error?: string };

/**
 * Self-hosted installs on OpenRouter: which provider family serves each tier,
 * and a check per family that says whether it works and whose key pays.
 */
export function AiModelsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Partial<Record<ModelFamily, Check | 'running'>>>({});

  const { data: settings, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-ai-model-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_model_settings').select('fast, thoughtful, creative, images').maybeSingle();
      if (error) throw error;
      return normalizeModelSettings(data);
    },
    retry: false,
  });

  const choose = async (key: keyof ModelSettings, family: ModelFamily) => {
    if (!user || saving || !settings || settings[key] === family) return;
    setSaving(true);
    try {
      const update: TablesUpdate<'ai_model_settings'> = { updated_at: new Date().toISOString(), updated_by: user.id };
      update[key] = family;
      const { error } = await supabase.from('ai_model_settings').update(update).eq('singleton', true);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['admin-ai-model-settings'] });
      toast({ title: t('admin.aiModels.saved') });
    } catch (error) {
      toast({
        title: t('admin.aiModels.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const check = async (family: ModelFamily) => {
    setChecks(prev => ({ ...prev, [family]: 'running' }));
    const { data, error } = await supabase.functions.invoke('ai-models-check', { body: { family } });
    const result: Check = error ? { ok: false, error: error.message } : (data as Check);
    setChecks(prev => ({ ...prev, [family]: result }));
  };

  const picker = <F extends ModelFamily>(key: keyof ModelSettings, options: F[], current: F) => (
    <div role="radiogroup" aria-label={t(`admin.aiModels.${key}`)}
      className="flex shrink-0 gap-0.5 rounded-full bg-foreground/[0.05] p-0.5">
      {options.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={current === option}
          disabled={saving}
          onClick={() => void choose(key, option)}
          className={cn(
            'rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-50',
            current === option ? 'bg-background text-foreground shadow-sm' : 'text-foreground/55 hover:text-foreground',
          )}
        >
          {t(`admin.aiModels.family.${option}`)}
        </button>
      ))}
    </div>
  );

  return (
    <section aria-labelledby="ai-models-heading">
      <h2 id="ai-models-heading" className={TITLE}>{t('admin.aiModels.title')}</h2>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-foreground/55">{t('admin.aiModels.description')}</p>
      <div className="border-t border-foreground/[0.08]">
        {isLoading ? (
          <p className="py-4 text-sm text-foreground/55">{t('admin.aiModels.loading')}</p>
        ) : isError || !settings ? (
          <div className="space-y-2 py-4 text-sm">
            <p className="text-foreground/55">{t('admin.aiModels.loadFailed')}</p>
            <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => void refetch()}>
              {t('admin.featureFlags.retry')}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-foreground/[0.06]">
            {TIERS.map(tier => (
              <div key={tier} className="flex items-center justify-between gap-8 py-4">
                <div className="max-w-2xl">
                  <p className="text-sm font-medium">{t(`admin.aiModels.${tier}`)}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/55">{t(`admin.aiModels.${tier}Description`)}</p>
                  <p className={cn(LABEL, 'mt-2')}>{modelName(FAMILY_MODELS[settings[tier]][tier])}</p>
                </div>
                {picker(tier, FAMILIES, settings[tier])}
              </div>
            ))}
            <div className="flex items-center justify-between gap-8 py-4">
              <div className="max-w-2xl">
                <p className="text-sm font-medium">{t('admin.aiModels.images')}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/55">{t('admin.aiModels.imagesDescription')}</p>
                <p className={cn(LABEL, 'mt-2')}>{modelName(IMAGE_MODELS[settings.images])}</p>
              </div>
              {picker('images', IMAGE_FAMILIES, settings.images)}
            </div>
          </div>
        )}
      </div>

      <h3 className="mt-10 text-sm font-medium">{t('admin.aiModels.checkTitle')}</h3>
      <p className="mb-3 mt-1 max-w-2xl text-[13px] leading-relaxed text-foreground/55">{t('admin.aiModels.checkDescription')}</p>
      <div className="divide-y divide-foreground/[0.06] border-t border-foreground/[0.08]">
        {FAMILIES.map(family => {
          const result = checks[family];
          return (
            <div key={family} className="flex items-center justify-between gap-8 py-3">
              <div className="min-w-0 text-sm">
                <span className="font-medium">{t(`admin.aiModels.family.${family}`)}</span>
                {result && result !== 'running' && (
                  <span className={cn('ml-3 text-[13px]', result.ok ? 'text-foreground/70' : 'text-destructive/80')}>
                    {result.ok
                      ? t(result.ownKey ? 'admin.aiModels.checkOwnKey' : 'admin.aiModels.checkCredit')
                      : t('admin.aiModels.checkFailed', { error: result.error ?? '' })}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={result === 'running'}
                onClick={() => void check(family)}
                className="shrink-0 rounded-full border border-foreground/[0.12] px-3 py-1 text-xs text-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
              >
                {result === 'running' ? t('admin.aiModels.checking') : t('admin.aiModels.check')}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
