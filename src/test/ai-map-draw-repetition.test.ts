import { describe, expect, it } from 'vitest';
import { wantsRepeatedDiscreteSubjects } from '../../supabase/functions/ai-map-draw/repetition';

describe('AI Draw repeated-subject routing', () => {
  it('keeps the existing repeated-subject heuristic for manual AI Draw', () => {
    expect(wantsRepeatedDiscreteSubjects('a fleet of ships')).toBe(true);
    expect(wantsRepeatedDiscreteSubjects('one ancient tower')).toBe(false);
  });

  it('forces one composition for an automated scene-map landmark', () => {
    expect(wantsRepeatedDiscreteSubjects('a group of five figures', false)).toBe(false);
    expect(wantsRepeatedDiscreteSubjects('a cluster of treehouses', false)).toBe(false);
  });
});
