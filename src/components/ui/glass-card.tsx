import { forwardRef, useMemo, type HTMLAttributes } from 'react';
import { Card } from '@/components/ui/card';
import { GLASS_CARD_CLASS } from '@/components/ui/glass-surface';
import { mergeRefs, useLiquidGlass, type GlassParams } from '@/components/ui/liquid-glass';
import { cn } from '@/lib/utils';

/**
 * A card of liquid glass over a painting: its rim bends the picture behind
 * it (Chromium), with the usual frosted glass everywhere else.
 */
export const GlassCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { glass?: Partial<GlassParams> }>(
  ({ className, glass, ...props }, ref) => {
    const liquid = useLiquidGlass<HTMLDivElement>(glass);
    const merged = useMemo(() => mergeRefs(ref, liquid), [ref, liquid]);
    return <Card ref={merged} className={cn(GLASS_CARD_CLASS, className)} {...props} />;
  },
);
GlassCard.displayName = 'GlassCard';
