export type AsciiMapDirection =
  | 'north' | 'northeast' | 'east' | 'southeast'
  | 'south' | 'southwest' | 'west' | 'northwest'
  | 'same_area' | 'inside' | 'contains' | 'unknown';

export type AsciiMapDistance =
  | 'same_site' | 'adjacent' | 'nearby'
  | 'moderate_journey' | 'distant' | 'unknown';

export type AsciiMapPlaceKind =
  | 'settlement' | 'region' | 'forest'
  | 'mountain' | 'water' | 'structure';

export interface AsciiMapPlace {
  name: string;
  kind: AsciiMapPlaceKind;
  latitude?: number;
  longitude?: number;
}

export interface AsciiMapRelationship {
  from: string;
  to: string;
  direction: AsciiMapDirection;
  distance: AsciiMapDistance;
}

export interface AsciiMapBetween {
  place: string;
  from: string;
  to: string;
}

interface Point {
  x: number;
  y: number;
}

const DIRECTION_VECTOR: Partial<Record<AsciiMapDirection, Point>> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
};

const DISTANCE_STEP: Record<AsciiMapDistance, number> = {
  same_site: 0.2,
  adjacent: 0.75,
  nearby: 1.15,
  moderate_journey: 1.8,
  distant: 2.7,
  unknown: 1.3,
};

function add(point: Point, vector: Point, scale: number): Point {
  return { x: point.x + vector.x * scale, y: point.y + vector.y * scale };
}

function subtract(point: Point, vector: Point, scale: number): Point {
  return { x: point.x - vector.x * scale, y: point.y - vector.y * scale };
}

function clippedLabel(name: string) {
  const normalized = name.replace(/\s+/g, ' ').trim();
  return normalized.length > 22 ? `${normalized.slice(0, 19)}...` : normalized;
}

export function layoutAsciiMap(
  places: AsciiMapPlace[],
  relationships: AsciiMapRelationship[],
  between: AsciiMapBetween[],
) {
  const positions = new Map<string, Point>();
  if (places.length === 0) return positions;
  places.forEach(place => {
    if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
      positions.set(place.name, { x: place.longitude!, y: -place.latitude! });
    }
  });
  if (positions.size === 0) positions.set(places[0].name, { x: 0, y: 0 });

  // Lay out connected cardinal relationships first. Disconnected components
  // receive a new seed and are still kept in the same preview.
  while (positions.size < places.length) {
    let changed = false;
    for (const relationship of relationships) {
      const vector = DIRECTION_VECTOR[relationship.direction];
      if (!vector) continue;
      const from = positions.get(relationship.from);
      const to = positions.get(relationship.to);
      const step = DISTANCE_STEP[relationship.distance];
      if (from && !to) {
        positions.set(relationship.to, add(from, vector, step));
        changed = true;
      } else if (!from && to) {
        positions.set(relationship.from, subtract(to, vector, step));
        changed = true;
      }
    }
    if (changed) continue;
    const next = places.find(place => !positions.has(place.name));
    if (!next) break;
    const maxX = Math.max(...[...positions.values()].map(point => point.x));
    positions.set(next.name, { x: maxX + 1.8, y: positions.size % 2 ? 1.2 : -1.2 });
  }

  // Explicit between relationships are stronger than pairwise distance guesses.
  // Put the intermediate place at the anchors' midpoint.
  for (const item of between) {
    const from = positions.get(item.from);
    const to = positions.get(item.to);
    if (!from || !to) continue;
    positions.set(item.place, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  }

  const kindByName = new Map(places.map(place => [place.name, place.kind]));
  const activeNames = new Set<string>();
  relationships.forEach(relationship => {
    if (DIRECTION_VECTOR[relationship.direction]) {
      activeNames.add(relationship.from);
      activeNames.add(relationship.to);
    }
  });
  between.forEach(item => {
    activeNames.add(item.place);
    activeNames.add(item.from);
    activeNames.add(item.to);
  });
  const containerSpecificity: Record<AsciiMapPlaceKind, number> = {
    region: 0,
    mountain: 1,
    water: 1,
    forest: 3,
    settlement: 4,
    structure: 4,
  };
  const selectedContainer = new Map<string, string>();
  for (const relationship of relationships) {
    const containment = relationship.direction === 'inside'
      ? { container: relationship.from, member: relationship.to }
      : relationship.direction === 'contains'
        ? { container: relationship.to, member: relationship.from }
        : null;
    if (!containment) continue;
    const current = selectedContainer.get(containment.member);
    const nextKind = kindByName.get(containment.container) || 'region';
    const currentKind = current ? kindByName.get(current) || 'region' : null;
    if (!currentKind || containerSpecificity[nextKind] > containerSpecificity[currentKind]) {
      selectedContainer.set(containment.member, containment.container);
    }
  }

  // Prefer an explicitly positioned route landmark. If only the contained
  // landmark has route evidence, center its enclosing terrain on that point.
  let containmentOffset = 0;
  for (const [memberName, containerName] of selectedContainer) {
    const member = positions.get(memberName);
    const container = positions.get(containerName);
    if (!member || !container) continue;
    containmentOffset += 1;
    if (activeNames.has(memberName) && !activeNames.has(containerName)) {
      positions.set(containerName, { ...member });
    } else if (!activeNames.has(memberName)) {
      positions.set(memberName, { ...container });
    }
    const centered = positions.get(containerName)!;
    positions.set(memberName, {
      x: centered.x + (containmentOffset % 2 ? 0.08 : -0.08),
      y: centered.y,
    });
  }

  return positions;
}

