import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Sparkle, CreditCard } from '@/components/ui/icons';
import { PLAN_LIMITS, useUserPlan } from '@/hooks/useUserPlan';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  limitType: 'project' | 'folio' | 'map';
}

export function UpgradeModal({ open, onClose, limitType }: UpgradeModalProps) {
  const { t } = useTranslation();
  const { startCheckout } = useUserPlan();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const limit = limitType === 'project'
    ? PLAN_LIMITS.draft.maxProjects
    : limitType === 'folio'
    ? PLAN_LIMITS.draft.maxFolios
    : PLAN_LIMITS.draft.maxMaps;

  const singular = t(`upgrade.limitSingular.${limitType}`);
  const plural = t(`upgrade.limitPlural.${limitType}`);
  const labelTitle = singular.charAt(0).toUpperCase() + singular.slice(1);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      await startCheckout('manuscript');
      onClose();
    } catch (err: any) {
      toast({ title: t('upgrade.errorCheckout'), description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md border-border bg-background">
        <DialogHeader className="text-center items-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <Lock weight="duotone" className="w-7 h-7 text-primary" />
          </div>
          <DialogTitle className="text-lg font-mono font-normal">
            {t('upgrade.limitReachedTitle', { label: labelTitle })}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-2">
            {t('upgrade.beginnerAllows', { count: limit, label: limit === 1 ? singular : plural })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkle weight="duotone" className="w-4 h-4 text-primary" />
            {t('upgrade.storytellerPlanLine')}
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
            <li>{t('upgrade.unlimitedProjects')}</li>
            <li>{t('upgrade.unlimitedFolios')}</li>
            <li>{t('upgrade.unlimitedMaps')}</li>
          </ul>
        </div>

        <div className="flex gap-2 justify-center mt-4">
          <Button variant="outline" onClick={onClose} className="font-mono font-normal">
            {t('upgrade.maybeLater')}
          </Button>
          <Button onClick={handleUpgrade} disabled={loading} className="gap-2 font-mono font-normal">
            <CreditCard weight="duotone" className="w-4 h-4" />
            {loading ? t('upgrade.opening') : t('upgrade.upgradeButton')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
