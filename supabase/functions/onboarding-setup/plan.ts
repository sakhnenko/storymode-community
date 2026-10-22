import { asRecord, cleanText, plainTextFromHtml } from "../_shared/ai-json.ts";
import { WRITING_KINDS } from "../_shared/project-memory.ts";
import type { FolioPlan } from "./templates.ts";

// Pure helpers that turn the model's reply and the pasted chapter into safe
// rows for a new project.

export const MAX_NOTEBOOKS_PER_FOLIO = 8;
const MAX_TITLE_CHARS = 120;

const ALLOWED_CHAPTER_TAGS = new Set([
  "p", "br", "em", "i", "strong", "b", "u", "s", "h1", "h2", "h3", "blockquote", "ul", "ol", "li", "hr",
]);

// One pictograph with optional variation selector or skin tone, joined into
// sequences like 🧙‍♀️ by zero-width joiners.
const LEADING_EMOJI =
  /^\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?)*/u;

/** The emoji `value` starts with, otherwise `fallback`. */
export function emojiOr(value: unknown, fallback: string) {
  return String(value ?? "").trim().match(LEADING_EMOJI)?.[0] ?? fallback;
}

/** Keeps basic text formatting and drops every other tag and all attributes. */
export function sanitizeChapterHtml(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)\b[^>]*>/g, (_match, slash: string, tag: string) => {
      const name = tag.toLowerCase();
      return ALLOWED_CHAPTER_TAGS.has(name) ? `<${slash}${name}>` : "";
    })
    .trim();
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string) {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity])
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)));
}

/** Wraps `inner` in a Markdown marker, keeping surrounding spaces outside it so the marker still applies. */
function mark(marker: string) {
  return (_m: string, _tag: string, before: string, inner: string, after: string) =>
    inner ? `${before}${marker}${inner}${marker}${after}` : before + after;
}

function inlineMarkdown(html: string) {
  return decodeEntities(
    html
      .replace(/<br>/g, "\n")
      .replace(/<(strong|b)>(\s*)([\s\S]*?)(\s*)<\/\1>/g, mark("**"))
      .replace(/<(em|i)>(\s*)([\s\S]*?)(\s*)<\/\1>/g, mark("*"))
      .replace(/<(s)>(\s*)([\s\S]*?)(\s*)<\/\1>/g, mark("~~"))
      .replace(/<[^>]+>/g, ""),
  );
}

/**
 * Stops prose lines from being read as Markdown blocks, e.g. dialogue that
 * starts with "- " turning into a list, or "1." into a numbered list.
 */
function escapeLineStarts(text: string) {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s*)(#{1,6}|[-+*]|>)(?=\s|$)/, "$1\\$2")
        .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, "$1$2\\$3"),
    )
    .join("\n");
}

const singleLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

/**
 * Converts sanitized chapter HTML (see sanitizeChapterHtml) into the Markdown
 * the Story editor stores: blank lines between paragraphs, `#` headings,
 * single line breaks kept as line breaks.
 */
export function htmlToMarkdown(html: string): string {
  const blocks: string[] = [];
  const addText = (fragment: string) => {
    const text = escapeLineStarts(inlineMarkdown(fragment)).trim();
    if (text) blocks.push(text);
  };
  let last = 0;
  for (const match of html.matchAll(/<(h[1-3]|p|blockquote|ul|ol)>([\s\S]*?)<\/\1>|<hr>/g)) {
    const start = match.index ?? 0;
    addText(html.slice(last, start));
    const [whole, tag, inner = ""] = match;
    if (whole === "<hr>") {
      blocks.push("---");
    } else if (tag.startsWith("h")) {
      const heading = singleLine(inlineMarkdown(inner));
      if (heading) blocks.push(`${"#".repeat(Number(tag[1]))} ${heading}`);
    } else if (tag === "p") {
      addText(inner);
    } else if (tag === "blockquote") {
      const quoted = htmlToMarkdown(inner);
      if (quoted) blocks.push(quoted.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n"));
    } else {
      const items = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)]
        .map((item) => singleLine(inlineMarkdown(item[1])))
        .filter(Boolean);
      if (items.length) blocks.push(items.map((item, i) => (tag === "ol" ? `${i + 1}. ${item}` : `- ${item}`)).join("\n"));
    }
    last = start + whole.length;
  }
  addText(html.slice(last));
  return blocks.join("\n\n");
}

/** Text of the first h1–h3 in already-sanitized chapter HTML. */
export function firstHeading(html: string) {
  const match = html.match(/<h[1-3]>([\s\S]*?)<\/h[1-3]>/i);
  return match ? cleanText(plainTextFromHtml(match[1]), MAX_TITLE_CHARS) : "";
}

