import { MapTrifold } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';

export function MapPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-white/70 gap-4">
      <MapTrifold weight="duotone" className="w-16 h-16" />
      <h2 className="text-xl font-mono font-normal">{t('map.comingSoon')}</h2>
      <p className="text-sm text-white/50">{t('map.comingSoonDesc')}</p>
    </div>
  );
}
