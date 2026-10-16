import { describe, expect, it } from 'vitest';
import { MEMORY_VERSION, type MemoryChapter, type MemoryEntity } from '../../supabase/functions/_shared/project-memory';
import { buildMemoryGraph } from '../../supabase/functions/_shared/memory-graph';
import {
  arrangePlaces, journeyEvents, journeyLines, journeyPlaces, placeOnRows, placeParents, placeTree, shownRows, travellers,
  unshownInChapter, whereInChapter, withContainers, withMovedOrder, withNesting,
} from '@/components/codex/journeys';
import { parseLayout } from '@/components/codex/useCodexLayout';
import type { MemoryClaim } from '../../supabase/functions/_shared/project-memory';

const person = (name: string, places: string[]): MemoryEntity => ({ name, kind: 'person', aliases: [], presence: 'onstage', places });
const place = (name: string): MemoryEntity => ({ name, kind: 'place', aliases: [], presence: 'onstage' });
const chapter = (id: string, position: number, entities: MemoryEntity[]): MemoryChapter => ({
  id, title: `Chapter ${position + 1}`, position, revision: 'r', currentRevision: 'r', draftId: null, claims: [], entities,
  version: MEMORY_VERSION, writingKind: 'literary', analyzedAt: '2026-09-30', status: 'complete', overrides: {},
});
const graph = buildMemoryGraph({ profile: { enabled: true, register: 'auto', genre: '', guidance: '' }, chapters: [
  chapter('a', 0, [person('Sky', ['Treetop', 'Camp']), person('Lia', ['Treetop']), place('Treetop'), place('Camp')]),
  chapter('b', 1, [person('Sky', ['Camp', 'Izmeer']), person('Lia', ['Camp']), place('Camp'), place('Izmeer')]),
  chapter('c', 2, [person('Lia', ['Izmeer']), place('Izmeer')]),
] });

