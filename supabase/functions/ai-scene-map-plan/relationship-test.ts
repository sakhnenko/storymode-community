import type { MapPlaceKind, ProminentMapPlace } from "./place-inventory.ts";

// Pairwise questions grow quadratically; 16 places exceeded Jev's token budget.
export const MAX_RELATIONSHIP_TEST_PLACES = 8;
const MAX_JEV_CHAPTER_CHARS = 20_000;

/** Keep the chapter within budget by keeping passages around candidate mentions. */
function condenseChapter(chapter: string, names: string[]) {
  if (chapter.length <= MAX_JEV_CHAPTER_CHARS) return chapter;
  const paragraphs = chapter.split(/\n{2,}/);
  const lowered = names.map(n => n.toLowerCase()).filter(Boolean);
  const keep = new Set<number>();
  paragraphs.forEach((p, i) => {
    const lp = p.toLowerCase();
    if (lowered.some(n => lp.includes(n))) keep.add(i);
  });
  let out = "";
  for (let i = 0; i < paragraphs.length; i += 1) {
    if (!keep.has(i)) continue;
    if (out.length + paragraphs[i].length + 2 > MAX_JEV_CHAPTER_CHARS) break;
    out += (out ? "\n\n" : "") + paragraphs[i];
  }
  return out || chapter.slice(0, MAX_JEV_CHAPTER_CHARS);
}

const DIRECTIONS = [
  "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest",
  "same_area", "inside", "contains", "unknown",
] as const;

const DISTANCES = ["same_site", "adjacent", "nearby", "moderate_journey", "distant", "unknown"] as const;
const NARRATIVE_ANCHOR_THRESHOLD = 0.35;

export type MapDirection = typeof DIRECTIONS[number];
export type MapDistance = typeof DISTANCES[number];

export interface RelationshipTestPlace {
  name: string;
  kind: MapPlaceKind;
  mapScaleProbability: number;
  sceneRelevanceProbability: number;
  kindConfidence: number;
  latitude?: number;
  longitude?: number;
}

export interface MapRelationship {
  from: string;
  to: string;
  direction: MapDirection;
  distance: MapDistance;
  directionConfidence: number;
  distanceConfidence: number;
}

export interface MapBetweenRelationship {
  place: string;
  from: string;
  to: string;
  confidence: number;
}

export interface MapRelationshipTestResult {
  places: RelationshipTestPlace[];
  relationships: MapRelationship[];
  between: MapBetweenRelationship[];
  evaluatedCandidates: number;
}

type JevQuestion = {
  type: "noul" | "choice";
  instructions: string;
  criteria?: Record<string, string | null>;
};

export interface JevRelationshipRequest {
  state: {
    chapter: string;
    candidates: Array<{
      name: string;
      currentKind: MapPlaceKind;
      context: string;
      mentions: number;
      realWorld?: boolean;
      latitude?: number;
      longitude?: number;
    }>;
  };
  questions: Record<string, JevQuestion>;
}

function clampProbability(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}

function candidatePriority(place: ProminentMapPlace) {
  return (place.requireLandmark ? 100 : 0) + place.mentions * 10 - place.firstIndex / 1_000_000;
}

export function selectRelationshipCandidates(places: ProminentMapPlace[]) {
  return [...places]
    .sort((a, b) => candidatePriority(b) - candidatePriority(a))
    .slice(0, MAX_RELATIONSHIP_TEST_PLACES);
}