export type WritingType = (typeof WRITING_KINDS)[number];

export interface ProjectPlan {
  /** Empty when the model didn't pick a usable emoji. */
  projectIcon: string;
  chapterTitle: string;
  /** The kind of writing, for the project's memory; empty when the model gave none it knows. */
  writingType: WritingType | "";
  genre: string;
  folios: FolioPlan[];
}

/** The kind of writing each onboarding project type usually is; undefined for types that vary. */
const WRITING_TYPE_BY_PROJECT: Record<string, WritingType> = {
  novel: "literary",
  short_stories: "literary",
  fanfic: "literary",
  screenplay: "script",
  comic: "script",
  nonfiction: "nonfiction",
  rpg: "worldbuilding",
  game: "worldbuilding",
  worldbuilding: "worldbuilding",
};

/**
 * The project's writing type and genre for its memory: the model's reading
 * of the answers (and chapter) first, else what the chosen project type
 * implies, with the picked genres as the genre where they are genres.
 */
export function writingProfileFor(plan: ProjectPlan | null, projectKey: string | null, projectDetail: string) {
  const key = projectKey ?? "";
  const genreDetail = ["novel", "short_stories", "comic", "nonfiction"].includes(key);
  return {
    register: plan?.writingType || WRITING_TYPE_BY_PROJECT[key] || "auto",
    genre: plan?.genre || (genreDetail ? cleanText(projectDetail, 120) : ""),
  };
}

/** Function-calling schema the model fills in, so the plan comes back as structured arguments. */
export const PLAN_TOOL = {
  type: "function",
  function: {
    name: "create_project_plan",
    description: "Create the folios and notebooks for the author's new project.",
    parameters: {
      type: "object",
      properties: {
        projectIcon: { type: "string", description: "One emoji that fits the project's title and subject." },
        chapterTitle: { type: "string", description: "Title for the pasted chapter, or an empty string when there is none." },
        writingType: {
          type: "string",
          enum: [...WRITING_KINDS],
          description: "The kind of writing: literary (fiction prose), nonfiction, script, worldbuilding, academic or technical.",
        },
        genre: { type: "string", description: "The project's genre in a few words, or an empty string when unclear." },
        folios: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              icon: { type: "string", description: "One emoji." },
              notebooks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    icon: { type: "string", description: "One emoji." },
                    content: { type: "string", description: "Markdown notes." },
                  },
                  required: ["title", "content"],
                },
              },
            },
            required: ["title", "notebooks"],
          },
        },
      },
      required: ["projectIcon", "folios"],
    },
  },
} as const;

/** First non-empty string among a record's keys, so near-miss field names still count. */
function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function list(record: Record<string, unknown>, keys: string[]): unknown[] {
  const value = pick(record, keys);
  return Array.isArray(value) ? value : [];
}

/** Validates and trims the model's project plan; null when it has no usable folios. */
export function normalizePlan(value: unknown, maxFolios: number): ProjectPlan | null {
  const raw = asRecord(value);
  const folios: FolioPlan[] = list(raw, ["folios", "folders", "collections"])
    .map((f) => {
      const folio = asRecord(f);
      const notebooks = list(folio, ["notebooks", "notes", "entries", "items"])
        .map((n) => {
          const notebook = asRecord(n);
          return {
            title: cleanText(pick(notebook, ["title", "name"]), 80),
            icon: emojiOr(notebook.icon ?? notebook.emoji, "📝"),
            content: String(pick(notebook, ["content", "body", "description", "text"]) ?? "").trim().slice(0, 2000),
          };
        })
        .filter((n) => n.title)
        .slice(0, MAX_NOTEBOOKS_PER_FOLIO);
      return { title: cleanText(pick(folio, ["title", "name"]), 60), icon: emojiOr(folio.icon ?? folio.emoji, "📁"), notebooks };
    })
    .filter((f) => f.title && f.notebooks.length > 0)
    .slice(0, maxFolios);
  if (folios.length === 0) return null;
  const writingType = String(raw.writingType ?? "").trim().toLowerCase();
  return {
    projectIcon: emojiOr(raw.projectIcon ?? raw.icon ?? raw.emoji, ""),
    chapterTitle: cleanText(raw.chapterTitle, MAX_TITLE_CHARS),
    writingType: (WRITING_KINDS as readonly string[]).includes(writingType) ? (writingType as WritingType) : "",
    genre: cleanText(raw.genre, 120),
    folios,
  };
}
