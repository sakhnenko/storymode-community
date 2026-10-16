import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { MemoryChapter } from '../../../supabase/functions/_shared/project-memory';
import { CREDITS_PER_CHAPTER, catchUpReason, type CatchUpReason } from './codex-meta';
import { readingProgress, type ReadingStatus } from './useCodexReading';

const GROUPS: CatchUpReason[] = ['edited', 'new', 'format'];
const SHORT_ERRORS = new Set(['busy', 'credits', 'empty', 'tooLong']);

/**
 * Sidebar listing the chapters whose memory is behind (edited since they were
 * read, never read, or read in an older format), and reads the chosen ones:
 * the chapter being read burns in the brand color while what it finds flies out.
 */
export function CodexCatchUp({ chapters, reading, splash, panelStyle, dividerStyle, onStart, onStop, onOpenChapter, onOpenSettings, onClose }: {
  chapters: MemoryChapter[];
  reading: {
    statuses: Record<string, ReadingStatus>;
    current: string | null;
    running: boolean;
    stopping: boolean;
    halted: string;
  };
  splash: number;
  panelStyle: React.CSSProperties;
  dividerStyle: React.CSSProperties;
  onStart: (chapterIds: string[]) => void;
  onStop: () => void;
  onOpenChapter: (chapterId: string) => void;
  /** Only for admins, who can change the memory settings. */
  onOpenSettings?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const { statuses, current, running, stopping, halted } = reading;
  // Ticks the progress bar along while a passage is read.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(id);
  }, [running]);

  const behind = useMemo(() => chapters.map(chapter => ({ chapter, reason: catchUpReason(chapter) })), [chapters]);
  const pending = behind.filter(b => b.reason).map(b => b.chapter);
  const selected = pending.filter(c => !skipped.has(c.id));
  const readNow = behind.filter(b => !b.reason && statuses[b.chapter.id]).map(b => b.chapter);
  const queue = chapters.filter(c => statuses[c.id]);
  const currentChapter = chapters.find(c => c.id === current);
  const currentStatus = current ? statuses[current] : undefined;

  const statusLine = (chapter: MemoryChapter, reason: CatchUpReason | null) => {
    const status = statuses[chapter.id];
    if (!status) return reason ? t(`codex.catchUp.reason.${reason}`) : '';
    if (status.state === 'reading') return t('codex.catchUp.reading', { count: status.found });
    if (status.state === 'waiting') return t('codex.catchUp.waiting');
    if (status.state === 'cached') return t('codex.catchUp.cached');
    if (status.state === 'done') return t('codex.catchUp.done', { count: status.count ?? 0 });
    const code = status.error || 'failed';
    return t(`codex.catchUp.errors.${SHORT_ERRORS.has(code) ? code : 'failed'}`);
  };
  const toggle = (id: string) => setSkipped(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const row = (chapter: MemoryChapter, reason: CatchUpReason | null) => {
    const status = statuses[chapter.id];
    const selectable = !!reason && !running;
    return (
      <li key={chapter.id} data-reading-source={status?.state === 'reading' || undefined}
        className={cn('flex items-start gap-3 rounded-lg px-3 py-2 transition-colors', status?.state === 'reading' && 'codex-burning shadow-sm')}>
        {status?.state === 'reading' && (
          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-white/80 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(readingProgress(status, now) * 100)}%` }} />
        )}
        {status?.state === 'reading' && splash > 0 && (
          <span key={splash} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-white"
            style={{ animation: 'codex-flare 0.5s ease-out forwards' }} />
        )}
        {reason ? (
          <input type="checkbox" className="mt-1 shrink-0 accent-[hsl(var(--codex-brand))]" checked={!skipped.has(chapter.id)}
            disabled={!selectable} onChange={() => toggle(chapter.id)} aria-label={chapter.title || t('story.infoUntitled')} />
        ) : <span aria-hidden="true" className="mt-0.5 w-[13px] shrink-0 text-center text-[11px] opacity-50">✓</span>}
        <div className="min-w-0 flex-1">
          <button type="button" title={t('memory.openChapter')} onClick={() => onOpenChapter(chapter.id)}
            className="block max-w-full truncate text-left text-[13px] underline-offset-2 hover:underline">
            {chapter.title || t('story.infoUntitled')}
          </button>
          <p className={cn('text-[11px]', status?.state === 'failed' ? 'text-destructive' : status?.state === 'reading' ? 'opacity-80' : 'opacity-50')}>
            {statusLine(chapter, reason)}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="h-full shrink-0 rounded-md p-px story-panel-border max-md:absolute max-md:inset-3 max-md:z-20 max-md:h-auto">
      <aside aria-label={t('codex.catchUp.title')} className="relative flex h-full w-[420px] flex-col overflow-hidden rounded-[5px] shadow-sm max-md:w-full"
        style={panelStyle}>
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-4" style={dividerStyle}>
          <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">{t('codex.catchUp.title')}</span>
          <Button size="icon" variant="ghost" className="-mr-2 h-7 w-7" onClick={onClose} aria-label={t('common.close')}>
            <X weight="bold" className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="px-3 pb-4 pt-2">
            <p className="text-sm font-medium" aria-live="polite">
              {running && currentChapter
                ? t('codex.catchUp.readingTitle', { title: currentChapter.title || t('story.infoUntitled') })
                : pending.length ? t('codex.catchUp.behind', { count: pending.length }) : t('codex.catchUp.upToDate')}
            </p>
            {running && currentStatus && (
              <p className="text-xs opacity-50">{t('codex.catchUp.progress', { found: currentStatus.found, facts: currentStatus.facts })}</p>
            )}
            {!running && !pending.length && !readNow.length && <p className="text-xs opacity-50">{t('codex.catchUp.upToDateHint')}</p>}
          </div>
          {halted && <p role="alert" className="mx-3 mb-3 text-xs text-destructive">{t(`memory.errors.${halted}`, { defaultValue: t('memory.errors.failed') })}</p>}
          {pending.length > 1 && (
            <label className="mb-2 flex cursor-pointer items-center gap-3 px-3 py-1 text-xs opacity-70 hover:opacity-100">
              <input type="checkbox" className="shrink-0 accent-[hsl(var(--codex-brand))]" disabled={running}
                checked={selected.length === pending.length}
                ref={el => { if (el) el.indeterminate = selected.length > 0 && selected.length < pending.length; }}
                onChange={() => setSkipped(selected.length === pending.length ? new Set(pending.map(c => c.id)) : new Set())} />
              {t('codex.catchUp.selectAll', { count: pending.length })}
            </label>
          )}
          {readNow.length > 0 && (
            <section className="mb-3">
              <h3 className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.18em] opacity-40">{t('codex.catchUp.readNow')}</h3>
              <ul>{readNow.map(chapter => row(chapter, null))}</ul>
            </section>
          )}
          {GROUPS.map(reason => {
            const list = behind.filter(b => b.reason === reason).map(b => b.chapter);
            if (!list.length) return null;
            return (
              <section key={reason} className="mb-3">
                <h3 className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.18em] opacity-40">
                  {t(`codex.catchUp.group.${reason}`)} <span className="opacity-70">{list.length}</span>
                </h3>
                <ul>{list.map(chapter => row(chapter, reason))}</ul>
              </section>
            );
          })}
        </div>
        <div className="shrink-0 space-y-2 border-t px-4 py-3" style={dividerStyle}>
          {running ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs opacity-50">
                {t('codex.catchUp.position', { index: queue.findIndex(c => c.id === current) + 1, total: queue.length })}
              </span>
              <Button size="sm" variant="ghost" className="h-8 font-sans text-xs" disabled={stopping} onClick={onStop}>
                {t(stopping ? 'codex.catchUp.stopping' : 'codex.catchUp.stop')}
              </Button>
            </div>
          ) : (
            <Button className="h-9 w-full font-sans" disabled={!selected.length} onClick={() => onStart(selected.map(c => c.id))}>
              {t('codex.catchUp.read', { count: selected.length, credits: selected.length * CREDITS_PER_CHAPTER })}
            </Button>
          )}
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="opacity-45">{t('codex.catchUp.costHint')}</span>
            {onOpenSettings && (
              <button type="button" onClick={onOpenSettings} className="shrink-0 underline-offset-2 opacity-60 hover:underline hover:opacity-100">
                {t('codex.catchUp.settings')}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
