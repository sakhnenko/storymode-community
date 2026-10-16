import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Globe, Lock } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';

interface ProjectVisibilityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle: string;
  isPublic?: boolean;
  onPublicChange?: (checked: boolean) => void;
}

export function ProjectVisibilityModal({
  open,
  onOpenChange,
  projectTitle,
  isPublic = false,
  onPublicChange,
}: ProjectVisibilityModalProps) {
  const { t } = useTranslation();

  const options = [
    {
      key: false,
      icon: Lock,
      label: t('share.privateAccess'),
      hint: t('share.onlyYouCanView'),
    },
    {
      key: true,
      icon: Globe,
      label: t('share.publicAccess'),
      hint: t('share.anyoneCanView'),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('share.visibilityTitle')}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t('share.visibilityDescription', { title: projectTitle })}
          </p>
        </DialogHeader>

        {onPublicChange && (
          <div className="space-y-3">
            <div className="flex items-center gap-1 rounded-full bg-black/[0.03] p-1 shadow-[inset_0_1px_3px_0_hsl(0_0%_0%/0.1),inset_0_1px_1px_0_hsl(0_0%_0%/0.06)]">
              {options.map(({ key, icon: Icon, label }) => {
                const active = isPublic === key;
                return (
                  <button
                    key={String(key)}
                    type="button"
                    onClick={() => onPublicChange(key)}
                    className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-200 ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_0_18px_-2px_hsl(var(--primary)/0.55),inset_0_1px_0_0_hsl(0_0%_100%/0.18)] ring-1 ring-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-black/5'
                    }`}
                  >
                    <Icon weight={active ? 'fill' : 'duotone'} className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              {isPublic ? t('share.anyoneCanView') : t('share.onlyYouCanView')}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

