import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, Play, SpinnerGap, Square, Warning, X } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { ADMIN_SCOPE, LABEL, PILL, PILL_PRIMARY, SURFACE, TABLE, TITLE } from '@/components/admin/admin-ui';
import { EditorUsageSection } from '@/components/admin/EditorUsageSection';
import {
  KINDS, chapterIds, checkReady, codexStatus, createProject, estimateCredits, findProject, listRuns, planRun, readChapter,
  regressions, runBenchmark, saveRun, setBaseline,
  type BenchConnection, type LiveResult, type RunOptions, type RunSummary,
} from '@/lib/editor-bench/live';
import { MODES, SPEEDS } from '@/lib/editor-bench/measure';
import { SCENARIOS } from '@/lib/editor-bench/scenarios';

const CREDITS_PER_CHAPTER = 10;
const BADGE = 'rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary';

const fmt = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString() : '–');
const secs = (ms: number | null | undefined) => (typeof ms === 'number' && Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '–');
const total = (summary: RunSummary, mode: string, pick: (row: RunSummary[string]) => number) =>
  Object.entries(summary).filter(([key]) => key.endsWith(`|${mode}`)).reduce((n, [, row]) => n + (Number.isFinite(pick(row)) ? pick(row) : 0), 0);

/** "text → memory", the memory value green when lower and red when higher. */
function Pair({ text, memory, format, higherIsBetter = false }: {
  text?: number; memory?: number; format: (n: number | undefined) => string; higherIsBetter?: boolean;
}) {
  const change = typeof text === 'number' && typeof memory === 'number' && text > 0 ? memory / text - 1 : 0;
  const better = higherIsBetter ? change > 0.05 : change < -0.05;
  const worse = higherIsBetter ? change < -0.05 : change > 0.05;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-foreground/55">{format(text)}</span> → {' '}
      <span className={cn(better && 'text-emerald-600 dark:text-emerald-400', worse && 'text-destructive')}>{format(memory)}</span>
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

/**
 * Admin tab that runs the AI editor benchmark against the deployed app as the
 * signed-in admin: sets up the test book, runs the chosen questions as the
 * text-only editor and with memory, and keeps every run, one as the baseline.
 */
export default function EditorBenchmarkSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const conn = useMemo<BenchConnection | null>(() => (user ? {
    url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, userId: user.id,
    token: async () => (await supabase.auth.getSession()).data.session?.access_token ?? '',
  } : null), [user]);

  const ready = useQuery({
    queryKey: ['editor-bench', 'ready', user?.id], enabled: !!conn, retry: false,
    queryFn: async () => { await checkReady(conn!); return true; },
  });
  const project = useQuery({
    queryKey: ['editor-bench', 'project', user?.id], enabled: !!conn && ready.isSuccess,
    queryFn: async () => {
      const id = await findProject(conn!);
      return id ? { id, ...(await codexStatus(conn!, id)) } : null;
    },
  });
  const runs = useQuery({ queryKey: ['editor-bench', 'runs', user?.id], enabled: !!conn && ready.isSuccess, queryFn: () => listRuns(conn!) });

  const [options, setOptions] = useState<RunOptions>({ speeds: ['thoughtful'], modes: [...MODES], kinds: ['book'], repeat: 1 });
  const plan = useMemo(() => planRun(options), [options]);
  const estimate = useMemo(() => estimateCredits(plan), [plan]);
  const [confirming, setConfirming] = useState<'run' | 'read' | null>(null);
  const [live, setLive] = useState<{ results: LiveResult[]; controller: AbortController } | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const failed = (error: unknown) => toast({
    title: t('admin.bench.failed'), description: error instanceof Error ? error.message : String(error), variant: 'destructive',
  });
  const refresh = (what: 'project' | 'runs') => queryClient.invalidateQueries({ queryKey: ['editor-bench', what] });
  const toggle = <K extends 'speeds' | 'modes' | 'kinds'>(key: K, all: readonly RunOptions[K][number][], value: RunOptions[K][number]) =>
    setOptions(o => {
      const chosen = new Set<string>(o[key]);
      if (chosen.has(value)) chosen.delete(value); else chosen.add(value);
      return { ...o, [key]: all.filter(v => chosen.has(v)) };
    });

  const create = async () => {
    setCreating(true);
    try { await createProject(conn!); await refresh('project'); } catch (error) { failed(error); } finally { setCreating(false); }
  };
  const readIntoCodex = async () => {
    const id = project.data?.id;
    if (!id) return;
    setReading({ done: 0, total: project.data!.total });
    try {
      const ids = [...(await chapterIds(conn!, id)).values()].filter((v): v is string => !!v);
      for (const [i, chapterId] of ids.entries()) {
        const read = await readChapter(conn!, id, chapterId);
        if (!read.ok) throw new Error(read.error || 'failed');
        setReading({ done: i + 1, total: ids.length });
      }
    } catch (error) { failed(error); } finally { setReading(null); await refresh('project'); }
  };
  const run = async () => {
    const controller = new AbortController();
    setLive({ results: [], controller });
    try {
      const { results, summary } = await runBenchmark(conn!, plan, {
        signal: controller.signal,
        onResult: result => setLive(current => current && { ...current, results: [...current.results, result] }),
      });
      const saved = await saveRun(conn!, { options, results, summary });
      await refresh('runs');
      setViewId(saved.id);
    } catch (error) { failed(error); } finally { setLive(null); }
  };
  const makeBaseline = async (id: string) => {
    try { await setBaseline(conn!, id); await refresh('runs'); toast({ title: t('admin.bench.baselineSet') }); } catch (error) { failed(error); }
  };

  const baseline = runs.data?.find(r => r.is_baseline);
  const viewed = runs.data?.find(r => r.id === viewId) ?? runs.data?.[0];
  const found = viewed && baseline && viewed.id !== baseline.id ? regressions(viewed.summary, baseline.summary) : [];
  const date = (iso: string) => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const busy = !!live || !!reading || creating;

  return (
    <div className="space-y-14">
    {conn && ready.isSuccess && <EditorUsageSection conn={conn} />}
    <section aria-labelledby="editor-bench-heading" className="space-y-6">
      <div>
        <h2 id="editor-bench-heading" className={TITLE}>{t('admin.bench.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-foreground/55">{t('admin.bench.description')}</p>
      </div>

      {ready.isError && (
        <p role="alert" className={cn(SURFACE, 'flex items-start gap-2 text-sm')}>
          <Warning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {(ready.error as Error).message}
        </p>
      )}

      {ready.isSuccess && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={SURFACE}>
            <h3 className={cn(LABEL, 'mb-3')}>{t('admin.bench.bookTitle')}</h3>
            {project.isLoading ? (
              <p className="text-sm text-foreground/55">{t('admin.bench.loading')}</p>
            ) : !project.data ? (
              <div className="space-y-3">
                <p className="text-sm">{t('admin.bench.bookNone')}</p>
                <Button size="sm" className={PILL_PRIMARY} onClick={() => void create()} disabled={busy}>{t('admin.bench.create')}</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">{t('admin.bench.bookStatus', { read: project.data.read, total: project.data.total })}</p>
                {reading ? (
                  <div className="space-y-1">
                    <Progress value={(reading.done / reading.total) * 100} />
                    <p className="text-xs text-foreground/55">{t('admin.bench.reading', { done: reading.done, total: reading.total })}</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {project.data.read < project.data.total && (
                      <Button size="sm" className={PILL_PRIMARY} onClick={() => setConfirming('read')} disabled={busy}>
                        {t('admin.bench.read', { credits: (project.data.total - project.data.read) * CREDITS_PER_CHAPTER })}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className={PILL} asChild>
                      <Link to={`/project/${project.data.id}?view=codex`}>{t('admin.bench.open')}</Link>
                    </Button>
                  </div>
                )}
                {project.data.read < project.data.total && !reading && (
                  <p className="text-xs text-foreground/55">{t('admin.bench.readHint')}</p>
                )}
              </div>
            )}
          </div>

          <div className={SURFACE}>
            <h3 className={cn(LABEL, 'mb-3')}>{t('admin.bench.runTitle')}</h3>
            <div className="grid grid-cols-3 gap-3">
              <fieldset className="space-y-1.5">
                <legend className={cn(LABEL, 'mb-1.5')}>{t('admin.bench.speed')}</legend>
                {SPEEDS.map(s => <Toggle key={s} label={t(`admin.bench.speeds.${s}`)} checked={options.speeds.includes(s)} onChange={() => toggle('speeds', SPEEDS, s)} />)}
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className={cn(LABEL, 'mb-1.5')}>{t('admin.bench.editor')}</legend>
                {MODES.map(m => <Toggle key={m} label={t(`admin.bench.modes.${m}`)} checked={options.modes.includes(m)} onChange={() => toggle('modes', MODES, m)} />)}
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className={cn(LABEL, 'mb-1.5')}>{t('admin.bench.questions')}</legend>
                {KINDS.map(k => (
                  <Toggle key={k} checked={options.kinds.includes(k)} onChange={() => toggle('kinds', KINDS, k)}
                    label={t(`admin.bench.kinds.${k}`, { count: SCENARIOS.filter(s => s.kind === k).length })} />
                ))}
              </fieldset>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-xs text-foreground/55">{t('admin.bench.repeat')}</span>
              {[1, 2, 3].map(n => (
                <Button key={n} size="sm" variant="ghost" aria-pressed={options.repeat === n}
                  className={cn('h-7 rounded-full px-2.5 text-xs font-normal', options.repeat === n ? 'bg-background text-foreground shadow-sm hover:bg-background' : 'text-foreground/60 hover:bg-transparent')}
                  onClick={() => setOptions(o => ({ ...o, repeat: n }))}>{n}×</Button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.08] pt-4">
              <span className="text-sm">{t('admin.bench.plan', { count: plan.length, credits: estimate })}</span>
              {live ? (
                <Button size="sm" variant="ghost" className={cn(PILL, 'gap-1.5')} onClick={() => live.controller.abort()}>
                  <Square className="h-3.5 w-3.5" /> {t('admin.bench.stop')}
                </Button>
              ) : (
                <Button size="sm" className={cn(PILL_PRIMARY, 'gap-1.5')} disabled={!plan.length || !project.data || busy} onClick={() => setConfirming('run')}>
                  <Play className="h-3.5 w-3.5" /> {t('admin.bench.run')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {live && (
        <div className={SURFACE} aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{t('admin.bench.progress', { done: live.results.length, total: plan.length })}</span>
            <span className="text-xs text-foreground/55">{t('admin.bench.keepOpen')}</span>
          </div>
          <Progress value={(live.results.length / Math.max(1, plan.length)) * 100} />
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs">
            {plan.map((item, i) => {
              const result = live.results[i];
              return (
                <li key={`${item.key}|${item.repeat}`} className={cn('flex items-center gap-2', !result && i > live.results.length && 'opacity-40')}>
                  {result ? (result.error || result.failedChecks.length
                    ? <X className="h-3.5 w-3.5 text-destructive" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />)
                    : i === live.results.length ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5" />}
                  <span>{item.key}{options.repeat > 1 ? ` #${item.repeat + 1}` : ''}</span>
                  {result && (
                    <span className="text-foreground/55">
                      {result.error ? result.error : t('admin.bench.timing', { first: secs(result.firstTextMs), total: secs(result.totalMs) })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {viewed && !live && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={TITLE}>
              {t('admin.bench.resultsTitle', { date: date(viewed.created_at) })}
              {viewed.is_baseline && <span className={cn(BADGE, 'ml-2 align-middle')}>{t('admin.bench.baseline')}</span>}
            </h3>
            {!viewed.is_baseline && <Button size="sm" variant="ghost" className={PILL} onClick={() => void makeBaseline(viewed.id)}>{t('admin.bench.setBaseline')}</Button>}
          </div>
          <p className="text-sm text-foreground/55">
            {t('admin.bench.totals', {
              text: fmt(total(viewed.summary, 'text', r => r.credits)), memory: fmt(total(viewed.summary, 'memory', r => r.credits)),
              textTokens: fmt(total(viewed.summary, 'text', r => r.inputTokens)), memoryTokens: fmt(total(viewed.summary, 'memory', r => r.inputTokens)),
            })}
          </p>
          {baseline && viewed.id !== baseline.id && (
            found.length ? (
              <div className="border-l-2 border-destructive/50 py-1 pl-4">
                <p className="mb-1 text-sm font-medium">{t('admin.bench.regressions', { count: found.length })}</p>
                <ul className="list-disc pl-5 text-sm">
                  {found.map(r => (
                    <li key={`${r.key}|${r.what}`}>
                      <span className="text-foreground/70">{r.key}</span>: {t(`admin.bench.what.${r.what}`)}
                      {r.what !== 'checks' && <> {r.what === 'firstTextMs' ? secs(r.before) : fmt(r.before)} → {r.what === 'firstTextMs' ? secs(r.after) : fmt(r.after)}</>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-sm text-emerald-700 dark:text-emerald-400">{t('admin.bench.noRegressions')}</p>
          )}
          <div className={cn('overflow-x-auto', TABLE)}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('admin.bench.col.question')}</TableHead>
                  <TableHead>{t('admin.bench.col.speed')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('admin.bench.col.context')}</TableHead>
                  <TableHead>{t('admin.bench.col.input')}</TableHead>
                  <TableHead>{t('admin.bench.col.output')}</TableHead>
                  <TableHead>{t('admin.bench.col.credits')}</TableHead>
                  <TableHead>{t('admin.bench.col.firstText')}</TableHead>
                  <TableHead>{t('admin.bench.col.total')}</TableHead>
                  <TableHead>{t('admin.bench.col.checks')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SCENARIOS.flatMap(s => SPEEDS.map(speed => {
                  const [text, memory] = MODES.map(mode => viewed.summary[`${s.id}|${speed}|${mode}`]);
                  if (!text && !memory) return null;
                  const check = (row?: RunSummary[string]) => !row ? '–' : row.passed ? t('admin.bench.pass') : t('admin.bench.fail');
                  // Why answers failed: an error, an empty answer, or what they didn't mention.
                  const why = MODES.flatMap(mode => viewed.results
                    .filter(r => r.key === `${s.id}|${speed}|${mode}` && (r.error || r.failedChecks.length))
                    .map(r => `${t(`admin.bench.modes.${mode}`)}: ${r.error || t('admin.bench.missing', { patterns: r.failedChecks.join(', ') })}`))
                    .join('\n');
                  return (
                    <TableRow key={`${s.id}|${speed}`}>
                      <TableCell className="whitespace-nowrap text-xs">{s.id}</TableCell>
                      <TableCell className="text-xs">{t(`admin.bench.speeds.${speed}`)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-foreground/55">{memory?.context ?? text?.context ?? '–'}</TableCell>
                      <TableCell className="text-xs"><Pair text={text?.inputTokens} memory={memory?.inputTokens} format={fmt} /></TableCell>
                      <TableCell className="text-xs"><Pair text={text?.outputTokens} memory={memory?.outputTokens} format={fmt} /></TableCell>
                      <TableCell className="text-xs"><Pair text={text?.credits} memory={memory?.credits} format={fmt} /></TableCell>
                      <TableCell className="text-xs"><Pair text={text?.firstTextMs} memory={memory?.firstTextMs} format={secs} /></TableCell>
                      <TableCell className="text-xs"><Pair text={text?.totalMs} memory={memory?.totalMs} format={secs} /></TableCell>
                      <TableCell title={why || undefined}
                        className={cn('whitespace-nowrap text-xs', (text && !text.passed) || (memory && !memory.passed) ? 'cursor-help text-destructive' : '')}>
                        {check(text)} → {check(memory)}
                      </TableCell>
                    </TableRow>
                  );
                }))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-foreground/55">{t('admin.bench.legend')}</p>
        </div>
      )}

      {ready.isSuccess && (
        <div className="space-y-2">
          <h3 className={TITLE}>{t('admin.bench.historyTitle')}</h3>
          {!runs.data?.length ? (
            <p className="text-sm text-foreground/55">{runs.isLoading ? t('admin.bench.loading') : t('admin.bench.noRuns')}</p>
          ) : (
            <div className={cn('overflow-x-auto', TABLE)}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('admin.bench.col.date')}</TableHead>
                    <TableHead>{t('admin.bench.col.requests')}</TableHead>
                    <TableHead>{t('admin.bench.col.setup')}</TableHead>
                    <TableHead>{t('admin.bench.col.credits')}</TableHead>
                    <TableHead>{t('admin.bench.col.checks')}</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.data.map(r => {
                    const rows = Object.values(r.summary);
                    return (
                      <TableRow key={r.id} className={cn(viewed?.id === r.id && 'bg-foreground/[0.04] hover:bg-foreground/[0.04]')} aria-current={viewed?.id === r.id || undefined}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {date(r.created_at)}
                          {r.is_baseline && <span className={cn(BADGE, 'ml-2')}>{t('admin.bench.baseline')}</span>}
                        </TableCell>
                        <TableCell className="text-xs">{r.results.length}</TableCell>
                        <TableCell className="text-xs text-foreground/55">
                          {r.options.speeds.map(s => t(`admin.bench.speeds.${s}`)).join(', ')} · {r.options.kinds.map(k => t(`admin.bench.kinds.${k}`, { count: SCENARIOS.filter(s => s.kind === k).length })).join(', ')}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{fmt(rows.reduce((n, row) => n + (Number.isFinite(row.credits) ? row.credits : 0), 0))}</TableCell>
                        <TableCell className="text-xs tabular-nums">{rows.filter(row => row.passed).length}/{rows.length}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className={cn(PILL, 'h-7')} onClick={() => setViewId(r.id)}>{t('admin.bench.view')}</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={open => !open && setConfirming(null)}>
        <AlertDialogContent className={ADMIN_SCOPE}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'read'
                ? t('admin.bench.confirmReadTitle')
                : t('admin.bench.confirmRunTitle', { credits: estimate })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'read' ? t('admin.bench.confirmReadBody') : t('admin.bench.confirmRunBody', { count: plan.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const action = confirming;
              setConfirming(null);
              if (action === 'read') void readIntoCodex(); else void run();
            }}>{t('admin.bench.spend')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
    </div>
  );
}
