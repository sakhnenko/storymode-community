import { useEffect, useState } from 'react';
import { ClockCounterClockwise, ArrowCounterClockwise, Eye } from '@/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchContentSnapshots, type ContentSnapshot, type SnapshotEntityType } from '@/lib/content-snapshots';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface Props {
  entityType: SnapshotEntityType;
  entityId: string;
  onRestore: (snapshot: ContentSnapshot) => void | Promise<void>;
  className?: string;
  iconClassName?: string;
}

function fmtDay(day: string, today: (k: string) => string, yesterday: (k: string) => string) {
  try {
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const diff = Math.round((todayUTC.getTime() - dt.getTime()) / 86_400_000);
    if (diff === 0) return today('history.today');
    if (diff === 1) return yesterday('history.yesterday');
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return day; }
}

export function HistoryButton({ entityType, entityId, onRestore, className, iconClassName }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<ContentSnapshot[]>([]);
  const [pendingRestore, setPendingRestore] = useState<ContentSnapshot | null>(null);
  const [previewSnap, setPreviewSnap] = useState<ContentSnapshot | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    fetchContentSnapshots(entityType, entityId)
      .then(rows => { if (alive) setSnapshots(rows); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, entityType, entityId]);

  const fmt = (day: string) => fmtDay(day, t, t);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={t('history.editHistory')}
                className={cn('p-1.5 rounded-md transition-colors hover:bg-foreground/10', className)}
              >
                <ClockCounterClockwise weight="duotone" className={cn('w-4 h-4', iconClassName)} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">{t('history.editHistory')}</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-80 p-0 font-sans z-[70]">
          <div className="px-3 py-2 border-b border-foreground/10">
            <div className="text-[10px] font-sans uppercase tracking-[0.18em] opacity-60">{t('history.editHistory')}</div>
            <div className="text-[11px] opacity-60 mt-0.5 font-sans">{t('history.last3Days')}</div>
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {loading && <div className="px-3 py-4 text-xs opacity-60">{t('history.loading')}</div>}
            {!loading && snapshots.length === 0 && (
              <div className="px-3 py-4 text-xs opacity-60">{t('history.noHistory')}</div>
            )}
            {!loading && snapshots.map(s => (
              <div key={s.id} className="rounded-md px-3 py-2 hover:bg-foreground/5 transition-colors flex items-center justify-between gap-2">
                <span className="text-sm font-medium font-sans">{fmt(s.day)}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPreviewSnap(s)} className="inline-flex items-center gap-1 text-[10px] font-sans font-medium px-2 py-1 rounded hover:bg-foreground/10 transition-colors">
                    <Eye weight="bold" className="w-3 h-3" /> {t('history.preview')}
                  </button>
                  <button type="button" onClick={() => setPendingRestore(s)} className="inline-flex items-center gap-1 text-[10px] font-sans font-medium px-2 py-1 rounded hover:bg-foreground/10 transition-colors">
                    <ArrowCounterClockwise weight="bold" className="w-3 h-3" /> {t('history.restore')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!pendingRestore} onOpenChange={(o) => { if (!o) setPendingRestore(null); }}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans">{t('history.restoreTitle', { day: pendingRestore ? fmt(pendingRestore.day) : '' })}</AlertDialogTitle>
            <AlertDialogDescription className="font-sans">
              {t('history.restoreDescription', { day: pendingRestore ? fmt(pendingRestore.day) : t('history.today') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="font-sans" onClick={async () => { if (pendingRestore) await onRestore(pendingRestore); setPendingRestore(null); setOpen(false); }}>
              {t('history.restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!previewSnap} onOpenChange={(o) => { if (!o) setPreviewSnap(null); }}>
        <AlertDialogContent className="font-sans max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-sans">{previewSnap ? fmt(previewSnap.day) : ''} {t('history.previewSuffix')}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed opacity-90 border border-foreground/10 rounded-md p-3 bg-foreground/[0.02] font-sans">
            {previewSnap?.content ? <Markdown variant="notebook" content={previewSnap.content} readOnly /> : <span className="opacity-60">{t('history.empty')}</span>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-sans">{t('common.close')}</AlertDialogCancel>
            <AlertDialogAction className="font-sans" onClick={async () => { if (previewSnap) { const snap = previewSnap; setPreviewSnap(null); await onRestore(snap); setOpen(false); } }}>
              {t('history.restoreThisVersion')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
