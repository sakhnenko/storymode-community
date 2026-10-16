import { describe, expect, it } from 'vitest';
import {
  buildJevRelationshipRequest,
  parseJevRelationshipResult,
  selectRelationshipCandidates,
} from '../../supabase/functions/ai-scene-map-plan/relationship-test';
import type { ProminentMapPlace } from '../../supabase/functions/ai-scene-map-plan/place-inventory';

function place(overrides: Partial<ProminentMapPlace> & Pick<ProminentMapPlace, 'name'>): ProminentMapPlace {
  return {
    name: overrides.name,
    kind: overrides.kind || 'structure',
    context: overrides.context || `${overrides.name} appears in the chapter.`,
    mentions: overrides.mentions ?? 1,
    firstIndex: overrides.firstIndex ?? 0,
    requireLandmark: overrides.requireLandmark ?? false,
    realWorld: overrides.realWorld,
    latitude: overrides.latitude,
    longitude: overrides.longitude,
  };
}

describe('Jev scene-map relationship test', () => {
  it('limits the test to the strongest eight candidates', () => {
    const candidates = Array.from({ length: 18 }, (_, index) => place({
      name: `Place ${index}`,
      mentions: index + 1,
      firstIndex: index * 100,
    }));

    const selected = selectRelationshipCandidates(candidates);

    expect(selected).toHaveLength(8);
    expect(selected[0].name).toBe('Place 17');
    expect(selected.some(candidate => candidate.name === 'Place 0')).toBe(false);
  });

  it('builds typed landmark, direction, and distance questions in one request', () => {
    const request = buildJevRelationshipRequest('The Arc stood east of Harwood Camp.', [
      place({ name: 'Harwood Camp', kind: 'settlement', requireLandmark: true }),
      place({ name: 'The Arc', kind: 'structure', requireLandmark: true }),
      place({ name: 'Kalissa Ridge', kind: 'mountain' }),
    ]);

    expect(request.state.candidates.map(candidate => candidate.name)).toEqual([
      'Harwood Camp',
      'The Arc',
      'Kalissa Ridge',
    ]);
    expect(request.questions.place_0_map_scale.type).toBe('noul');
    expect(request.questions.place_0_scene_relevant.type).toBe('noul');
    expect(request.questions.place_0_scene_relevant.instructions).toContain('later-life scenes');
    expect(request.questions.place_1_kind.type).toBe('choice');
    expect(request.questions.place_2_between.type).toBe('choice');
    expect(request.questions.pair_0_1_direction.type).toBe('choice');
    expect(request.questions.pair_0_1_distance.type).toBe('choice');
    expect(request.questions.pair_0_1_direction.instructions).toContain('reliable general geographic knowledge');
    expect(request.questions.pair_0_1_direction.instructions).toContain('fictional, invented, historically ambiguous');
    expect(request.questions.pair_0_1_distance.instructions).toContain('reliable general geographic knowledge');
    expect(Object.keys(request.questions)).toHaveLength(18);
  });

  it('uses supplied real-world coordinates to correct broad direction and distance', () => {
    const request = buildJevRelationshipRequest('Anisiya was sent from Omsk into exile in Tomsk.', [
      place({ name: 'Omsk', kind: 'settlement', realWorld: true, latitude: 54.99, longitude: 73.37 }),
      place({ name: 'Tomsk', kind: 'settlement', realWorld: true, latitude: 56.5, longitude: 84.97 }),
    ]);
    const result = parseJevRelationshipResult({
      answers: {
        place_0_map_scale: { noul: 0.99 },
        place_0_scene_relevant: { noul: 0.99 },
        place_0_kind: { choice: 'settlement', confidence: 0.99 },
        place_1_map_scale: { noul: 0.99 },
        // Secondary or later-life narrative anchors can score below 0.5 but
        // should not disappear from a chapter-wide map.
        place_1_scene_relevant: { noul: 0.4 },
        place_1_kind: { choice: 'settlement', confidence: 0.99 },
        pair_0_1_direction: { choice: 'south', confidence: 0.41 },
        pair_0_1_distance: { choice: 'moderate_journey', confidence: 0.41 },
      },
    }, request);

    expect(result.relationships).toEqual([
      expect.objectContaining({ from: 'Omsk', to: 'Tomsk', direction: 'east', distance: 'distant' }),
    ]);
    expect(result.places[0]).toMatchObject({ latitude: 54.99, longitude: 73.37 });
  });

  it('keeps likely landmarks and returns only supported relationships', () => {
    const request = buildJevRelationshipRequest('The Arc stood east of Harwood Camp.', [
      place({ name: 'Harwood Camp', kind: 'settlement', requireLandmark: true }),
      place({ name: 'The Arc', kind: 'structure', requireLandmark: true }),
      place({ name: 'Loose Crate', kind: 'structure' }),
    ]);
    const result = parseJevRelationshipResult({
      answers: {
        place_0_map_scale: { type: 'noul', noul: 0.98 },
        place_0_scene_relevant: { type: 'noul', noul: 0.96 },
        place_0_kind: { type: 'choice', choice: 'settlement', confidence: 0.94 },
        place_1_map_scale: { type: 'noul', noul: 0.91 },
        place_1_scene_relevant: { type: 'noul', noul: 0.93 },
        place_1_kind: { type: 'choice', choice: 'structure', confidence: 0.88 },
        place_2_map_scale: { type: 'noul', noul: 0.08 },
        place_2_scene_relevant: { type: 'noul', noul: 0.9 },
        place_2_kind: { type: 'choice', choice: 'structure', confidence: 0.76 },
        pair_0_1_direction: { type: 'choice', choice: 'east', confidence: 0.93 },
        pair_0_1_distance: { type: 'choice', choice: 'moderate_journey', confidence: 0.72 },
        pair_0_2_direction: { type: 'choice', choice: 'unknown', confidence: 0.9 },
        pair_0_2_distance: { type: 'choice', choice: 'unknown', confidence: 0.9 },
        pair_1_2_direction: { type: 'choice', choice: 'unknown', confidence: 0.9 },
        pair_1_2_distance: { type: 'choice', choice: 'unknown', confidence: 0.9 },
      },
    }, request);

    expect(result.places.map(candidate => candidate.name)).toEqual(['Harwood Camp', 'The Arc']);
    expect(result.relationships).toEqual([{
      from: 'Harwood Camp',
      to: 'The Arc',
      direction: 'east',
      distance: 'moderate_journey',
      directionConfidence: 0.93,
      distanceConfidence: 0.72,
    }]);
    expect(result.evaluatedCandidates).toBe(3);
  });

  it('propagates anchor direction through between and containment relationships', () => {
    const request = buildJevRelationshipRequest(
      'The Solar Forest and Ark are on the Plains of Izmeer, east of Harwood and west of Kalissa Ridge.',
      [
        place({ name: 'Harwood Camp', kind: 'settlement', requireLandmark: true, firstIndex: 0 }),
        place({ name: 'Plains of Izmeer', kind: 'region', requireLandmark: true, firstIndex: 10 }),
        place({ name: 'Solar Forest', kind: 'forest', requireLandmark: true, firstIndex: 20 }),
        place({ name: 'The Ark', kind: 'structure', requireLandmark: true, firstIndex: 30 }),
        place({ name: 'Kalissa Ridge', kind: 'mountain', requireLandmark: true, firstIndex: 40 }),
      ],
    );
    const answers: Record<string, unknown> = {};
    request.state.candidates.forEach((candidate, index) => {
      answers[`place_${index}_map_scale`] = { noul: 0.95 };
      answers[`place_${index}_scene_relevant`] = { noul: 0.96 };
      answers[`place_${index}_kind`] = { choice: candidate.currentKind, confidence: 0.9 };
      answers[`place_${index}_between`] = {
        choice: candidate.name === 'Solar Forest' ? 'between_0_4' : 'none',
        confidence: 0.88,
      };
    });
    answers.pair_0_4_direction = { choice: 'east', confidence: 0.8 };
    answers.pair_0_4_distance = { choice: 'distant', confidence: 0.75 };
    answers.pair_1_2_direction = { choice: 'inside', confidence: 0.92 };
    answers.pair_1_2_distance = { choice: 'same_site', confidence: 0.9 };
    answers.pair_2_3_direction = { choice: 'inside', confidence: 0.91 };
    answers.pair_2_3_distance = { choice: 'same_site', confidence: 0.94 };

    const result = parseJevRelationshipResult({ answers }, request);

    expect(result.between).toEqual(expect.arrayContaining([
      expect.objectContaining({ place: 'Solar Forest', from: 'Harwood Camp', to: 'Kalissa Ridge' }),
      expect.objectContaining({ place: 'The Ark', from: 'Harwood Camp', to: 'Kalissa Ridge' }),
    ]));
    expect(result.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'Harwood Camp', to: 'Solar Forest', direction: 'east' }),
      expect.objectContaining({ from: 'Harwood Camp', to: 'The Ark', direction: 'east' }),
      expect.objectContaining({ from: 'Plains of Izmeer', to: 'The Ark', direction: 'inside' }),
    ]));
  });

  it('rejects map-scale places that are only mentioned in dialogue', () => {
    const request = buildJevRelationshipRequest(
      'They leave Harwood Camp for the Ark. In conversation, someone mentions Kor Vu and the Capital.',
      [
        place({ name: 'Harwood Camp', kind: 'settlement', requireLandmark: true }),
        place({ name: 'The Ark', kind: 'structure', requireLandmark: true }),
        place({ name: 'Kor Vu', kind: 'settlement', requireLandmark: true }),
        place({ name: 'The Capital', kind: 'settlement', requireLandmark: true }),
      ],
    );
    const answers: Record<string, unknown> = {};
    request.state.candidates.forEach((candidate, index) => {
      const sceneRelevant = candidate.name === 'Harwood Camp' || candidate.name === 'The Ark';
      answers[`place_${index}_map_scale`] = { noul: 0.95 };
      answers[`place_${index}_scene_relevant`] = { noul: sceneRelevant ? 0.96 : 0.08 };
      answers[`place_${index}_kind`] = { choice: candidate.currentKind, confidence: 0.9 };
      answers[`place_${index}_between`] = { choice: 'none', confidence: 0.9 };
    });

    const result = parseJevRelationshipResult({ answers }, request);

    expect(result.places.map(candidate => candidate.name)).toEqual(['Harwood Camp', 'The Ark']);
  });
});
