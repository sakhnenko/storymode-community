import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LABEL, PILL, PILL_PRIMARY, TITLE } from '@/components/admin/admin-ui';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Self-hosted installs: whether anyone can create an account, or only the
 * addresses added here. The database enforces it (signup_settings).
 */
export function SignupsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');

  const { data: settings, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-signup-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('signup_settings').select('open, allowed_emails').maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  const save = async (update: Pick<TablesUpdate<'signup_settings'>, 'open' | 'allowed_emails'>) => {
    if (!user || saving) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from('signup_settings')
        .update({ ...update, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq('singleton', true);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['admin-signup-settings'] });
      return true;
    } catch (error) {
      toast({
        title: t('admin.signups.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    if (!settings) return;
    const email = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      toast({ title: t('auth.validEmail'), variant: 'destructive' });
      return;
    }
    if (settings.allowed_emails.some(e => e.toLowerCase() === email)) {
      setDraft('');
      return;
    }
    if (await save({ allowed_emails: [...settings.allowed_emails, email] })) setDraft('');
  };

  const remove = (email: string) => {
    if (!settings) return;
    void save({ allowed_emails: settings.allowed_emails.filter(e => e !== email) });
  };

  return (
    <section aria-labelledby="signups-heading" className="mb-12">
      <h2 id="signups-heading" className={TITLE}>{t('admin.signups.title')}</h2>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-foreground/55">{t('admin.signups.description')}</p>
      <div className="border-t border-foreground/[0.08]">
        {isLoading ? (
          <p className="py-4 text-sm text-foreground/55">{t('admin.signups.loading')}</p>
        ) : isError ? (
          <div className="space-y-2 py-4 text-sm">
            <p className="text-foreground/55">{t('admin.signups.loadFailed')}</p>
            <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => void refetch()}>
              {t('admin.featureFlags.retry')}
            </button>
          </div>
        ) : !settings ? (
          <p className="py-4 text-sm text-foreground/55">{t('admin.signups.notSetUp')}</p>
        ) : (
          <div className="divide-y divide-foreground/[0.06]">
            <div className="flex items-center justify-between gap-8 py-4">
              <div className="max-w-2xl">
                <p className="text-sm font-medium">{t('admin.signups.whoLabel')}</p>
                <p className={cn('mt-0.5 text-[13px] leading-relaxed', settings.open ? 'text-destructive' : 'text-foreground/55')}>
                  {settings.open ? t('admin.signups.openDescription') : t('admin.signups.closedDescription')}
                </p>
              </div>
              <div role="radiogroup" aria-label={t('admin.signups.whoLabel')}
                className="flex shrink-0 gap-0.5 rounded-full bg-foreground/[0.05] p-0.5">
                {([false, true] as const).map(open => (
                  <button
                    key={String(open)}
                    type="button"
                    role="radio"
                    aria-checked={settings.open === open}
                    disabled={saving}
                    onClick={() => { if (settings.open !== open) void save({ open }); }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-50',
                      settings.open === open ? 'bg-background text-foreground shadow-sm' : 'text-foreground/55 hover:text-foreground',
                    )}
                  >
                    {open ? t('admin.signups.open') : t('admin.signups.closed')}
                  </button>
                ))}
              </div>
            </div>

            <div className="py-4">
              <p className="text-sm font-medium">{t('admin.signups.allowedTitle')}</p>
              <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-foreground/55">{t('admin.signups.allowedDescription')}</p>
              <form
                className="mt-3 flex max-w-md gap-2"
                onSubmit={e => { e.preventDefault(); void add(); }}
              >
                <Input
                  type="email"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  aria-label={t('admin.signups.addLabel')}
                  className="h-8 rounded-full text-sm"
                />
                <Button type="submit" className={PILL_PRIMARY} disabled={saving || !draft.trim()}>
                  {t('admin.signups.add')}
                </Button>
              </form>
              {settings.allowed_emails.length === 0 ? (
                <p className={cn(LABEL, 'mt-4')}>{t('admin.signups.noneAllowed')}</p>
              ) : (
                <ul className="mt-3 max-w-md divide-y divide-foreground/[0.06]">
                  {settings.allowed_emails.map(email => (
                    <li key={email} className="flex items-center justify-between gap-4 py-2 text-sm">
                      <span className="truncate">{email}</span>
                      <Button type="button" variant="ghost" className={PILL} disabled={saving} onClick={() => remove(email)}>
                        {t('admin.signups.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default SignupsSection;
