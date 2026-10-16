export const MAP_CELL_SIZE = 28;
export const SCENE_MAP_WIDTH = 64;
export const SCENE_MAP_HEIGHT = 44;
export const BLANK_MAP_BACKGROUND_COLOR = '#87a782';

export const SCENE_MAP_IMAGE_CREDITS = 16;

export function estimatedSceneMapCredits(landmarkCount: number) {
  return SCENE_MAP_IMAGE_CREDITS * (Math.max(0, Math.round(landmarkCount)) + 1);
}