describe('journeys', () => {
  it('ranks people by how many chapters place them', () => {
    expect(travellers(graph).map(t => [t.node.name, t.chapters])).toEqual([['Lia', 3], ['Sky', 2]]);
  });

  it('follows each character through their places, in book and story order', () => {
    const lines = journeyLines(graph, ['a', 'b', 'c'], travellers(graph).map(t => t.node));
    const sky = lines.find(l => l.node.name === 'Sky')!;
    expect(sky.stops.map(s => [s.chapterIndex, s.place.name, s.order, s.count])).toEqual([
      [0, 'Treetop', 0, 2], [0, 'Camp', 1, 2], [1, 'Camp', 0, 2], [1, 'Izmeer', 1, 2],
    ]);
    expect(journeyPlaces(lines).map(p => p.name)).toEqual(['Treetop', 'Camp', 'Izmeer']);
  });

  it('keeps the chosen order and slots new places in after the place they follow', () => {
    const lines = journeyLines(graph, ['a', 'b', 'c'], travellers(graph).map(t => t.node));
    const natural = journeyPlaces(lines);
    const ids = (list: { id: string }[]) => list.map(p => p.id);
    expect(ids(arrangePlaces(natural, []))).toEqual(ids(natural));
    expect(ids(arrangePlaces(natural, ['place:izmeer', 'place:treetop', 'place:gone'])))
      .toEqual(['place:izmeer', 'place:treetop', 'place:camp']);
  });

  it('keeps saved places that are not in the chart where they were when another is dragged', () => {
    // b and d are places of characters not shown right now; a is dragged after c.
    expect(withMovedOrder(['x', 'a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['x', 'c', 'd', 'a', 'b']);
    expect(withMovedOrder([], ['c', 'a'])).toEqual(['c', 'a']);
  });

  it('reads a stored layout, dropping malformed parts', () => {
    expect(parseLayout({ order: ['a', 3], hidden: 'x', nesting: { a: 'b', c: null, d: 4 }, labelWidth: 9999 }))
      .toEqual({ order: ['a'], hidden: [], expanded: [], nesting: { a: 'b', c: null }, labelWidth: 360 });
    expect(parseLayout(null).order).toEqual([]);
  });

  it('draws a stop on its place, rolls it up into a shown container, or leaves it without a row', () => {
    const lines = journeyLines(graph, ['a', 'b', 'c'], travellers(graph).map(t => t.node));
    const parents = new Map([['place:camp', 'place:treetop']]);
    const sky = placeOnRows(lines, new Set(['place:treetop', 'place:izmeer']), parents).find(l => l.node.name === 'Sky')!;
    expect(sky.stops.map(s => [s.chapterIndex, s.place.name, s.row ?? null, !!s.hidden])).toEqual([
      [0, 'Treetop', 'place:treetop', false], [0, 'Camp', 'place:treetop', false],
      [1, 'Camp', 'place:treetop', false], [1, 'Izmeer', 'place:izmeer', false],
    ]);
    const lost = placeOnRows(lines, new Set(['place:izmeer']), new Map()).find(l => l.node.name === 'Sky')!;
    expect(lost.stops.map(s => !!s.hidden)).toEqual([true, true, true, false]);
    expect(unshownInChapter(placeOnRows(lines, new Set(['place:izmeer']), new Map()), 0).map(g => [g.place.name, g.people.map(n => n.name)]))
      .toEqual([['Treetop', ['Lia', 'Sky']], ['Camp', ['Sky']]]);
  });

  it('lists the events each chapter shows happening, with who takes part', () => {
    const event = (name: string, presence: 'onstage' | 'mentioned'): MemoryEntity => ({ name, kind: 'event', aliases: [], presence });
    const withEvents = buildMemoryGraph({ profile: { enabled: true, register: 'auto', genre: '', guidance: '' }, chapters: [
      { ...chapter('a', 0, [person('Sky', ['Camp']), place('Camp'), event('The Raid', 'onstage'), event('The Long Night', 'mentioned')]),
        claims: [{ key: 'k'.repeat(64), subject: 'Sky', kind: 'person', aliases: [], statement: 'Sky leads the raid.',
          quote: 'Sky led the raid at dawn.', basis: 'stated', scope: '', related: ['The Raid'], time: 'scene',
          relations: [{ target: 'The Raid', type: 'participates' }] }] },
      chapter('b', 1, [person('Sky', ['Camp']), place('Camp')]),
    ] });
    const events = journeyEvents(withEvents, ['a', 'b']);
    expect(events.map(list => list.map(e => [e.node.name, e.participants]))).toEqual([[['The Raid', ['person:sky']]], []]);
  });

  it('says who is where in a chapter', () => {
    const lines = journeyLines(graph, ['a', 'b', 'c'], travellers(graph).map(t => t.node));
    expect(whereInChapter(lines, journeyPlaces(lines), 1).map(g => [g.place.name, g.people.map(p => p.node.name)]))
      .toEqual([['Camp', ['Lia', 'Sky']], ['Izmeer', ['Sky']]]);
  });

  it('says which place inside a row someone rolled up into it is at', () => {
    const lines = journeyLines(graph, ['a', 'b', 'c'], travellers(graph).map(t => t.node));
    const treetop = journeyPlaces(lines).find(p => p.name === 'Treetop')!;
    const rows = placeOnRows(lines, new Set(['place:treetop']), new Map([['place:camp', 'place:treetop']]));
    expect(whereInChapter(rows, [treetop], 0).map(g => g.people.map(p => [p.node.name, p.within.map(w => w.name)])))
      .toEqual([[['Lia', []], ['Sky', ['Camp']]]]);
  });
});

describe('place hierarchy', () => {
  const inside = (subject: string, target: string, type: 'located_in' | 'part_of' = 'located_in'): MemoryClaim => ({
    key: Math.random().toString(16).slice(2).padEnd(64, '0'), subject, kind: 'place', aliases: [], statement: `${subject} is in ${target}.`,
    quote: `${subject} lies in ${target}.`, basis: 'stated', scope: '', related: [target], time: 'ongoing', relations: [{ target, type }],
  });
  const places = ['Clearwell', "Vic's safe house", 'Harbor', 'Lower Harbor'].map(place);
  const city = buildMemoryGraph({ profile: { enabled: true, register: 'auto', genre: '', guidance: '' }, chapters: [
    { ...chapter('a', 0, places), claims: [inside("Vic's safe house", 'Clearwell'), inside("Vic's safe house", 'Clearwell'),
      inside('Clearwell', "Vic's safe house"), inside('Harbor', 'Clearwell', 'part_of'), inside('Lower Harbor', 'Harbor')] },
  ] });
  const node = (name: string) => city.nodes.find(n => n.name === name)!;

  it('nests places by their best-supported containers, never inside themselves', () => {
    expect(Object.fromEntries(placeParents(city))).toEqual({
      "place:vics safe house": 'place:clearwell', 'place:harbor': 'place:clearwell', 'place:lower harbor': 'place:harbor',
    });
  });

  it("lets the author move a place out, or into another, but not into its own insides", () => {
    const parents = withNesting(placeParents(city), { 'place:harbor': null, 'place:clearwell': 'place:lower harbor' });
    expect(parents.get('place:harbor')).toBeUndefined();
    expect(parents.get('place:clearwell')).toBe('place:lower harbor');
    expect(withNesting(placeParents(city), { 'place:clearwell': 'place:lower harbor' }).get('place:clearwell')).toBeUndefined();
  });

  it('adds containers before their places and lays the places out as a tree', () => {
    const parents = placeParents(city);
    const listed = withContainers([node('Lower Harbor'), node("Vic's safe house")], parents, city);
    expect(listed.map(p => p.name)).toEqual(['Clearwell', 'Harbor', 'Lower Harbor', "Vic's safe house"]);
    const tree = placeTree(listed, parents);
    expect(tree.map(r => [r.place.name, r.depth, r.inside])).toEqual([
      ['Clearwell', 0, 3], ['Harbor', 1, 1], ['Lower Harbor', 2, 0], ["Vic's safe house", 1, 0],
    ]);
    expect(shownRows(tree, new Set(["place:vics safe house"]), new Set(['place:harbor'])).map(r => r.place.name))
      .toEqual(['Clearwell', 'Harbor']);
  });
});
