import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CaretRight } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isExcluded, type FactGroup, type GraphFact } from '../../../supabase/functions/_shared/memory-graph';
import { SURFACE } from './codex-meta';

type Edit = (chapterId: string, key: string, disposition: string, correction?: string) => Promise<void>;

/**
 * One fact in the Codex sidebar: just what it adds, until opened to show
 * where it comes from and to correct or exclude it. Facts count as accepted
 * until the author says otherwise, so there is no confirm step.
 */
export function CodexFact({ group, edit, onOpenChapter, onEditingChange }: {
  group: FactGroup;
  edit: Edit;
  onOpenChapter: (chapterId: string, quote?: string) => void;
  onEditingChange: (key: string, editing: boolean) => void;
}) {
  const { t } = useTranslation();
  const { fact, text, repeats } = group;
  const { claim, override } = fact;
  const key = `${fact.chapter.id}-${claim.key}`;
  const excluded = isExcluded(fact);
  const corrected = override?.disposition === 'corrected';
  const sources = [fact, ...repeats];
  const stale = sources.every(f => f.stale);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    onEditingChange(key, editing || busy);
    return () => onEditingChange(key, false);
  }, [key, editing, busy, onEditingChange]);

  const change = async (facts: GraphFact[], disposition: string, value = '') => {
    setBusy(true); setFailed(false);
    try {
      for (const f of facts) await edit(f.chapter.id, f.claim.key, disposition, value);
      setEditing(false);
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const details = [
    t(`memory.basis.${claim.basis}`),
    claim.time && claim.time !== 'unknown' ? t(`memory.time.${claim.time}`) : '',
    claim.scope,
    corrected ? t('memory.status.corrected') : '',
    stale ? t('codex.outOfDate') : '',
  ].filter(Boolean).join(' · ');

  return (
    <li className={cn('rounded-lg transition-colors', open ? 'bg-[hsl(var(--notepad-fg)/0.055)]' : SURFACE)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 rounded-lg px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--notepad-fg)/0.3)]">
        <span className={cn('min-w-0 flex-1 text-[13px] leading-relaxed', excluded && 'line-through opacity-45')}>
          {text}
          {stale && <span className="sr-only"> ({t('codex.factOutOfDate')})</span>}
        </span>
        {stale && !excluded && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            </TooltipTrigger>
            <TooltipContent side="top">{t('codex.stale.fact', { chapter: fact.chapter.title || t('story.infoUntitled') })}</TooltipContent>
          </Tooltip>
        )}
        <CaretRight weight="bold" aria-hidden="true"
          className={cn('mt-1.5 h-3 w-3 shrink-0 opacity-35 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="space-y-3 px-3.5 pb-3 text-xs">
          <p className="opacity-50">{details}</p>
          {corrected && <p className="leading-relaxed opacity-60">{t('memory.original')}: {claim.statement}</p>}
          {sources.map(source => (
            <figure key={`${source.chapter.id}-${source.claim.key}`}>
              <blockquote className="whitespace-pre-wrap border-l-2 border-[hsl(var(--notepad-fg)/0.12)] pl-3 italic leading-relaxed opacity-70">
                {source.claim.quote}
              </blockquote>
              <figcaption className="mt-1 pl-3 text-[11px]">
                <button type="button" title={t('memory.openChapter')} onClick={() => onOpenChapter(source.chapter.id, source.claim.quote)}
                  className="opacity-50 underline-offset-2 hover:underline hover:opacity-90">
                  {source.chapter.title || t('story.infoUntitled')}
                </button>
              </figcaption>
            </figure>
          ))}
          {editing ? (
            <div className="space-y-2">
              <label className="sr-only" htmlFor={`correction-${key}`}>{t('memory.correction')}</label>
              <Textarea id={`correction-${key}`} value={correction} onChange={e => setCorrection(e.target.value)} maxLength={2000}
                disabled={busy} autoFocus className="min-h-20 bg-transparent text-[13px]" />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 px-2.5 font-sans text-xs" disabled={busy || !correction.trim()}
                  onClick={() => void change([fact], 'corrected', correction.trim())}>{t('common.save')}</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 font-sans text-xs" disabled={busy}
                  onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
              </div>
            </div>
          ) : (
            <div className="-mx-2 flex flex-wrap gap-0.5">
              {excluded ? (
                <Button size="sm" variant="ghost" className="h-7 px-2 font-sans text-xs" disabled={busy}
                  onClick={() => void change([fact], 'extracted')}>{t('memory.restore')}</Button>
              ) : <>
                <Button size="sm" variant="ghost" className="h-7 px-2 font-sans text-xs" disabled={busy}
                  onClick={() => { setCorrection(corrected ? override!.correction : claim.statement); setEditing(true); }}>
                  {t('memory.correct')}
                </Button>
                {/* Its repeats go too, or the next one would take its place. */}
                <Button size="sm" variant="ghost" className="h-7 px-2 font-sans text-xs" disabled={busy}
                  onClick={() => void change(sources, 'excluded')}>{t('memory.exclude')}</Button>
                {corrected && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 font-sans text-xs" disabled={busy}
                    onClick={() => void change([fact], 'extracted')}>{t('memory.resetFact')}</Button>
                )}
              </>}
            </div>
          )}
          {failed && <p role="alert" className="text-destructive">{t('memory.saveFailed')}</p>}
        </div>
      )}
    </li>
  );
}
