import type { User } from "@supabase/supabase-js";
import en from "@/i18n/locales/en.json";
import { PROJECT_KEYS, type ProjectKey } from "@/lib/waitlist-flow";

/** Helpers for the first-run welcome chat (src/components/welcome/WelcomeChat.tsx). */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".docx,.pdf,.txt,.md";
export const MIN_CHAPTER_WORDS = 20;
export const MAX_TITLE_CHARS = 120;

export type DocumentKind = "docx" | "pdf" | "text";

export function documentKind(fileName: string): DocumentKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".txt") || name.endsWith(".md")) return "text";
  return null;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MAX_HEADING_CHARS = 80;

/**
 * Turns pasted or extracted text into chapter paragraphs. With blank lines
 * present they separate paragraphs (and single line breaks are wrapping, as in
 * PDFs); otherwise every line is its own paragraph, as when pasting from Word.
 * A short opening line without closing punctuation, like "Chapter One: The
 * Long Dusk", becomes the chapter's heading.
 */
export function textToChapterHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const paragraphs = (
    /\n[ \t]*\n/.test(normalized)
      ? normalized.split(/\n[ \t]*\n+/).map((p) => p.replace(/\s*\n\s*/g, " "))
      : normalized.split("\n")
  )
    .map((p) => p.trim())
    .filter(Boolean);
  const [first, ...rest] = paragraphs;
  const isHeading = rest.length > 0 && first.length <= MAX_HEADING_CHARS && !/[.!?…"'”’]$/.test(first);
  return (isHeading ? [`<h2>${escapeHtml(first)}</h2>`, ...rest.map(asParagraph)] : paragraphs.map(asParagraph)).join("");
}

const asParagraph = (p: string) => `<p>${escapeHtml(p)}</p>`;

export type PasswordProblem = "minPassword" | "mustContainLetter" | "mustContainNumber" | "mustContainSymbol";

/** The set-password page's rules; returns the `auth.*` message key for the first one broken. */
export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < 6) return "minPassword";
  if (!/[a-zA-Z]/.test(password)) return "mustContainLetter";
  if (!/[0-9]/.test(password)) return "mustContainNumber";
  if (!/[^a-zA-Z0-9]/.test(password)) return "mustContainSymbol";
  return null;
}

/**
 * Invited email accounts start without a password. The welcome chat asks for
 * one and records `password_set` on the account, so leaving before that step
 * still brings the question back next time.
 */
export function needsPasswordSetup(user: Pick<User, "invited_at" | "app_metadata" | "user_metadata">): boolean {
  return (
    Boolean(user.invited_at) &&
    (user.app_metadata?.provider ?? "email") === "email" &&
    user.user_metadata?.password_set !== true
  );
}

/** "A", "A and B", "A, B and C". */
export function joinList(items: readonly string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** The waitlist stores project types as their English option labels; this maps one back to its key. */
export function projectKeyForLabel(label: string | null | undefined): ProjectKey | null {
  if (!label) return null;
  const wanted = label.trim().toLowerCase();
  const labels = en.waitlistChat.options.projects as Record<ProjectKey, string>;
  return PROJECT_KEYS.find((key) => labels[key].toLowerCase() === wanted) ?? null;
}

/** What the welcome chat's progress card shows, built up from setup events. */
export interface SetupState {
  project: string | null;
  planning: { fromChapter: boolean } | null;
  folios: { title: string; icon: string; notebooks: number }[];
  chapter: string | null;
  /** The chapter couldn't be read, so the folios are starter templates. */
  fallback: boolean;
  /** The Codex was turned on and is reading the chapter. */
  codex: boolean;
  finished: boolean;
}

export const EMPTY_SETUP: SetupState = {
  project: null,
  planning: null,
  folios: [],
  chapter: null,
  fallback: false,
  codex: false,
  finished: false,
};

export type SetupEvent =
  | { type: "project"; title: string }
  | { type: "planning"; fromChapter: boolean }
  | { type: "working" }
  | { type: "fallback" }
  | { type: "folio"; title: string; icon: string; notebooks: number }
  | { type: "chapter"; title: string }
  | { type: "codex" }
  | { type: "done"; projectId: string; folios?: string[] }
  | { type: "error" };

/** Splits a buffer of newline-delimited JSON into complete events and the unfinished remainder. */
export function parseSetupEvents(buffer: string): { events: SetupEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: SetupEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && typeof event.type === "string") events.push(event as SetupEvent);
    } catch {
      // ignore a malformed line rather than abort the whole setup view
    }
  }
  return { events, rest };
}