export function buildAsciiMap(
  places: AsciiMapPlace[],
  relationships: AsciiMapRelationship[],
  between: AsciiMapBetween[],
  width?: number,
  height?: number,
) {
  if (places.length === 0) return '';
  width ??= Math.min(220, 84 + Math.max(0, places.length - 6) * 8);
  height ??= Math.min(72, 24 + Math.max(0, places.length - 6) * 3);
  const positions = layoutAsciiMap(places, relationships, between);
  const points = [...positions.values()];
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));
  const reserved = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const plotted = new Map<string, { x: number; y: number }>();
  const placeByName = new Map(places.map(place => [place.name, place]));

  const containment = relationships.flatMap(relationship => {
    if (relationship.direction === 'inside') {
      return [{ container: relationship.from, member: relationship.to }];
    }
    if (relationship.direction === 'contains') {
      return [{ container: relationship.to, member: relationship.from }];
    }
    return [];
  });
  const directContainer = new Map<string, string>();
  const containerSpecificity: Record<AsciiMapPlaceKind, number> = {
    region: 0,
    mountain: 1,
    water: 1,
    forest: 3,
    settlement: 4,
    structure: 4,
  };
  containment.forEach(item => {
    const existing = directContainer.get(item.member);
    const existingKind = existing ? placeByName.get(existing)?.kind || 'region' : null;
    const nextKind = placeByName.get(item.container)?.kind || 'region';
    if (!existingKind || containerSpecificity[nextKind] > containerSpecificity[existingKind]) {
      directContainer.set(item.member, item.container);
    }
  });
  const directMembers = (container: string) => [...directContainer.entries()]
    .filter(([, parent]) => parent === container)
    .map(([member]) => member);

  const plotPoint = (name: string) => {
    const point = positions.get(name) || { x: 0, y: 0 };
    const horizontalPadding = Math.min(15, Math.floor(width / 5));
    const verticalPadding = Math.min(5, Math.floor(height / 4));
    const x = Math.round(horizontalPadding + ((point.x - minX) / spanX) * (width - horizontalPadding * 2));
    const y = Math.round(verticalPadding + ((point.y - minY) / spanY) * (height - verticalPadding * 2));
    const plottedPoint = { x: Math.max(1, Math.min(width - 2, x)), y: Math.max(1, Math.min(height - 2, y)) };
    plotted.set(name, plottedPoint);
    return plottedPoint;
  };
  places.forEach(place => plotPoint(place.name));

  const drawConnection = (fromName: string, toName: string) => {
    const from = plotted.get(fromName);
    const to = plotted.get(toName);
    if (!from || !to) return;
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let step = 1; step < steps; step += 1) {
      const x = Math.round(from.x + ((to.x - from.x) * step) / steps);
      const y = Math.round(from.y + ((to.y - from.y) * step) / steps);
      if (grid[y]?.[x] === ' ') grid[y][x] = '.';
    }
  };
  relationships
    .filter(relationship => Boolean(DIRECTION_VECTOR[relationship.direction]))
    .forEach(relationship => drawConnection(relationship.from, relationship.to));
  between.forEach(item => {
    drawConnection(item.from, item.place);
    drawConnection(item.place, item.to);
  });

  const canWrite = (x: number, y: number, text: string) => {
    if (x < 0 || x + text.length > width || y < 0 || y >= height) return false;
    return text.split('').every((_character, index) => !reserved[y][x + index]);
  };
  const write = (x: number, y: number, text: string) => {
    text.split('').forEach((character, index) => {
      grid[y][x + index] = character;
      reserved[y][x + index] = true;
    });
  };

  const paint = (x: number, y: number, character: string) => {
    if (x < 0 || x >= width || y < 0 || y >= height || reserved[y][x]) return;
    grid[y][x] = character;
  };
  const writeCentered = (centerX: number, y: number, text: string) => {
    const clipped = text.slice(0, width);
    const preferredX = Math.max(0, Math.min(width - clipped.length, centerX - Math.floor(clipped.length / 2)));
    if (canWrite(preferredX, y, clipped)) write(preferredX, y, clipped);
  };

  const terrainRegions = places.filter(place => place.kind === 'region'
    && /\b(plain|plains|steppe|desert)\b/i.test(place.name));
  const boundedRegions = places.filter(place => place.kind === 'region'
    && !/\b(plain|plains|steppe|desert)\b/i.test(place.name));

  // Only explicit terrain expanses span the map. Countries, districts and
  // other regions use bounded areas so multiple real-world regions can coexist.
  terrainRegions.forEach(place => {
    const point = plotted.get(place.name);
    if (!point) return;
    const centerY = Math.max(3, Math.min(height - 4, point.y));
    for (let y = centerY - 2; y <= centerY + 2; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        paint(x, y, y === centerY - 2 || y === centerY + 2 ? '─' : '·');
      }
    }
    writeCentered(Math.floor(width / 2), centerY - 2, `[${clippedLabel(place.name)}]`);
  });

  boundedRegions
    .sort((a, b) => directMembers(b.name).length - directMembers(a.name).length)
    .forEach(place => {
      const point = plotted.get(place.name);
      if (!point) return;
      const memberPoints = directMembers(place.name)
        .map(name => plotted.get(name))
        .filter((member): member is { x: number; y: number } => Boolean(member));
      const xs = [point.x, ...memberPoints.map(member => member.x)];
      const ys = [point.y, ...memberPoints.map(member => member.y)];
      let left = Math.max(1, Math.min(...xs) - 4);
      let right = Math.min(width - 2, Math.max(...xs) + 4);
      let top = Math.max(1, Math.min(...ys) - 2);
      let bottom = Math.min(height - 2, Math.max(...ys) + 2);
      if (right - left < 18) {
        const extra = 18 - (right - left);
        left = Math.max(1, left - Math.ceil(extra / 2));
        right = Math.min(width - 2, left + 18);
        left = Math.max(1, right - 18);
      }
      if (bottom - top < 4) {
        top = Math.max(1, point.y - 2);
        bottom = Math.min(height - 2, top + 4);
        top = Math.max(1, bottom - 4);
      }
      for (let x = left + 1; x < right; x += 1) {
        paint(x, top, '─');
        paint(x, bottom, '─');
      }
      for (let y = top + 1; y < bottom; y += 1) {
        paint(left, y, '│');
        paint(right, y, '│');
        for (let x = left + 2; x < right; x += 4) paint(x, y, '·');
      }
      paint(left, top, '┌');
      paint(right, top, '┐');
      paint(left, bottom, '└');
      paint(right, bottom, '┘');
      const label = `[${clippedLabel(place.name)}]`;
      const labelX = Math.max(0, Math.min(width - label.length, Math.floor((left + right - label.length) / 2)));
      const labelY = [top, top + 1, bottom].find(y => canWrite(labelX, y, label));
      if (labelY !== undefined) write(labelX, labelY, label);
    });

  // Forests are areas, not point markers. A forest enclosing a structure is
  // shown as a rounded grove; other forests use a rectangular boundary.
  places.filter(place => place.kind === 'forest').forEach(place => {
    const point = plotted.get(place.name);
    if (!point) return;
    const members = directMembers(place.name);
    const containsStructure = members.some(name => placeByName.get(name)?.kind === 'structure');
    const halfWidth = 13;
    const halfHeight = 3;
    const left = Math.max(1, Math.min(width - halfWidth * 2 - 2, point.x - halfWidth));
    const right = left + halfWidth * 2;
    const top = Math.max(1, Math.min(height - halfHeight * 2 - 2, point.y - halfHeight));
    const bottom = top + halfHeight * 2;
    if (containsStructure) {
      for (let x = left + 4; x <= right - 4; x += 1) {
        paint(x, top, '-');
        paint(x, bottom, '-');
      }
      paint(left + 2, top + 1, '/');
      paint(left, top + 2, '(');
      paint(left, bottom - 2, '(');
      paint(right - 2, top + 1, '\\');
      paint(right, top + 2, ')');
      paint(right, bottom - 2, ')');
      paint(left + 2, bottom - 1, '\\');
      paint(right - 2, bottom - 1, '/');
    } else {
      for (let x = left + 1; x < right; x += 1) {
        paint(x, top, '-');
        paint(x, bottom, '-');
      }
      for (let y = top + 1; y < bottom; y += 1) {
        paint(left, y, '|');
        paint(right, y, '|');
      }
      paint(left, top, '+');
      paint(right, top, '+');
      paint(left, bottom, '+');
      paint(right, bottom, '+');
    }
    for (let y = top + 1; y < bottom; y += 1) {
      for (let x = left + 1; x < right; x += 3) paint(x, y, '♠');
    }
    const forestLabel = `[${clippedLabel(place.name)}]`;
    const forestCenter = Math.floor((left + right) / 2);
    const labelY = [top, top + 1, bottom - 1].find(y => {
      const x = Math.max(0, Math.min(width - forestLabel.length, forestCenter - Math.floor(forestLabel.length / 2)));
      return canWrite(x, y, forestLabel);
    });
    if (labelY !== undefined) writeCentered(forestCenter, labelY, forestLabel);
  });

  places.filter(place => place.kind === 'mountain').forEach(place => {
    const point = plotted.get(place.name);
    if (!point) return;
    const top = Math.max(1, point.y - 1);
    writeCentered(point.x, top, '/▲\\  /▲\\  /▲\\');
    writeCentered(point.x, top + 1, '/  \\/  \\/  \\');
  });

  places.filter(place => place.kind === 'water').forEach(place => {
    const point = plotted.get(place.name);
    if (!point) return;
    writeCentered(point.x, point.y, '≈≈≈≈≈');
  });

  places.filter(place => !['region', 'forest', 'mountain', 'water'].includes(place.kind)).forEach(place => {
    const point = plotted.get(place.name);
    if (!point) return;
    grid[point.y][point.x] = place.kind === 'settlement' ? '⌂' : '◆';
    reserved[point.y][point.x] = true;
  });

  places.forEach(place => {
    const point = plotted.get(place.name);
    if (!point) return;
    if (place.kind === 'region' || place.kind === 'forest') return;
    const label = `[${clippedLabel(place.name)}]`;
    const preferredX = Math.max(0, Math.min(width - label.length, point.x - Math.floor(label.length / 2)));
    const insideForest = place.kind === 'settlement' || place.kind === 'structure'
      ? placeByName.get(directContainer.get(place.name) || '')?.kind === 'forest'
      : false;
    const candidates = insideForest
      ? [point.y + 1, point.y + 2, point.y - 1, point.y - 2]
      : [point.y + 2, point.y + 1, point.y - 1, point.y + 3, point.y - 2];
    const labelY = candidates.find(y => canWrite(preferredX, y, label));
    if (labelY !== undefined) write(preferredX, labelY, label);
  });

  const north = ' N ';
  const leftRule = Math.floor((width - north.length) / 2);
  const top = `+${'-'.repeat(leftRule)}${north}${'-'.repeat(width - leftRule - north.length)}+`;
  const bottom = `+${'-'.repeat(width)}+`;
  const compass = `W ${'<'.repeat(Math.max(3, Math.floor(width / 3)))}  west / east  ${'>'.repeat(Math.max(3, Math.floor(width / 3)))} E`;
  const legend = '⌂ settlement   ◆ structure   ♠ forest   ▲ mountain   ≈ water   · plain';
  return [
    top,
    ...grid.map(row => `|${row.join('')}|`),
    bottom,
    compass,
    legend,
  ].join('\n');
}
