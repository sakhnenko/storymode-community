import { useNavigate } from 'react-router-dom';
import { Sparkle, ArrowRight } from '@/components/ui/icons';
import { useUserCredits } from '@/hooks/useUserCredits';
import { useUserPlan } from '@/hooks/useUserPlan';

interface Props {
  /** Compact variant for tight surfaces like the map AI popover */
  compact?: boolean;
  className?: string;
}

/**
 * Shown to Draft (free) users on AI surfaces: explains that AI features are
 * available to try with their small credit allowance, and points to upgrades.
 */
export function AiTrialCard({ compact, className }: Props) {
  const navigate = useNavigate();
  const { plan, loading: planLoading } = useUserPlan();
  const { credits, loading } = useUserCredits();

  // Wait for the real plan before rendering — `plan` defaults to 'draft',
  // which made this flash on paid accounts.
  if (planLoading || plan !== 'draft') return null;

  const remaining = loading ? null : credits.remaining;

  if (compact) {
    return (
      <div className={`rounded-md border border-primary/25 bg-primary/[0.06] px-2.5 py-2 ${className ?? ''}`}>
        <div className="flex items-center gap-1.5 text-[11px] text-foreground">
          <Sparkle weight="fill" className="w-3 h-3 text-primary shrink-0" />
          <span className="font-medium">Advanced feature — free trial</span>
          {remaining !== null && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{remaining} credits left</span>
          )}
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Draft includes 30 AI credits to try things out. Manuscript gives you 800 a month, Studio 3,500.
        </p>
        <button
          onClick={() => navigate('/plans')}
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
        >
          See plans <ArrowRight weight="bold" className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-primary/25 bg-primary/[0.06] p-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkle weight="fill" className="w-3.5 h-3.5 text-primary" />
        </span>
        <span className="text-xs font-medium text-foreground">Advanced AI — yours to try</span>
        {remaining !== null && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{remaining} credits left</span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        The AI Editor and AI Draw run on credits. Your Draft plan includes 30 to explore them.
        Manuscript adds 800 credits a month, and Studio 3,500 with the most powerful models.
      </p>
      <button
        onClick={() => navigate('/plans')}
        className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
      >
        Compare plans <ArrowRight weight="bold" className="w-3 h-3" />
      </button>
    </div>
  );
}
