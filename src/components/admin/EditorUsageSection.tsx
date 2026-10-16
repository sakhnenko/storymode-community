import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { editorUsage, type BenchConnection } from '@/lib/editor-bench/live';
import { TABLE, TITLE } from '@/components/admin/admin-ui';

const SPEED_ORDER = ['fast', 'thoughtful', 'creative'];
const CONTEXT_ORDER = ['selection', 'chapter', 'book-focused', 'book-full'];

const num = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString() : '–');
const secs = (ms: number | null | undefined) => (typeof ms === 'number' && Number.isFinite(ms) ? `${(Number(ms) / 1000).toFixed(1)}s` : '–');

/**
 * What writers' real AI editor answers cost and how fast they came, per
 * speed, kind of question and model, from what each charge records. Free:
 * it reads answers that happened anyway.
 */
export function EditorUsageSection({ conn }: { conn: BenchConnection }) {
  const { t } = useTranslation();
  const [days, setDays] = useState(7);
  const usage = useQuery({ queryKey: ['editor-usage', days], queryFn: () => editorUsage(conn, days) });
  const rows = [...(usage.data || [])].sort((a, b) =>
    SPEED_ORDER.indexOf(a.speed ?? '') - SPEED_ORDER.indexOf(b.speed ?? '')
    || CONTEXT_ORDER.indexOf(a.context ?? '') - CONTEXT_ORDER.indexOf(b.context ?? '')
    || (a.tiers < b.tiers ? -1 : 1));

  return (
    <section aria-labelledby="editor-usage-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="editor-usage-heading" className={TITLE}>{t('admin.usage.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-foreground/55">{t('admin.usage.description')}</p>
        </div>
        <div className="inline-flex gap-0.5 rounded-full bg-foreground/[0.05] p-0.5 text-xs" role="group" aria-label={t('admin.usage.period')}>
          {[7, 30].map(d => (
            <Button key={d} size="sm" variant="ghost" aria-pressed={days === d} onClick={() => setDays(d)}
              className={cn('h-7 rounded-full px-3 text-xs font-normal', days === d ? 'bg-background text-foreground shadow-sm hover:bg-background' : 'text-foreground/60 hover:bg-transparent')}>
              {t('admin.usage.days', { count: d })}
            </Button>
          ))}
        </div>
      </div>
      {usage.isError ? (
        <p className="text-sm text-foreground/55">{(usage.error as Error).message}</p>
      ) : !rows.length ? (
        <p className="text-sm text-foreground/55">{usage.isLoading ? t('admin.bench.loading') : t('admin.usage.none')}</p>
      ) : (
        <div className={cn('overflow-x-auto', TABLE)}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('admin.bench.col.speed')}</TableHead>
                <TableHead>{t('admin.usage.col.kind')}</TableHead>
                <TableHead>{t('admin.usage.col.model')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.answers')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.credits')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.firstText')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.input')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.output')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.empty')}</TableHead>
                <TableHead className="text-right">{t('admin.usage.col.cached')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={`${r.speed}|${r.context}|${r.model}|${r.tiers}`}>
                  <TableCell className="whitespace-nowrap text-xs">{r.speed ? t(`admin.bench.speeds.${r.speed}`, { defaultValue: r.speed }) : '–'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{t(`admin.usage.kinds.${r.context}`, { defaultValue: r.context ?? '–' })}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-foreground/55">
                    {r.model?.replace(/^.*\//, '') ?? '–'}
                    {r.tiers === 'current' && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] text-primary">{t('admin.usage.newTiers')}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                    {num(r.answers)} <span className="text-foreground/45">· {t('admin.usage.writers', { count: Number(r.writers) })}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                    {num(r.median_credits)} <span className="text-foreground/45">· {num(r.credits)}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                    {secs(r.median_first_text_ms)} <span className="text-foreground/45">· {secs(r.p95_first_text_ms)}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{num(r.median_input_tokens)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{num(r.median_output_tokens)}</TableCell>
                  <TableCell className={cn('text-right text-xs tabular-nums', Number(r.empty_answers) > 0 && 'text-destructive')}>{num(r.empty_answers)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{r.cached_share == null ? '–' : `${Math.round(Number(r.cached_share) * 100)}%`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs leading-relaxed text-foreground/45">{t('admin.usage.legend')}</p>
    </section>
  );
}
