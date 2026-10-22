import { describe, expect, it } from 'vitest';
import { isDoubleMark, reviewKey } from '@/lib/review-queue';

describe('review queue', () => {
  const passage = { intent: 'mark_for_review', quote: 'Kai lost his left eye.' };

  it('collapses a double click on the same passage at the same speed', () => {
    const claimed = new Map([[reviewKey(passage, 'fast'), 1_000]]);
    expect(isDoubleMark(claimed, reviewKey(passage, 'fast'), 2_500)).toBe(true);
  });

  it('answers the same passage again at another speed, or later', () => {
    const claimed = new Map([[reviewKey(passage, 'fast'), 1_000]]);
    expect(isDoubleMark(claimed, reviewKey(passage, 'thoughtful'), 1_500)).toBe(false);
    expect(isDoubleMark(claimed, reviewKey(passage, 'creative'), 2_000)).toBe(false);
    expect(isDoubleMark(claimed, reviewKey(passage, 'fast'), 20_000)).toBe(false);
  });

  it('ignores spaces around the passage', () => {
    expect(reviewKey({ ...passage, quote: '  Kai lost his left eye. ' }, 'fast')).toBe(reviewKey(passage, 'fast'));
  });
});
