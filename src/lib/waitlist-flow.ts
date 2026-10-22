import type { LanguageCode } from "@/i18n";

/**
 * The conversational waitlist: one question at a time, in a fixed order.
 * Option labels live in the locale files under `waitlistChat.options.*`; the
 * value stored for an option is its English label so the admin panel reads
 * the same regardless of the visitor's language.
 */

export const STEP_ORDER = [
  "language",
  "name",
  "project",
  "project_detail",
  "premise",
  "own_key",
  "email",
] as const;
export type StepId = (typeof STEP_ORDER)[number];

export const TOTAL_STEPS = STEP_ORDER.length;

export function stepNumber(step: StepId): number {
  return STEP_ORDER.indexOf(step) + 1;
}

export function nextStep(step: StepId): StepId | null {
  return STEP_ORDER[STEP_ORDER.indexOf(step) + 1] ?? null;
}

/** Steps whose reply may be written by AI; every other reply is pre-written. */
export const AI_REPLY_STEPS: ReadonlySet<StepId> = new Set(["project", "project_detail", "premise"]);

/**
 * AI replies are reserved for answers in the visitor's own words, where a
 * specific reaction lands best; picking a preset option gets a pre-written reply.
 */
export function wantsAiReply(step: StepId, typed: string): boolean {
  return AI_REPLY_STEPS.has(step) && typed.trim().length > 0;
}

export const LIMITS = {
  name: 80,
  language: 60,
  project: 100,
  detail: 200,
  premise: 600,
  email: 320,
} as const;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WritingLanguageOption {
  id: string;
  /** Stored value (English name). */
  value: string;
  /** Shown as-is in every interface language. */
  nativeLabel: string;
  /** Interface language this maps to, or null when StoryMode doesn't support it yet. */
  ui: LanguageCode | null;
}

export const WRITING_LANGUAGES: readonly WritingLanguageOption[] = [
  { id: "en", value: "English", nativeLabel: "English", ui: "en" },
  { id: "pt", value: "Portuguese", nativeLabel: "Português", ui: "pt-BR" },
  { id: "es", value: "Spanish", nativeLabel: "Español", ui: null },
  { id: "fr", value: "French", nativeLabel: "Français", ui: null },
  { id: "de", value: "German", nativeLabel: "Deutsch", ui: null },
  { id: "it", value: "Italian", nativeLabel: "Italiano", ui: null },
];

/** Maps a typed-in language name onto a supported interface language, if any. */
export function uiLanguageForTyped(text: string): LanguageCode | null {
  const t = text.trim().toLowerCase();
  if (/^(en|eng|english|ingl[eê]s)\b/.test(t)) return "en";
  if (/^(pt|pt-br|portugu)/.test(t)) return "pt-BR";
  return null;
}

export const PROJECT_KEYS = [
  "novel",
  "short_stories",
  "rpg",
  "screenplay",
  "comic",
  "game",
  "worldbuilding",
  "fanfic",
  "nonfiction",
] as const;
export type ProjectKey = (typeof PROJECT_KEYS)[number];

export interface ChipGroup {
  /** Key under `waitlistChat.options`. */
  group: string;
  ids: readonly string[];
}

const GENRES = ["fantasy", "scifi", "mystery", "romance", "horror", "literary", "historical", "ya", "children"];
const COMIC_GENRES = ["fantasy", "scifi", "superhero", "horror", "sliceOfLife", "humor", "manga"];

/** Follow-up asked after each project type. Typed-in projects get free text only. */
export const DETAIL_CHIPS: Record<ProjectKey, ChipGroup> = {
  novel: { group: "genres", ids: GENRES },
  short_stories: { group: "genres", ids: GENRES },
  comic: { group: "comicGenres", ids: COMIC_GENRES },
  rpg: {
    group: "rpgSystems",
    ids: ["dnd5e", "pathfinder", "tormenta20", "coc", "vtm", "blades", "homebrew"],
  },
  screenplay: { group: "screenFormats", ids: ["feature", "tv", "short", "play", "web"] },
  game: {
    group: "gameKinds",
    ids: ["visualNovel", "textAdventure", "videoRpg", "boardGame", "gamebook"],
  },
  worldbuilding: { group: "worldPurposes", ids: ["book", "tabletop", "videogame", "fun"] },
  fanfic: { group: "fandoms", ids: ["harryPotter", "marvel", "starWars", "lotr", "anime"] },
  nonfiction: {
    group: "nonfiction",
    ids: ["memoir", "biography", "history", "selfHelp", "essays", "travel"],
  },
};

export type OwnKeyAnswer = "yes" | "no" | "unsure";
export const OWN_KEY_ANSWERS: readonly OwnKeyAnswer[] = ["yes", "no", "unsure"];

export interface WaitlistAnswers {
  uiLanguage: LanguageCode;
  writingLanguage: string;
  name: string;
  /** null when the visitor typed their own project type. */
  projectKey: ProjectKey | null;
  projectType: string;
  projectDetail: string;
  premise: string;
  ownKey: OwnKeyAnswer | null;
  email: string;
}

export function emptyAnswers(uiLanguage: LanguageCode): WaitlistAnswers {
  return {
    uiLanguage,
    writingLanguage: "",
    name: "",
    projectKey: null,
    projectType: "",
    projectDetail: "",
    premise: "",
    ownKey: null,
    email: "",
  };
}

/** Joins chip picks and any typed text into one answer, dropping blanks. */
export function joinParts(parts: readonly string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(", ");
}

/** Which inputs a step offers. */
export function stepInputs(step: StepId, projectKey: ProjectKey | null) {
  switch (step) {
    case "language":
    case "project":
      return { chips: true, text: true, skippable: false };
    case "project_detail":
      return { chips: projectKey !== null, text: true, skippable: projectKey === null };
    case "premise":
      return { chips: false, text: true, skippable: true };
    case "own_key":
      return { chips: true, text: false, skippable: false };
    case "name":
    case "email":
      return { chips: false, text: true, skippable: false };
  }
}

/** Body for the `notify-waitlist` function. */
export function submissionPayload(a: WaitlistAnswers) {
  return {
    email: a.email.trim().toLowerCase(),
    source: "waitlist-chat",
    name: a.name.trim(),
    writing_about: a.premise.trim(),
    writing_language: a.writingLanguage.trim(),
    has_own_openai_key: a.ownKey === "yes",
    ui_language: a.uiLanguage,
    project_type: a.projectType.trim(),
    project_detail: a.projectDetail.trim(),
  };
}

/** Body for the `waitlist-chat` function. Deliberately excludes name and email. */
export function aiReplyPayload(step: StepId, a: WaitlistAnswers) {
  return {
    step,
    language: a.uiLanguage,
    project: a.projectType,
    detail: a.projectDetail,
    premise: a.premise,
  };
}
