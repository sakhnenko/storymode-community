import { describe, expect, it } from 'vitest';
import { BLANK_MAP_BACKGROUND_COLOR, estimatedSceneMapCredits } from '@/lib/map-constants';

describe('blank-map defaults', () => {
  it('starts new blank maps with a grass background', () => {
    expect(BLANK_MAP_BACKGROUND_COLOR).toBe('#87a782');
  });
});

describe('scene-map credit estimate', () => {
  it('charges one terrain image plus exactly the selected place count', () => {
    expect(estimatedSceneMapCredits(0)).toBe(16);
    expect(estimatedSceneMapCredits(2)).toBe(48);
    expect(estimatedSceneMapCredits(8)).toBe(144);
  });
});
