import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_SCOPE, LABEL, TABLE } from '@/components/admin/admin-ui';

type Range = 'week' | 'month' | 'year';

interface Props {
  user: { id: string; email: string; display_name: string | null; plan: string } | null;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) => n.toLocaleString();
const usd = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.03] px-3 py-2.5">
      <div className={LABEL}>{label}</div>
      <div className="mt-0.5 text-lg tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-foreground/45">{hint}</div>}
    </div>
  );
}

export function UserStatsSheet({ user, onOpenChange }: Props) {
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    supabase.functions
      .invoke('admin-users?action=user-stats', { body: { userId: user.id, range } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setData(data);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, range]);

  const rangeLabel = range === 'week' ? 'last 7 days' : range === 'month' ? 'last 30 days' : 'last 365 days';

  return (
    <Sheet open={!!user} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={`w-full sm:max-w-md overflow-y-auto ${ADMIN_SCOPE}`}>
        <SheetHeader>
          <SheetTitle className="font-normal">
            {user?.display_name || user?.email}
          </SheetTitle>
          <SheetDescription>
            {user?.email} · <span className="capitalize">{user?.plan}</span> plan
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 inline-flex gap-0.5 rounded-full bg-foreground/[0.05] p-0.5 text-xs">
          {(['week', 'month', 'year'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
                range === r ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {loading || !data ? (
          <div className="mt-6 space-y-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="mt-6 space-y-6 pb-10">
            <section>
              <h3 className={`${LABEL} mb-2`}>Writing</h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Words total" value={fmt(data.content.totalWords)} />
                <Stat label={`Words touched`} value={fmt(data.content.recentWords)} hint={rangeLabel} />
              </div>
            </section>

            <section>
              <h3 className={`${LABEL} mb-2`}>Library</h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Projects" value={fmt(data.content.projects)} hint={`+${data.content.projectsInRange} in ${rangeLabel}`} />
                <Stat label="Folios" value={fmt(data.content.folios)} hint={`+${data.content.foliosInRange} in ${rangeLabel}`} />
                <Stat label="Notes" value={fmt(data.content.notes)} hint={`+${data.content.notesInRange} in ${rangeLabel}`} />
                <Stat label="Chapters" value={fmt(data.content.chapters)} hint={`${fmt(data.content.drafts)} drafts`} />
                <Stat label="Maps" value={fmt(data.content.maps)} hint={`+${data.content.mapsInRange} in ${rangeLabel}`} />
                <Stat label="AI stickers" value={fmt(data.content.stickers)} hint="placed on maps" />
              </div>
            </section>

            <section>
              <h3 className={`${LABEL} mb-2`}>AI usage · {rangeLabel}</h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="AI calls" value={fmt(data.ai.calls)} />
                <Stat label="Credits spent" value={fmt(data.ai.creditsSpent)} />
                <Stat label="Input tokens" value={fmt(data.ai.inputTokens)} />
                <Stat label="Output tokens" value={fmt(data.ai.outputTokens)} />
                <Stat label="Images generated" value={fmt(data.ai.images)} />
                <Stat label="Credits left" value={fmt(data.credits.remaining)} hint={`${fmt(data.credits.used)} used this period`} />
              </div>

              {data.ai.byFeature.length > 0 && (
                <div className={`mt-3 ${TABLE}`}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-1.5 font-normal">Feature</th>
                        <th className="text-right px-2 py-1.5 font-normal">Calls</th>
                        <th className="text-right px-2 py-1.5 font-normal">Credits</th>
                        <th className="text-right px-3 py-1.5 font-normal">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ai.byFeature.map((f: any) => (
                        <tr key={f.feature} className="border-t border-border/40">
                          <td className="px-3 py-1.5">{f.feature.replace(/_/g, ' ')}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums">{fmt(f.calls)}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums">{fmt(f.credits)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{usd(f.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3 className={`${LABEL} mb-2`}>Economics · {rangeLabel}</h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Revenue" value={usd(data.money.revenueUsd)} hint={`sub ${usd(data.money.subscriptionUsd)} · packs ${usd(data.money.purchaseUsd)}`} />
                <Stat label="Our AI cost" value={usd(data.money.costUsd)} />
                <div className="col-span-2">
                  <div className={`rounded-lg border px-3 py-2.5 ${data.money.marginUsd >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Margin</div>
                    <div className={`text-lg tabular-nums ${data.money.marginUsd >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      {usd(data.money.marginUsd)}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Revenue only counts real payments: an active paid subscription prorated over the window plus credit packs bought in it. Comped or admin-granted plans show $0. Cost is raw model spend from the credit ledger. Example content seeded on signup is excluded from the library counts.
              </p>
              {data.ai.estimatedCalls > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {fmt(data.ai.estimatedCalls)} older call{data.ai.estimatedCalls === 1 ? '' : 's'} stored no token usage, so their cost is estimated back from credits spent.
                </p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}