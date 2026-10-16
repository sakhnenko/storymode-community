export type MapPlaceKind = "settlement" | "region" | "forest" | "mountain" | "water" | "structure";

export interface ProminentMapPlace {
  name: string;
  kind: MapPlaceKind;
  context: string;
  mentions: number;
  firstIndex: number;
  requireLandmark: boolean;
  realWorld?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface DiscoveredMapPlace {
  name: string;
  kind: MapPlaceKind;
  description: string;
  realWorld?: boolean;
  latitude?: number;
  longitude?: number;
}

const PLACE_SUFFIX_WORDS = [
  "camp", "settlement", "village", "town", "city", "forest", "woods", "grove",
  "plain", "plains", "steppe", "desert",
  "district", "county", "country", "province", "state", "republic", "kingdom",
  "mountain", "mountains", "ridge", "range", "peak", "waterfall", "falls", "river",
  "lake", "island", "canyon", "valley", "castle", "fortress", "citadel", "temple",
  "palace", "ruins", "cave", "cavern", "harbor", "harbour", "port", "street",
  "road", "avenue", "boulevard", "lane", "house", "manor", "estate", "club",
];
const PLACE_SUFFIX = PLACE_SUFFIX_WORDS.join("|");
const CASED_PLACE_SUFFIX = PLACE_SUFFIX_WORDS
  .map(word => `[${word[0].toLocaleUpperCase()}${word[0]}]${word.slice(1)}`)
  .join("|");
const OF_PREFIX_WORDS = [
  "plains", "forest", "woods", "mountains", "ridge", "range", "falls", "river", "lake", "island", "valley",
];
const CASED_OF_PREFIX = OF_PREFIX_WORDS
  .map(word => `[${word[0].toLocaleUpperCase()}${word[0]}]${word.slice(1)}`)
  .join("|");
const SUFFIX_NAME = new RegExp(`\\b([\\p{Lu}][\\p{L}'’-]*(?:\\s+[\\p{Lu}][\\p{L}'’-]*){0,2}\\s+(?:${CASED_PLACE_SUFFIX}))\\b`, "gu");
const OF_NAME = new RegExp(`\\b((?:${CASED_OF_PREFIX})\\s+[Oo][Ff]\\s+[\\p{Lu}][\\p{L}'’-]*(?:\\s+[\\p{Lu}][\\p{L}'’-]*){0,2})\\b`, "gu");

function canonical(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classify(name: string): MapPlaceKind {
  const lower = name.toLocaleLowerCase();
  if (/\b(camp|settlement|village|town|city|port)$/.test(lower)) return "settlement";
  if (/\b(plain|plains|steppe|desert|region|district|county|country|province|state|republic|kingdom)$/.test(lower) || /\bplains\s+of\b/.test(lower)) return "region";
  if (/\b(forest|woods|grove)$/.test(lower)) return "forest";
  if (/\b(mountain|mountains|ridge|range|peak|canyon|valley)$/.test(lower)) return "mountain";
  if (/\b(waterfall|falls|river|lake|island|harbor|harbour)$/.test(lower)) return "water";
  return "structure";
}

function rootName(name: string) {
  const withoutArticle = name.replace(/^The\s+/i, "");
  const ofMatch = withoutArticle.match(new RegExp(`^(?:${OF_PREFIX_WORDS.join("|")})\\s+of\\s+(.+)$`, "i"));
  if (ofMatch) return ofMatch[1].trim();
  return withoutArticle.replace(new RegExp(`\\s+(?:${PLACE_SUFFIX})$`, "i"), "").trim();
}

function placeIdentity(name: string, kind: MapPlaceKind) {
  return `${canonical(rootName(name))}:${kind}`;
}

function containsCanonicalPhrase(text: string, phrase: string) {
  const normalizedPhrase = canonical(phrase);
  return normalizedPhrase.length > 0 && ` ${canonical(text)} `.includes(` ${normalizedPhrase} `);
}

function bestContext(chapter: string, name: string, root = rootName(name)) {
  const sentences = chapter.split(/(?<=[.!?])\s+/);
  const exact = sentences.filter(sentence => containsCanonicalPhrase(sentence, name));
  const matching = exact.length ? exact : sentences.filter(sentence => containsCanonicalPhrase(sentence, root));
  return matching.sort((a, b) => b.length - a.length)[0]?.replace(/\s+/g, " ").trim().slice(0, 520) || "";
}

function withoutQuotedDialogue(chapter: string) {
  let inCurlyQuote = false;
  let inStraightQuote = false;
  let result = "";
  for (const character of chapter) {
    if (character === "“") {
      inCurlyQuote = true;
      result += " ";
      continue;
    }
    if (character === "”") {
      inCurlyQuote = false;
      result += " ";
      continue;
    }
    if (character === '"') {
      inStraightQuote = !inStraightQuote;
      result += " ";
      continue;
    }
    result += inCurlyQuote || inStraightQuote
      ? (character === "\n" ? "\n" : " ")
      : character;
  }
  return result;
}

function articleNamedStructures(chapter: string) {
  const matches: Array<{ name: string; index: number }> = [];
  const sentences = chapter.split(/(?<=[.!?])\s+/);
  let searchFrom = 0;
  for (const sentence of sentences) {
    const sentenceIndex = chapter.indexOf(sentence, searchFrom);
    searchFrom = Math.max(searchFrom, sentenceIndex + sentence.length);
    if (!/\b(structure|destination|fortress|citadel|castle|palace|temple|monument|center of|centre of)\b/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/\b[Tt]he\s+([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\b/gu)) {
      const name = `The ${match[1]}`;
      if (new RegExp(`\\b${escapeRegExp(match[1])}\\b`, "gu").test(chapter)) {
        matches.push({ name, index: sentenceIndex + (match.index || 0) });
      }
    }
  }
  return matches;
}

function priority(place: ProminentMapPlace) {
  const kindPriority: Record<MapPlaceKind, number> = {
    settlement: 5,
    region: 4,
    structure: 4,
    forest: 3,
    mountain: 2,
    water: 1,
  };
  return place.mentions * 10 + kindPriority[place.kind];
}

function isNamedInChapter(name: string, chapter: string) {
  const withoutArticle = name.replace(/^The\s+/i, "");
  if (containsCanonicalPhrase(chapter, name) || containsCanonicalPhrase(chapter, withoutArticle)) return true;
  const root = rootName(withoutArticle);
  return canonical(root).length >= 3 && containsCanonicalPhrase(chapter, root);
}

/**
 * Find repeatedly referenced, explicitly named map-scale places. This is not a
 * complete geography parser; it supplies a deterministic must-consider list so
 * an LLM cannot silently drop the chapter's principal settlement or region.
 */
export function extractProminentMapPlaces(chapter: string): ProminentMapPlace[] {
  return extractNamedMapPlaces(chapter)
    .filter(place => place.mentions >= 2)
    .slice(0, 8);
}

/** Find every explicitly named map-scale place, including one-off references. */
export function extractNamedMapPlaces(chapter: string): ProminentMapPlace[] {
  const regexMatches = [...chapter.matchAll(SUFFIX_NAME), ...chapter.matchAll(OF_NAME)]
    .map(match => {
      const normalized = match[1].replace(/^The\s+/, "").replace(/\s+/g, " ").trim();
      const normalizedPrefix = normalized.replace(
        /^(plains|forest|woods|mountains|ridge|range|falls|river|lake|island|valley)\b/i,
        prefix => `${prefix[0].toLocaleUpperCase()}${prefix.slice(1).toLocaleLowerCase()}`,
      );
      return {
        name: normalizedPrefix.replace(
          new RegExp(`\\b(${PLACE_SUFFIX})$`, "i"),
          suffix => `${suffix[0].toLocaleUpperCase()}${suffix.slice(1).toLocaleLowerCase()}`,
        ),
        index: match.index || 0,
      };
    });
  const matches = [...regexMatches, ...articleNamedStructures(chapter)]
    .sort((a, b) => a.index - b.index);
  const byRoot = new Map<string, ProminentMapPlace>();

  for (const match of matches) {
    const initialKind = classify(match.name);
    const displayName = initialKind === "structure" ? match.name : match.name.replace(/^The\s+/i, "");
    const root = rootName(displayName);
    const kind = classify(displayName);
    const key = placeIdentity(displayName, kind);
    const rootKey = canonical(root);
    const isGenericSuffix = PLACE_SUFFIX_WORDS.includes(canonical(displayName));
    if (!rootKey || isGenericSuffix || rootKey === "a" || rootKey === "an" || rootKey === "the") continue;
    const mentions = chapter.match(new RegExp(`\\b${escapeRegExp(root)}\\b`, "giu"))?.length || 0;
    const candidate: ProminentMapPlace = {
      name: displayName,
      kind,
      context: bestContext(chapter, displayName, root),
      mentions,
      firstIndex: match.index,
      requireLandmark: kind === "settlement" || kind === "structure",
    };
    const existing = byRoot.get(key);
    if (!existing || priority(candidate) > priority(existing)) byRoot.set(key, candidate);
  }

  return [...byRoot.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .slice(0, 24);
}

export function normalizeDiscoveredPlaces(rawValue: unknown, chapter: string): DiscoveredMapPlace[] {
  const raw = Array.isArray(rawValue) ? rawValue : [];
  const deterministic = extractNamedMapPlaces(chapter).map(place => {
    const semanticMatch = raw.find(item => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return placeIdentity(String(value.name || ""), String(value.kind || "structure") as MapPlaceKind)
        === placeIdentity(place.name, place.kind);
    }) as Record<string, unknown> | undefined;
    return {
      name: place.name,
      kind: place.kind,
      description: String(semanticMatch?.description || place.context),
      realWorld: semanticMatch?.realWorld,
      latitude: semanticMatch?.latitude,
      longitude: semanticMatch?.longitude,
    };
  });
  const allowedKinds = new Set<MapPlaceKind>(["settlement", "region", "forest", "mountain", "water", "structure"]);
  // Deterministic names keep alias precedence while semantic metadata enriches
  // matching places with real-world coordinates.
  const candidates = [...deterministic, ...raw];
  const narrativeChapter = withoutQuotedDialogue(chapter);
  const seen = new Set<string>();
  const result: DiscoveredMapPlace[] = [];

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const name = String(value.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const kindValue = String(value.kind || "structure") as MapPlaceKind;
    const kind = allowedKinds.has(kindValue) ? kindValue : "structure";
    const key = placeIdentity(name, kind);
    const rootKey = canonical(rootName(name));
    if (!name || !rootKey || seen.has(key) || !isNamedInChapter(name, narrativeChapter)) continue;
    const isBareStructureAlias = kind === "structure" && result.some(place =>
      place.kind !== "structure" && canonical(rootName(place.name)) === rootKey
    );
    if (isBareStructureAlias) continue;
    const description = String(value.description || bestContext(chapter, name))
      .replace(/\s+/g, " ").trim().slice(0, 360);
    const realWorld = value.realWorld === true;
    const latitudeValue = typeof value.latitude === "number" ? value.latitude : Number.NaN;
    const longitudeValue = typeof value.longitude === "number" ? value.longitude : Number.NaN;
    const latitude = realWorld && Number.isFinite(latitudeValue) && latitudeValue >= -90 && latitudeValue <= 90
      ? latitudeValue
      : undefined;
    const longitude = realWorld && Number.isFinite(longitudeValue) && longitudeValue >= -180 && longitudeValue <= 180
      ? longitudeValue
      : undefined;
    seen.add(key);
    result.push({ name, kind, description, realWorld, latitude, longitude });
  }

  return result.slice(0, 24);
}