export function buildJevRelationshipRequest(
  chapter: string,
  detectedPlaces: ProminentMapPlace[],
): JevRelationshipRequest {
  const candidates = selectRelationshipCandidates(detectedPlaces);
  const questions: Record<string, JevQuestion> = {};

  candidates.forEach((_candidate, index) => {
    questions[`place_${index}_map_scale`] = {
      type: "noul",
      instructions: `Is \`candidates[${index}]\` a named, map-scale geographic place or major destination in \`chapter\`?`,
      criteria: {
        true: "A city, settlement, country, geographic region, natural feature, named street, significant residence or building, or major destination suitable for a chapter map.",
        false: "A person, item, room, generic terrain detail, temporary event location, or invented false positive.",
      },
    };
    questions[`place_${index}_scene_relevant`] = {
      type: "noul",
      instructions: `Does \`candidates[${index}]\` materially anchor any scene, residence, journey, remembered setting, historical episode, or present-day reflection anywhere in \`chapter\`? Treat the opening, archival material, later-life scenes, and closing frame equally; do not prefer the earliest or longest episode.`,
      criteria: {
        true: "The place anchors a scene, residence, journey, memory, historical event, later-life reflection, or materially located passage in the chapter; or it contains, surrounds, connects, or bounds that geography.",
        false: "The place is merely rhetorical, hypothetical, incidental, or named only in dialogue without materially locating any scene, journey, residence, or historical event in the chapter.",
      },
    };
    questions[`place_${index}_kind`] = {
      type: "choice",
      instructions: `Which StoryMode map category best describes \`candidates[${index}]\` in \`chapter\`?`,
      criteria: {
        settlement: "A camp, village, town, city, port, or inhabited community.",
        region: "A country, province, district, neighborhood, named plain, steppe, desert, realm, or other broad terrain region.",
        forest: "A named forest, wood, or grove.",
        mountain: "A mountain, range, ridge, canyon, valley, or peak.",
        water: "A river, lake, waterfall, island, or harbor.",
        structure: "A named street, residence, house, venue, fortress, castle, temple, ruin, cave system, bridge, monument, or other significant site.",
      },
    };

    const betweenCriteria: Record<string, string | null> = {
      none: "This place is not described as lying between any two other candidate places.",
    };
    for (let fromIndex = 0; fromIndex < candidates.length; fromIndex += 1) {
      if (fromIndex === index) continue;
      for (let toIndex = fromIndex + 1; toIndex < candidates.length; toIndex += 1) {
        if (toIndex === index) continue;
        betweenCriteria[`between_${fromIndex}_${toIndex}`] =
          `This place lies geographically between candidates[${fromIndex}] and candidates[${toIndex}].`;
      }
    }
    questions[`place_${index}_between`] = {
      type: "choice",
      instructions: `Which pair of other candidates is \`candidates[${index}]\` described as lying between in \`chapter\`? Use explicit route, ordering, containment, and region descriptions. Choose none unless the chapter supports one pair.`,
      criteria: betweenCriteria,
    };
  });

  for (let fromIndex = 0; fromIndex < candidates.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < candidates.length; toIndex += 1) {
      const prefix = `pair_${fromIndex}_${toIndex}`;
      questions[`${prefix}_direction`] = {
        type: "choice",
        instructions: `Where is \`candidates[${toIndex}]\` relative to \`candidates[${fromIndex}]\`? First use spatial evidence in \`chapter\`. When both candidates have realWorld=true, use their supplied latitude and longitude plus reliable general geographic knowledge for broad cardinal position and established administrative containment. Do not apply world knowledge to fictional, invented, historically ambiguous, or uncertain names. Use explicit between-place and containment facts transitively: a place between an origin and an eastern destination is east of the origin, and a contained place may inherit its container's regional direction. Choose unknown when neither the chapter nor reliable real-world geography supports a direction or containment relationship.`,
        criteria: {
          north: "North or above on a conventional map.",
          northeast: "Northeast.",
          east: "East or to the right on a conventional map.",
          southeast: "Southeast.",
          south: "South or below on a conventional map.",
          southwest: "Southwest.",
          west: "West or to the left on a conventional map.",
          northwest: "Northwest.",
          same_area: "The two places occupy approximately the same area.",
          inside: `\`candidates[${toIndex}]\` is inside, on, or within the broader region of \`candidates[${fromIndex}]\`.`,
          contains: `\`candidates[${toIndex}]\` contains, surrounds, or is the broader region holding \`candidates[${fromIndex}]\`.`,
          unknown: "No reliable direction or containment relationship is stated or implied.",
        },
      };
      questions[`${prefix}_distance`] = {
        type: "choice",
        instructions: `How far is \`candidates[${toIndex}]\` from \`candidates[${fromIndex}]\`? First use travel time, adjacency, containment, visibility, or explicit distance in \`chapter\`. If both names unambiguously identify real-world places, also use reliable general geographic knowledge at the broad story-map scale. Do not apply world knowledge to fictional, invented, historically ambiguous, or uncertain names. Choose unknown when neither source provides sufficient evidence.`,
        criteria: {
          same_site: "The same site, overlapping places, or one contained inside the other.",
          adjacent: "Immediately adjacent or only a few steps apart.",
          nearby: "A short walk or visible local destination.",
          moderate_journey: "A meaningful journey, such as several hours or a substantial trip within the chapter.",
          distant: "A day or more away, or clearly a remote region or destination.",
          unknown: "The chapter does not provide reliable distance evidence.",
        },
      };
    }
  }

  return {
    state: {
      chapter: condenseChapter(chapter, candidates.map(place => place.name)),
      candidates: candidates.map(place => ({
        name: place.name,
        currentKind: place.kind,
        context: place.context,
        mentions: place.mentions,
        realWorld: place.realWorld,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    },
    questions,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function choiceAnswer(answers: Record<string, unknown>, key: string) {
  const answer = record(answers[key]);
  return {
    choice: String(answer.choice || ""),
    confidence: clampProbability(answer.confidence),
  };
}

function hasCoordinates(candidate: JevRelationshipRequest["state"]["candidates"][number]) {
  return candidate.realWorld === true
    && Number.isFinite(candidate.latitude)
    && Number.isFinite(candidate.longitude);
}

function coordinateDirection(
  from: JevRelationshipRequest["state"]["candidates"][number],
  to: JevRelationshipRequest["state"]["candidates"][number],
): MapDirection | null {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null;
  const radians = Math.PI / 180;
  const fromLatitude = from.latitude! * radians;
  const toLatitude = to.latitude! * radians;
  const longitudeDelta = (to.longitude! - from.longitude!) * radians;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  const bearing = (Math.atan2(y, x) / radians + 360) % 360;
  const directions: MapDirection[] = [
    "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest",
  ];
  return directions[Math.round(bearing / 45) % 8];
}

function coordinateDistance(
  from: JevRelationshipRequest["state"]["candidates"][number],
  to: JevRelationshipRequest["state"]["candidates"][number],
): MapDistance | null {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null;
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude! - from.latitude!) * radians;
  const longitudeDelta = (to.longitude! - from.longitude!) * radians;
  const fromLatitude = from.latitude! * radians;
  const toLatitude = to.latitude! * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const kilometers = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  if (kilometers < 2) return "same_site";
  if (kilometers < 25) return "nearby";
  if (kilometers < 250) return "moderate_journey";
  return "distant";
}

export function parseJevRelationshipResult(
  response: unknown,
  request: JevRelationshipRequest,
): MapRelationshipTestResult {
  const answers = record(record(response).answers);
  const allowedKinds = new Set<MapPlaceKind>(["settlement", "region", "forest", "mountain", "water", "structure"]);
  const allowedDirections = new Set<string>(DIRECTIONS);
  const allowedDistances = new Set<string>(DISTANCES);

  const places = request.state.candidates.map((candidate, index) => {
    const mapScale = record(answers[`place_${index}_map_scale`]);
    const sceneRelevance = record(answers[`place_${index}_scene_relevant`]);
    const kindAnswer = choiceAnswer(answers, `place_${index}_kind`);
    const kind = allowedKinds.has(kindAnswer.choice as MapPlaceKind)
      ? kindAnswer.choice as MapPlaceKind
      : candidate.currentKind;
    return {
      name: candidate.name,
      kind,
      mapScaleProbability: clampProbability(mapScale.noul),
      sceneRelevanceProbability: clampProbability(sceneRelevance.noul),
      kindConfidence: kindAnswer.confidence,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    };
  }).filter(place => place.mapScaleProbability >= 0.5
    && place.sceneRelevanceProbability >= NARRATIVE_ANCHOR_THRESHOLD);

  const chosenNames = new Set(places.map(place => place.name));
  const between: MapBetweenRelationship[] = [];
  request.state.candidates.forEach((candidate, index) => {
    if (!chosenNames.has(candidate.name)) return;
    const answer = choiceAnswer(answers, `place_${index}_between`);
    const match = /^between_(\d+)_(\d+)$/.exec(answer.choice);
    if (!match) return;
    const fromIndex = Number(match[1]);
    const toIndex = Number(match[2]);
    const from = request.state.candidates[fromIndex]?.name;
    const to = request.state.candidates[toIndex]?.name;
    if (!from || !to || from === candidate.name || to === candidate.name) return;
    if (!chosenNames.has(from) || !chosenNames.has(to)) return;
    between.push({ place: candidate.name, from, to, confidence: answer.confidence });
  });

  const relationships: MapRelationship[] = [];
  for (let fromIndex = 0; fromIndex < request.state.candidates.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < request.state.candidates.length; toIndex += 1) {
      const from = request.state.candidates[fromIndex].name;
      const to = request.state.candidates[toIndex].name;
      if (!chosenNames.has(from) || !chosenNames.has(to)) continue;
      const prefix = `pair_${fromIndex}_${toIndex}`;
      const directionAnswer = choiceAnswer(answers, `${prefix}_direction`);
      const distanceAnswer = choiceAnswer(answers, `${prefix}_distance`);
      let direction = allowedDirections.has(directionAnswer.choice)
        ? directionAnswer.choice as MapDirection
        : "unknown";
      let distance = allowedDistances.has(distanceAnswer.choice)
        ? distanceAnswer.choice as MapDistance
        : "unknown";
      if (direction === "unknown" && distance === "unknown") continue;
      const fromCandidate = request.state.candidates[fromIndex];
      const toCandidate = request.state.candidates[toIndex];
      const geographicDirection = coordinateDirection(fromCandidate, toCandidate);
      const geographicDistance = coordinateDistance(fromCandidate, toCandidate);
      if (geographicDirection && !["inside", "contains", "same_area"].includes(direction)) {
        direction = geographicDirection;
      }
      if (geographicDistance && distance !== "same_site") distance = geographicDistance;
      relationships.push({
        from,
        to,
        direction,
        distance,
        directionConfidence: directionAnswer.confidence,
        distanceConfidence: distanceAnswer.confidence,
      });
    }
  }

  const containmentOf = (relationship: MapRelationship) => relationship.direction === "inside"
    ? { container: relationship.from, member: relationship.to, confidence: relationship.directionConfidence }
    : relationship.direction === "contains"
      ? { container: relationship.to, member: relationship.from, confidence: relationship.directionConfidence }
      : null;
  const hasContainment = (container: string, member: string) => relationships.some(relationship => {
    const containment = containmentOf(relationship);
    return containment?.container === container && containment.member === member;
  });

  // Containment is transitive: if the Ark is inside Solar Forest and Solar
  // Forest is on the Izmeer Plain, the Ark is also on the Izmeer Plain.
  for (let pass = 0; pass < request.state.candidates.length; pass += 1) {
    let added = false;
    const containment = relationships.map(containmentOf).filter(Boolean) as Array<{
      container: string;
      member: string;
      confidence: number;
    }>;
    for (const inner of containment) {
      const outer = containment.find(item => item.member === inner.container);
      if (!outer || outer.container === inner.member || hasContainment(outer.container, inner.member)) continue;
      relationships.push({
        from: outer.container,
        to: inner.member,
        direction: "inside",
        distance: "same_site",
        directionConfidence: Math.min(inner.confidence, outer.confidence),
        distanceConfidence: Math.min(inner.confidence, outer.confidence),
      });
      added = true;
    }
    if (!added) break;
  }

  // A contained landmark inherits the supported between-anchors relationship
  // of its container. This lets a site inside a forest share the forest's
  // regional placement without asking Jev to repeat the same inference.
  for (let pass = 0; pass < request.state.candidates.length; pass += 1) {
    let added = false;
    for (const relationship of relationships) {
      const containment = containmentOf(relationship);
      if (!containment || between.some(item => item.place === containment.member)) continue;
      const containerBetween = between.find(item => item.place === containment.container);
      if (!containerBetween) continue;
      between.push({
        place: containment.member,
        from: containerBetween.from,
        to: containerBetween.to,
        confidence: Math.min(containerBetween.confidence, relationship.directionConfidence),
      });
      added = true;
    }
    if (!added) break;
  }

  const cardinalDirections = new Set<MapDirection>([
    "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest",
  ]);
  const inverseDirection: Record<string, MapDirection> = {
    north: "south",
    northeast: "southwest",
    east: "west",
    southeast: "northwest",
    south: "north",
    southwest: "northeast",
    west: "east",
    northwest: "southeast",
  };
  const directionBetween = (from: string, to: string) => {
    const forward = relationships.find(item => item.from === from && item.to === to);
    if (forward && cardinalDirections.has(forward.direction)) {
      return { direction: forward.direction, confidence: forward.directionConfidence };
    }
    const reverse = relationships.find(item => item.from === to && item.to === from);
    if (reverse && cardinalDirections.has(reverse.direction)) {
      return { direction: inverseDirection[reverse.direction], confidence: reverse.directionConfidence };
    }
    return null;
  };
  const addDerivedDirection = (from: string, to: string, direction: MapDirection, confidence: number) => {
    const forward = relationships.find(item => item.from === from && item.to === to);
    if (forward) {
      if (forward.direction === "unknown") {
        forward.direction = direction;
        forward.directionConfidence = confidence;
      }
      return;
    }
    const reverse = relationships.find(item => item.from === to && item.to === from);
    if (reverse) {
      if (reverse.direction === "unknown") {
        reverse.direction = inverseDirection[direction];
        reverse.directionConfidence = confidence;
      }
      return;
    }
    relationships.push({
      from,
      to,
      direction,
      distance: "unknown",
      directionConfidence: confidence,
      distanceConfidence: 0,
    });
  };

  // If X lies between A and B, and B has a supported cardinal direction from
  // A, X inherits that direction from A and the same direction continues X→B.
  for (const item of between) {
    const anchorDirection = directionBetween(item.from, item.to);
    if (!anchorDirection) continue;
    const confidence = Math.min(item.confidence, anchorDirection.confidence);
    addDerivedDirection(item.from, item.place, anchorDirection.direction, confidence);
    addDerivedDirection(item.place, item.to, anchorDirection.direction, confidence);
  }

  return {
    places,
    relationships,
    between,
    evaluatedCandidates: request.state.candidates.length,
  };
}
