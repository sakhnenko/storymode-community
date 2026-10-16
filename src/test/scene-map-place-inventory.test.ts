import { describe, expect, it } from 'vitest';
import {
  extractNamedMapPlaces,
  extractProminentMapPlaces,
  normalizeDiscoveredPlaces,
} from '../../supabase/functions/ai-scene-map-plan/place-inventory';

describe('scene-map chapter place inventory', () => {
  it('merges aliases of the same place kind without collapsing nested terrain', () => {
    const places = extractProminentMapPlaces(`
      Harwood Camp lies among the sequoias. Harwood forest protects a treetop
      village. The path leaves Harwood settlement toward the east. The group will
      return to Harwood. The Solar Forest covers the steppe. At the outer rim of
      the Solar Forest, thousands of panels surround the destination.
    `);

    expect(places.map(place => place.name)).toEqual(['Harwood Camp', 'Harwood Forest', 'Solar Forest']);
    expect(places[0]).toMatchObject({ kind: 'settlement', requireLandmark: true, mentions: 4 });
    expect(places[1]).toMatchObject({ kind: 'forest', requireLandmark: false, mentions: 4 });
    expect(places[2]).toMatchObject({ kind: 'forest', requireLandmark: false, mentions: 2 });
  });

  it('ignores one-off distant name drops', () => {
    const places = extractProminentMapPlaces('They glimpsed Kalissa ridge once, then returned home.');
    expect(places).toEqual([]);
  });

  it('discovers one-off named geography and a named major destination', () => {
    const chapter = `The distant Kalissa ridge rose in the east. They approached a
      looming structure. The Ark, their ultimate destination, stood at the center
      of the Solar Forest. The Solar Forest surrounded it.`;
    const names = extractNamedMapPlaces(chapter).map(place => place.name);

    expect(names).toContain('Kalissa Ridge');
    expect(names).toContain('The Ark');
    expect(names).toContain('Solar Forest');
  });

  it('recognizes a lowercase geographic prefix as a broad region', () => {
    const places = extractNamedMapPlaces(
      'They crossed the plains of Izmeer. The Plains of Izmeer stretched east to Kalissa Ridge.',
    );

    expect(places).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Plains of Izmeer', kind: 'region' }),
      expect.objectContaining({ name: 'Kalissa Ridge', kind: 'mountain' }),
    ]));
  });

  it('merges AI results with deterministic names without duplicating aliases', () => {
    const chapter = 'Harwood Camp stood among trees. They returned to Harwood settlement. Kalissa ridge lay east.';
    const places = normalizeDiscoveredPlaces([
      { name: 'Harwood Camp', kind: 'settlement', description: 'A treetop settlement.' },
      { name: 'Forest Trail', kind: 'forest', description: 'An unnamed trail.' },
      { name: 'Raid Meeting Spot', kind: 'structure', description: 'An unnamed event site.' },
    ], chapter);

    expect(places.map(place => place.name)).toEqual(['Harwood Camp', 'Kalissa Ridge']);
  });

  it('keeps active geography from the real chapter while rejecting dialogue-only names', () => {
    const chapter = `
      A week, and then the whole of Harwood Camp will be torn down and hauled underland.
      Ten more cycles and the sun would burst over the peaks of the distant Kalissa ridge,
      bathing the plains of Izmeer in remorseless light. It would breach even the depths
      of Harwood forest. He sprinted toward the edge of the forest.
      “Kor Vu isn’t even that far from Harwood,” Sky began. “Maybe we can join supply
      runs to Clearwell!” Ali replied, “You could live in Crystal Cove or the Capital.”
      They ran across the steppe toward the Solar Forest. The Ark, their ultimate
      destination, stood at the center of the Solar Forest, which encircled it.
    `;
    const places = normalizeDiscoveredPlaces([
      { name: 'Izmeer', kind: 'structure', description: 'An inferred place.' },
      { name: 'Kor Vu', kind: 'settlement', description: 'Mentioned in conversation.' },
      { name: 'Clearwell', kind: 'settlement', description: 'Mentioned in conversation.' },
      { name: 'Crystal Cove', kind: 'settlement', description: 'Mentioned in conversation.' },
      { name: 'The Capital', kind: 'settlement', description: 'Mentioned in conversation.' },
    ], chapter);

    expect(places.map(place => [place.name, place.kind])).toEqual([
      ['Harwood Camp', 'settlement'],
      ['Kalissa Ridge', 'mountain'],
      ['Plains of Izmeer', 'region'],
      ['Harwood Forest', 'forest'],
      ['Solar Forest', 'forest'],
      ['The Ark', 'structure'],
    ]);
    expect(places.find(place => place.name === 'The Ark')?.description).toContain('The Ark');
  });

  it('accepts AI-discovered cities, countries, streets, and residences in memoir prose', () => {
    const chapter = `
      The Arkashev family gathered in their house in Omsk. For a year and a half,
      Omsk had been the seat of White Russia. She remembered the Commercial Club
      and a postcard of a tram on Lermontov Street. The family house was taken.
      Anisiya was sent into exile in Tomsk. Years later, the family worked in the
      Far East of Russia, moving goods across borders with China and Korea.
      What happened in Omsk followed the narrator to London and Mayfair. England
      became home for fourteen years.
    `;
    const places = normalizeDiscoveredPlaces([
      { name: 'Omsk', kind: 'settlement', description: 'A Siberian city.', realWorld: true, latitude: 54.99, longitude: 73.37 },
      { name: 'Arkashev family house', kind: 'structure', description: 'The family residence in Omsk.' },
      { name: 'White Russia', kind: 'region', description: 'The state seated in Omsk.' },
      { name: 'Commercial Club', kind: 'structure', description: 'A cultural venue.' },
      { name: 'Lermontov Street', kind: 'structure', description: 'A street shown on a postcard.' },
      { name: 'Tomsk', kind: 'settlement', description: 'The city of exile.' },
      { name: 'Far East of Russia', kind: 'region', description: 'A Russian region.' },
      { name: 'Russia', kind: 'region', description: 'A country.' },
      { name: 'China', kind: 'region', description: 'A neighboring country.' },
      { name: 'Korea', kind: 'region', description: 'A neighboring country.' },
      { name: 'London', kind: 'settlement', description: 'A city.' },
      { name: 'Mayfair', kind: 'region', description: 'A London district.' },
      { name: 'England', kind: 'region', description: 'A country.' },
    ], chapter);
    const names = places.map(place => place.name);

    expect(names).toEqual(expect.arrayContaining([
      'Omsk',
      'Arkashev family house',
      'White Russia',
      'Commercial Club',
      'Lermontov Street',
      'Tomsk',
      'Far East of Russia',
      'Russia',
      'China',
      'Korea',
      'London',
      'Mayfair',
      'England',
    ]));
    expect(names).not.toEqual(expect.arrayContaining(['A House', 'Plain', 'Forest']));
    expect(places.find(place => place.name === 'Omsk')).toMatchObject({
      realWorld: true,
      latitude: 54.99,
      longitude: 73.37,
    });
  });
});
