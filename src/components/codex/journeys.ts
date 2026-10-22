import { linksOf, pathOf, type GraphNode, type MemoryGraph } from '../../../supabase/functions/_shared/memory-graph';

/** One place a character is at in a chapter; `order` of `count` when the chapter moves them through several. */
export interface JourneyStop {
  chapterIndex: number;
  place: GraphNode;
  order: number;
  count: number;
  /**
   * The shown place the stop is drawn on: its own place, or the nearest shown
   * place it is inside when its own is turned off or collapsed.
   */
  row?: string;
  /** No shown place contains it: still a stop, drawn without a row. */
  hidden?: boolean;
}
export interface JourneyLine {
  node: GraphNode;
  stops: JourneyStop[];
}

/**
 * People whose journeys can be drawn (some chapter places them), ranked by
 * connections to other entries, then by chapters placed.
 */
export function travellers(graph: MemoryGraph) {
  return graph.nodes
    .filter(n => n.kind === 'person')
    .map(node => ({ node, links: linksOf(graph, node.id).length, chapters: pathOf(graph, node).filter(step => step.places.length).length }))
    .filter(t => t.chapters > 0)
    .sort((a, b) => b.links - a.links || b.chapters - a.chapters || a.node.name.localeCompare(b.node.name));
}

/** Each character's stops in book order, by chapter position in `chapterIds`. */
export function journeyLines(graph: MemoryGraph, chapterIds: string[], characters: GraphNode[]): JourneyLine[] {
  return characters.map(node => ({
    node,
    stops: pathOf(graph, node).flatMap(step => {
      const chapterIndex = chapterIds.indexOf(step.appearance.chapterId);
      if (chapterIndex < 0) return [];
      return step.places.map((place, order) => ({ chapterIndex, place, order, count: step.places.length }));
    }).sort((a, b) => a.chapterIndex - b.chapterIndex || a.order - b.order),
  }));
}

/** Places in the order the story first takes anyone there, so lines mostly run down the page. */
export function journeyPlaces(lines: JourneyLine[]) {
  const first = new Map<string, { place: GraphNode; at: number }>();
  lines.forEach(line => line.stops.forEach(stop => {
    const at = stop.chapterIndex * 100 + stop.order;
    const seen = first.get(stop.place.id);
    if (!seen || at < seen.at) first.set(stop.place.id, { place: stop.place, at });
  }));
  return [...first.values()].sort((a, b) => a.at - b.at).map(x => x.place);
}

/** Who is where in one chapter: each place with the characters there, in place order. */
/**
 * Who is where in a chapter, by the rows the stops are drawn on: each row with
 * the people on it and, for anyone rolled up into it, the places inside it
 * they are actually at.
 */
export function whereInChapter(lines: JourneyLine[], rows: GraphNode[], chapterIndex: number) {
  return rows.map(place => {
    const people = new Map<string, { node: GraphNode; within: GraphNode[] }>();
    for (const line of lines) for (const stop of line.stops) {
      if (stop.chapterIndex !== chapterIndex || stop.hidden || (stop.row ?? stop.place.id) !== place.id) continue;
      const entry = people.get(line.node.id) || { node: line.node, within: [] };
      if (stop.place.id !== place.id && !entry.within.includes(stop.place)) entry.within.push(stop.place);
      people.set(line.node.id, entry);
    }
    return { place, people: [...people.values()] };
  }).filter(group => group.people.length > 0);
}

/** People at places with no shown row in a chapter, by the place they are at. */
export function unshownInChapter(lines: JourneyLine[], chapterIndex: number) {
  const groups = new Map<string, { place: GraphNode; people: GraphNode[] }>();
  for (const line of lines) for (const stop of line.stops) {
    if (stop.chapterIndex !== chapterIndex || !stop.hidden) continue;
    const group = groups.get(stop.place.id) || { place: stop.place, people: [] };
    if (!group.people.includes(line.node)) group.people.push(line.node);
    groups.set(stop.place.id, group);
  }
  return [...groups.values()];
}

/** Whether `ancestor` is `id` or contains it, following `parents` up. */
function isWithin(parents: ReadonlyMap<string, string>, id: string, ancestor: string) {
  for (let at: string | undefined = id, steps = 0; at && steps < 100; at = parents.get(at), steps++) {
    if (at === ancestor) return true;
  }
  return false;
}

/**
 * The place each place is inside: where memory says it is located (or what it
 * is part of), taking the best-supported link first and never one that would
 * put a place inside itself.
 */
export function placeParents(graph: MemoryGraph): Map<string, string> {
  const links = graph.edges
    .filter(edge => (edge.type === 'located_in' || edge.type === 'part_of')
      && graph.nodeById.get(edge.from)?.kind === 'place' && graph.nodeById.get(edge.to)?.kind === 'place')
    .sort((a, b) => b.facts.length - a.facts.length);
  const parents = new Map<string, string>();
  for (const edge of links) {
    if (parents.has(edge.from) || isWithin(parents, edge.to, edge.from)) continue;
    parents.set(edge.from, edge.to);
  }
  return parents;
}

/** The author's nesting over memory's: a place id to its chosen parent, or null for top level. */
export function withNesting(parents: ReadonlyMap<string, string>, nesting: Record<string, string | null>) {
  const result = new Map(parents);
  for (const [id, parent] of Object.entries(nesting)) {
    result.delete(id);
    if (parent && parent !== id && !isWithin(result, parent, id)) result.set(id, parent);
  }
  return result;
}

