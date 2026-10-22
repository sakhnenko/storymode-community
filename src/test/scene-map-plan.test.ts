import { describe, expect, it } from 'vitest';
import {
  isMapScaleLandmark,
  isPeopleFocusedSticker,
  prepareLabels,
  prepareLandmarks,
} from '../../supabase/functions/ai-scene-map-plan/plan-utils';
import { extractProminentMapPlaces } from '../../supabase/functions/ai-scene-map-plan/place-inventory';

describe('scene-map planning safeguards', () => {
  it('removes people and repeated subjects instead of padding the sticker count', () => {
    const landmarks = prepareLandmarks([
      {
        label: 'Harwood Camp',
        prompt: 'One treetop village woven through giant sequoias, without people',
        x: 0.18,
        y: 0.38,
        size: 0.24,
      },
      {
        label: 'Steppe Edge',
        prompt: 'A boundary where dry grass gives way to cracked mud',
        x: 0.42,
        y: 0.48,
        size: 0.18,
      },
      {
        label: 'Climbing Figures',
        prompt: 'Two human figures climbing steel trusses',
        x: 0.68,
        y: 0.36,
        size: 0.18,
      },
      {
        label: 'The Ark',
        prompt: 'One colossal circular dark structure with concentric garden rings, no characters',
        x: 0.84,
        y: 0.46,
        size: 0.26,
      },
      {
        label: 'The Ark',
        prompt: 'A duplicate circular structure',
        x: 0.82,
        y: 0.44,
        size: 0.24,
      },
    ], 6);

    expect(landmarks.map(item => item.label)).toEqual(['Harwood Camp', 'The Ark']);
    expect(isPeopleFocusedSticker('An empty village with no people')).toBe(false);
    expect(isPeopleFocusedSticker('Five travelers running across a field')).toBe(true);
  });

  it('deduplicates labels, adds missing landmark labels, and separates their positions', () => {
    const landmarks = prepareLandmarks([
      { label: 'Harwood Camp', prompt: 'One empty treetop settlement', x: 0.2, y: 0.35, size: 0.24 },
      { label: 'The Ark', prompt: 'One circular fortress', x: 0.82, y: 0.45, size: 0.26 },
    ], 4);
    const labels = prepareLabels([
      { text: 'Plains of Izmeer', x: 0.5, y: 0.5, kind: 'location' },
      { text: 'Plains of Izmeer', x: 0.51, y: 0.51, kind: 'location' },
      { text: 'Solar Forest', x: 0.7, y: 0.45, kind: 'location' },
      { text: 'Sky enters the Veil', x: 0.22, y: 0.35, kind: 'event' },
    ], landmarks);

    expect(labels.map(item => item.text)).toEqual([
      'Plains of Izmeer',
      'Solar Forest',
      'Sky enters the Veil',
      'Harwood Camp',
      'The Ark',
    ]);

    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const separated = Math.abs(labels[i].x - labels[j].x) >= 0.14 ||
          Math.abs(labels[i].y - labels[j].y) >= 0.08;
        expect(separated).toBe(true);
      }
      for (const landmark of landmarks) {
        const outsideSticker = Math.abs(labels[i].x - landmark.x) >= landmark.size / 2 + 0.04 ||
          Math.abs(labels[i].y - landmark.y) >= landmark.size / 2 + 0.04;
        expect(outsideSticker).toBe(true);
      }
    }
  });

  it('accepts map-scale geography while rejecting close-up objects and terrain filler', () => {
    expect(isMapScaleLandmark('Harwood Camp', 'A treetop village in a forest')).toBe(true);
    expect(isMapScaleLandmark('Kalissa Ridge', 'A distant mountain range')).toBe(true);
    expect(isMapScaleLandmark('Moonfall Waterfall', 'A tall waterfall feeding a river')).toBe(true);
    expect(isMapScaleLandmark('The Ark', 'A colossal structure and major destination')).toBe(true);
    expect(isMapScaleLandmark('Front Door', 'The carved entrance to a house')).toBe(false);
    expect(isMapScaleLandmark('Solar Panel Structure', 'One giant panel on two columns')).toBe(false);
    expect(isMapScaleLandmark('Cracked Mud Ground', 'A patch of cracked earth')).toBe(false);
    expect(isMapScaleLandmark('Dry Grass Steppe', 'A generic terrain transition')).toBe(false);
  });

  it('forces a repeatedly named settlement into the available landmark slots', () => {
    const chapter = `
      Harwood Camp is being dismantled beneath towering sequoias. The labyrinthine
      treetop village fills Harwood forest. Travelers leave Harwood settlement and
      cross the plains. The Solar Forest surrounds their destination. Thousands of
      panels fill the Solar Forest, and they later return to Harwood.
    `;
    const places = extractProminentMapPlaces(chapter);
    expect(places.find(place => place.name === 'Harwood Camp')).toMatchObject({
      kind: 'settlement',
      requireLandmark: true,
    });

    const landmarks = prepareLandmarks([
      { label: 'Front Door', prompt: 'A carved door', x: 0.2, y: 0.2, size: 0.2 },
      { label: 'The Ark', prompt: 'A colossal structure and major destination', x: 0.8, y: 0.4, size: 0.25 },
      { label: 'Cracked Mud Ground', prompt: 'A patch of mud', x: 0.5, y: 0.5, size: 0.2 },
    ], 4, places);

    expect(landmarks.map(item => item.label)).toEqual(['Harwood Camp', 'The Ark']);
  });

  it('allows a terrain-only plan when no map-scale landmark qualifies', () => {
    expect(prepareLandmarks([
      { label: 'Front Door', prompt: 'One carved door', x: 0.2, y: 0.2, size: 0.2 },
      { label: 'Grass Patch', prompt: 'A small patch of grass', x: 0.4, y: 0.4, size: 0.2 },
    ], 6)).toEqual([]);
  });
});
