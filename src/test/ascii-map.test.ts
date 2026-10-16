import { describe, expect, it } from 'vitest';
import {
  buildAsciiMap,
  layoutAsciiMap,
  type AsciiMapPlace,
  type AsciiMapRelationship,
} from '@/lib/ascii-map';

const places = [
  { name: 'Harwood Camp', kind: 'settlement' },
  { name: 'Harwood Forest', kind: 'forest' },
  { name: 'Plains of Izmeer', kind: 'region' },
  { name: 'Solar Forest', kind: 'forest' },
  { name: 'The Ark', kind: 'structure' },
  { name: 'Kalissa Ridge', kind: 'mountain' },
] satisfies AsciiMapPlace[];

const relationships = [
  { from: 'Harwood Camp', to: 'Kalissa Ridge', direction: 'east', distance: 'distant' },
  { from: 'Harwood Forest', to: 'Harwood Camp', direction: 'inside', distance: 'same_site' },
  { from: 'Plains of Izmeer', to: 'Solar Forest', direction: 'inside', distance: 'same_site' },
  { from: 'Solar Forest', to: 'The Ark', direction: 'inside', distance: 'same_site' },
] satisfies AsciiMapRelationship[];

const between = [
  { place: 'Solar Forest', from: 'Harwood Camp', to: 'Kalissa Ridge' },
  { place: 'The Ark', from: 'Harwood Camp', to: 'Kalissa Ridge' },
];

describe('ASCII relationship map', () => {
  it('places between landmarks between their directional anchors', () => {
    const layout = layoutAsciiMap(places, relationships, between);

    expect(layout.get('Harwood Camp')!.x).toBeLessThan(layout.get('Solar Forest')!.x);
    expect(layout.get('Solar Forest')!.x).toBeLessThan(layout.get('Kalissa Ridge')!.x);
    expect(layout.get('The Ark')!.x).toBeGreaterThan(layout.get('Harwood Camp')!.x);
    expect(layout.get('The Ark')!.x).toBeLessThan(layout.get('Kalissa Ridge')!.x);
    expect(layout.get('Harwood Camp')!.y).toBe(layout.get('Harwood Forest')!.y);
    expect(layout.get('Solar Forest')!.y).toBe(layout.get('Plains of Izmeer')!.y);
    expect(layout.get('The Ark')!.y).toBe(layout.get('Solar Forest')!.y);
  });

  it('renders nested forests, a spanning plain, and a mountain boundary', () => {
    const map = buildAsciiMap(places, relationships, between);

    expect(map).toContain('[Harwood Camp]');
    expect(map).toContain('[Harwood Forest]');
    expect(map).toContain('[Plains of Izmeer]');
    expect(map).toContain('[Solar Forest]');
    expect(map).toContain('[The Ark]');
    expect(map).toContain('[Kalissa Ridge]');
    expect(map).toContain('/▲\\  /▲\\  /▲\\');
    expect(map).toContain('+');
    expect(map).toContain('(');
    expect(map).toContain('⌂');
    expect(map).toContain('◆');
    expect(map).toContain('♠');
    expect(map).toContain('·');
    expect(map).toContain('west / east');
  });

  it('expands the canvas and keeps multiple real-world regions visible', () => {
    const worldPlaces = [
      { name: 'Omsk', kind: 'settlement', latitude: 54.99, longitude: 73.37 },
      { name: 'Tomsk', kind: 'settlement', latitude: 56.5, longitude: 84.97 },
      { name: 'Kursk', kind: 'settlement', latitude: 51.73, longitude: 36.19 },
      { name: 'Far East of Russia', kind: 'region', latitude: 55, longitude: 135 },
      { name: 'China', kind: 'region', latitude: 35, longitude: 103 },
      { name: 'Korea', kind: 'region', latitude: 37, longitude: 127 },
      { name: 'England', kind: 'region', latitude: 52.35, longitude: -1.17 },
      { name: 'London', kind: 'settlement', latitude: 51.51, longitude: -0.13 },
      { name: 'Mayfair', kind: 'region', latitude: 51.51, longitude: -0.15 },
    ] satisfies AsciiMapPlace[];
    const map = buildAsciiMap(worldPlaces, [], []);
    const lines = map.split('\n');

    expect(Math.max(...lines.map(line => line.length))).toBeGreaterThan(84);
    expect(lines.length).toBeGreaterThan(24);
    expect(map).toContain('[Far East of Russia]');
    expect(map).toContain('[China]');
    expect(map).toContain('[Korea]');
    expect(map).toContain('[England]');
    expect(map).toContain('[London]');
    expect(map).toContain('[Mayfair]');
  });
});