/** Places with the places they are inside, each container just before its first place inside. */
export function withContainers(places: GraphNode[], parents: ReadonlyMap<string, string>, graph: MemoryGraph) {
  const result: GraphNode[] = [];
  const seen = new Set<string>();
  for (const place of places) {
    const chain: GraphNode[] = [];
    for (let id = parents.get(place.id), steps = 0; id && steps < 100; id = parents.get(id), steps++) {
      const node = graph.nodeById.get(id);
      if (node) chain.unshift(node);
    }
    for (const node of [...chain, place]) {
      if (!seen.has(node.id)) { seen.add(node.id); result.push(node); }
    }
  }
  return result;
}

export interface PlaceRow { place: GraphNode; depth: number; parent: string | null; inside: number }

/** Places as a tree in `places` order: each place followed by the places inside it. */
export function placeTree(places: GraphNode[], parents: ReadonlyMap<string, string>): PlaceRow[] {
  const ids = new Set(places.map(p => p.id));
  const parentOf = (id: string) => { const parent = parents.get(id); return parent && ids.has(parent) ? parent : null; };
  const children = new Map<string | null, GraphNode[]>();
  for (const place of places) {
    const parent = parentOf(place.id);
    children.set(parent, [...(children.get(parent) || []), place]);
  }
  const rows: PlaceRow[] = [];
  const count = (id: string): number => (children.get(id) || []).reduce((n, child) => n + 1 + count(child.id), 0);
  const walk = (parent: string | null, depth: number) => {
    for (const place of children.get(parent) || []) {
      rows.push({ place, depth, parent, inside: count(place.id) });
      walk(place.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** The rows on show: without turned-off places, and without the places inside a collapsed one. */
export function shownRows(rows: PlaceRow[], hidden: ReadonlySet<string>, collapsed: ReadonlySet<string>) {
  const shown: PlaceRow[] = [];
  let under = Infinity;
  for (const row of rows) {
    if (row.depth > under) continue;
    under = collapsed.has(row.place.id) ? row.depth : Infinity;
    if (!hidden.has(row.place.id)) shown.push(row);
  }
  return shown;
}

/**
 * Draws each stop on its own place's row, or rolls it up to the nearest shown
 * place containing it (a turned-off safe house shows in its city); a stop no
 * shown place contains stays on the line without a row.
 */
export function placeOnRows(lines: JourneyLine[], shown: ReadonlySet<string>, parents: ReadonlyMap<string, string>): JourneyLine[] {
  const rowOf = (id: string) => {
    for (let at: string | undefined = id, steps = 0; at && steps < 100; at = parents.get(at), steps++) {
      if (shown.has(at)) return at;
    }
    return undefined;
  };
  return lines.map(line => ({
    node: line.node,
    stops: line.stops.map(stop => {
      const row = rowOf(stop.place.id);
      return row ? { ...stop, row } : { ...stop, hidden: true };
    }),
  }));
}

/**
 * Places in the author's chosen order: the saved ids first, in that order,
 * then any place not yet arranged right after the place it follows in the
 * story, so new places land near where they belong.
 */
export function arrangePlaces(natural: GraphNode[], saved: string[]) {
  const byId = new Map(natural.map(place => [place.id, place]));
  const result = [...new Set(saved)].filter(id => byId.has(id)).map(id => byId.get(id)!);
  natural.forEach((place, i) => {
    if (result.includes(place)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = result.indexOf(natural[j]);
      if (k >= 0) { at = k + 1; break; }
    }
    result.splice(at, 0, place);
  });
  return result;
}

/**
 * The saved order after a drag among the places now in the chart (`shown`,
 * already in its new order). Saved places not in the chart, such as those of
 * characters not shown right now, keep their spot after the place they
 * followed, so arranging one view never undoes another.
 */
export function withMovedOrder(saved: string[], shown: string[]) {
  const inChart = new Set(shown);
  const after = new Map<string | null, string[]>();
  let anchor: string | null = null;
  for (const id of new Set(saved)) {
    if (inChart.has(id)) { anchor = id; continue; }
    after.set(anchor, [...(after.get(anchor) || []), id]);
  }
  return [...(after.get(null) || []), ...shown.flatMap(id => [id, ...(after.get(id) || [])])];
}

/** An event the story shows happening in a chapter, with the people linked as taking part. */
export interface JourneyEvent {
  node: GraphNode;
  participants: string[];
}

/**
 * The events each chapter shows happening (onstage there), the most crowded
 * first. The analyzer records an event only for major plot moments.
 */
export function journeyEvents(graph: MemoryGraph, chapterIds: string[]): JourneyEvent[][] {
  const byChapter: JourneyEvent[][] = chapterIds.map(() => []);
  for (const node of graph.nodes) {
    if (node.kind !== 'event') continue;
    const participants = [...new Set(linksOf(graph, node.id)
      .filter(link => link.edge.type === 'participates' && link.other.kind === 'person')
      .map(link => link.other.id))];
    for (const appearance of node.appearances) {
      if (appearance.presence !== 'onstage') continue;
      const index = chapterIds.indexOf(appearance.chapterId);
      if (index >= 0) byChapter[index].push({ node, participants });
    }
  }
  for (const list of byChapter) {
    list.sort((a, b) => b.participants.length - a.participants.length || a.node.name.localeCompare(b.node.name));
  }
  return byChapter;
}
