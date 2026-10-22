export interface LandmarkPlan {
  label: string;
  prompt: string;
  x: number;
  y: number;
  size: number;
}

export interface MapLabelPlan {
  text: string;
  x: number;
  y: number;
  kind: "location" | "event";
}

export interface RequiredLandmark {
  name: string;
  kind: string;
  context: string;
  requireLandmark: boolean;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function canonical(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const PEOPLE_TERMS = /\b(person|people|human|humans|figure|figures|character|characters|crowd|crowds|group of|traveler|travelers|traveller|travellers|warrior|warriors|soldier|soldiers|child|children|boy|boys|girl|girls|man|men|woman|women|climbing|standing|sitting|walking|running)\b/i;
const PEOPLE_TERMS_GLOBAL = /\b(person|people|human|humans|figure|figures|character|characters|crowd|crowds|group of|traveler|travelers|traveller|travellers|warrior|warriors|soldier|soldiers|child|children|boy|boys|girl|girls|man|men|woman|women|climbing|standing|sitting|walking|running)\b/gi;
const MAP_SCALE_TERMS = /\b(camp|settlement|village|town|city|district|forest|woods|grove|plains?|steppe|mountain|mountains|ridge|range|peak|volcano|waterfall|falls|river|lake|island|canyon|valley|castle|fortress|fort|citadel|temple|palace|ruins|cave|cavern|harbor|harbour|port|bridge|dam|lighthouse|monument|ark)\b/i;
const MICRO_OR_FILLER_LABEL = /\b(door|doorway|window|room|hallway|corridor|stair|stairs|furniture|table|chair|panel|column|post|beam|truss|base|ground|mud|grass|soil|crate|box|pen|fence|branch|bush|rock|boulder|path|trail|edge|border|boundary)\b/i;
const MONUMENTAL_STRUCTURE = /\b(colossal|massive|monumental|towering|city-sized|fortified)\b.*\b(structure|complex|building)\b/i;

/** Reject prompts whose illustrated subject is a person or group of people. */
export function isPeopleFocusedSticker(prompt: string) {
  const withoutNegativeRules = prompt
    .replace(/\b(?:no|without|excluding)\s+(?:any\s+)?(?:people|humans?|figures?|characters?|crowds?|animals?)(?:(?:\s*,\s*|\s+(?:and|or)\s+)(?:people|humans?|figures?|characters?|crowds?|animals?))*/gi, "")
    .replace(/\b(?:uninhabited|empty|abandoned)\b/gi, "");
  return PEOPLE_TERMS.test(withoutNegativeRules);
}

/** Only accept subjects that make sense when zoomed out to a regional map. */
export function isMapScaleLandmark(label: string, prompt: string) {
  if (MICRO_OR_FILLER_LABEL.test(label)) return false;
  const combined = `${label} ${prompt}`;
  return MAP_SCALE_TERMS.test(combined) || MONUMENTAL_STRUCTURE.test(combined);
}

function spreadLandmarks(landmarks: LandmarkPlan[]) {
  const placed: LandmarkPlan[] = [];
  const offsets = [
    [0, 0], [0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16],
    [0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14],
  ];

  for (const landmark of landmarks) {
    const candidates = offsets.map(([dx, dy]) => ({
      ...landmark,
      x: clamp(landmark.x + dx, 0.1, 0.9, landmark.x),
      y: clamp(landmark.y + dy, 0.12, 0.82, landmark.y),
    }));
    const fits = (candidate: LandmarkPlan) => placed.every(other => {
      const minimum = (candidate.size + other.size) / 2 + 0.06;
      return Math.hypot(candidate.x - other.x, candidate.y - other.y) >= minimum;
    });
    placed.push(candidates.find(fits) || candidates[0]);
  }
  return placed;
}

export function prepareLandmarks(
  rawValue: unknown,
  requestedCount: number,
  requiredPlaces: RequiredLandmark[] = [],
): LandmarkPlan[] {
  const incoming = Array.isArray(rawValue) ? rawValue : [];
  const forcedPlaces = requiredPlaces.filter(place => place.requireLandmark);
  const requiredCandidates = forcedPlaces.map((place, index) => {
    const placeKey = canonical(place.name);
    const existing = incoming.find(item => {
      const key = canonical(cleanText(asRecord(item).label, 48));
      return key === placeKey || (key.length > 3 && (key.includes(placeKey) || placeKey.includes(key)));
    });
    if (existing) {
      const existingRecord = asRecord(existing);
      const existingLabel = cleanText(existingRecord.label, 48);
      const existingPrompt = cleanText(existingRecord.prompt, 520);
      if (isMapScaleLandmark(existingLabel, existingPrompt) && !isPeopleFocusedSticker(existingPrompt)) return existing;
    }
    const environmentalContext = place.context.replace(PEOPLE_TERMS_GLOBAL, "").replace(/\s+/g, " ").trim();
    return {
      label: place.name,
      prompt: `One cohesive top-down, map-scale depiction of the named ${place.kind} “${place.name}”. Use only the environmental and architectural details in this chapter context: ${environmentalContext}. No people, characters, animals, text, or close-up objects.`,
      x: forcedPlaces.length <= 1 ? 0.2 : 0.14 + index * (0.72 / (forcedPlaces.length - 1)),
      y: 0.38,
      size: 0.24,
    };
  });
  const rankedIncoming = [...requiredCandidates, ...incoming];
  const seen = new Set<string>();
  const landmarks: LandmarkPlan[] = [];

  for (let index = 0; index < rankedIncoming.length && landmarks.length < requestedCount; index++) {
    const value = asRecord(rankedIncoming[index]);
    const label = cleanText(value.label, 48);
    const prompt = cleanText(value.prompt, 520);
    const key = canonical(label);
    if (!label || !prompt || !key || seen.has(key) || isPeopleFocusedSticker(prompt) || !isMapScaleLandmark(label, prompt)) continue;
    seen.add(key);
    landmarks.push({
      label,
      prompt,
      x: clamp(value.x, 0.1, 0.9, 0.2 + (index % 3) * 0.3),
      y: clamp(value.y, 0.12, 0.82, 0.25 + Math.floor(index / 3) * 0.4),
      size: clamp(value.size, 0.14, 0.28, 0.2),
    });
  }

  return spreadLandmarks(landmarks);
}

function spreadLabels(labels: MapLabelPlan[], landmarks: LandmarkPlan[]) {
  const placed: MapLabelPlan[] = [];
  const offsets = [
    [0, 0], [0, 0.16], [0, -0.16], [0.16, 0], [-0.16, 0],
    [0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14],
  ];

  for (const label of labels) {
    const candidates = offsets.map(([dx, dy]) => ({
      ...label,
      x: clamp(label.x + dx, 0.08, 0.92, label.x),
      y: clamp(label.y + dy, 0.08, 0.92, label.y),
    }));
    const fitsLabels = (candidate: MapLabelPlan) => placed.every(other =>
      Math.abs(candidate.x - other.x) >= 0.14 || Math.abs(candidate.y - other.y) >= 0.08
    );
    const fitsLandmarks = (candidate: MapLabelPlan) => landmarks.every(landmark =>
      Math.abs(candidate.x - landmark.x) >= landmark.size / 2 + 0.04 ||
      Math.abs(candidate.y - landmark.y) >= landmark.size / 2 + 0.04
    );
    const fits = (candidate: MapLabelPlan) => fitsLabels(candidate) && fitsLandmarks(candidate);
    placed.push(candidates.find(fits) || candidates[0]);
  }
  return placed;
}

export function prepareLabels(rawValue: unknown, landmarks: LandmarkPlan[]): MapLabelPlan[] {
  const incoming = Array.isArray(rawValue) ? rawValue : [];
  const candidates: MapLabelPlan[] = incoming.slice(0, 10).map((item: unknown, index: number) => {
    const value = asRecord(item);
    return {
      text: cleanText(value.text, 64),
      x: clamp(value.x, 0.08, 0.92, 0.18 + (index % 4) * 0.2),
      y: clamp(value.y, 0.08, 0.92, 0.18 + Math.floor(index / 4) * 0.22),
      kind: value.kind === "event" ? "event" : "location",
    };
  });

  // Every generated landmark needs a label, but regions and event locations
  // can also receive labels without spending credits on unnecessary stickers.
  for (const landmark of landmarks) {
    if (!candidates.some(label => canonical(label.text) === canonical(landmark.label))) {
      candidates.push({
        text: landmark.label,
        x: landmark.x,
        y: clamp(landmark.y + landmark.size / 2 + 0.05, 0.08, 0.92, landmark.y),
        kind: "location",
      });
    }
  }

  const seen = new Set<string>();
  return spreadLabels(candidates.filter(label => {
    const key = canonical(label.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10), landmarks);
}
