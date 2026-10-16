// Post-build: writes dist/guide/index.html with the guide's text content already
// present in the HTML, so crawlers and AI readers that don't execute JS can read it.
// The SPA still boots on this page and replaces the markup with the interactive guide.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://storymode.waldenpond.net";
const TITLE = "StoryMode Guide — Write Stories. Create Worlds.";
const DESCRIPTION =
  "Learn how to use StoryMode: projects and folios, the distraction-free story editor, AI editor and chat, interactive timelines, hand-drawn maps, sharing and plans.";

const TOPIC_ORDER = [
  "getting-started",
  "themes",
  "story-editor",
  "ai-editor",
  "chat",
  "timeline",
  "map",
  "ai-draw",
  "scan",
  "sharing",
  "plans-credits",
];

type Sub = { title?: string; body?: string };
type Topic = { title?: string; intro?: string; s?: Record<string, Sub> };

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Content strings may contain simple inline markup (<b>, <i>); keep those, escape the rest.
function inline(value: string) {
  return escapeText(value)
    .replace(/&lt;(\/?)(b|i|em|strong)&gt;/g, "<$1$2>");
}

const locale = JSON.parse(readFileSync(resolve("src/i18n/locales/en.json"), "utf8"));
const guide = locale.guide as {
  title: string;
  subtitle: string;
  topics: Record<string, Topic>;
  useCases?: Record<string, string>;
};

const sections: string[] = [];
for (const id of TOPIC_ORDER) {
  const topic = guide.topics?.[id];
  if (!topic) continue;
  const parts: string[] = [`  <section id="${id}">`, `    <h2>${inline(topic.title ?? id)}</h2>`];
  if (topic.intro) parts.push(`    <p>${inline(topic.intro)}</p>`);
  for (const [subId, sub] of Object.entries(topic.s ?? {})) {
    parts.push(`    <section id="${id}-${subId}">`);
    if (sub.title) parts.push(`      <h3>${inline(sub.title)}</h3>`);
    if (sub.body) parts.push(`      <p>${inline(sub.body)}</p>`);
    if (id === "chat" && subId === "use-cases" && guide.useCases) {
      for (const paragraph of Object.values(guide.useCases)) {
        parts.push(`      <p>${inline(paragraph)}</p>`);
      }
    }
    parts.push(`    </section>`);
  }
  parts.push(`  </section>`);
  sections.push(parts.join("\n"));
}

const content = [
  `<main>`,
  `  <h1>${inline(guide.title)} — StoryMode</h1>`,
  `  <p>${inline(guide.subtitle)}</p>`,
  `  <nav aria-label="Guide topics"><ul>`,
  ...TOPIC_ORDER.filter((id) => guide.topics?.[id]).map(
    (id) => `    <li><a href="#${id}">${inline(guide.topics[id].title ?? id)}</a></li>`,
  ),
  `  </ul></nav>`,
  ...sections,
  `</main>`,
].join("\n");

const distIndex = resolve("dist/index.html");
if (!existsSync(distIndex)) {
  console.warn("prerender-guide: dist/index.html not found, skipping");
  process.exit(0);
}

let html = readFileSync(distIndex, "utf8");

html = html
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeText(TITLE)}</title>`)
  .replace(
    /<meta name="description" content="[\s\S]*?"\s*\/?>/,
    `<meta name="description" content="${escapeText(DESCRIPTION)}" />`,
  )
  .replace(
    /<meta property="og:title" content="[\s\S]*?"\s*\/?>/,
    `<meta property="og:title" content="${escapeText(TITLE)}" />`,
  )
  .replace(
    /<meta name="twitter:title" content="[\s\S]*?"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeText(TITLE)}" />`,
  )
  .replace(
    /<meta property="og:description" content="[\s\S]*?"\s*\/?>/,
    `<meta property="og:description" content="${escapeText(DESCRIPTION)}" />`,
  )
  .replace(
    /<meta name="twitter:description" content="[\s\S]*?"\s*\/?>/,
    `<meta name="twitter:description" content="${escapeText(DESCRIPTION)}" />`,
  )
  .replace(
    /<\/head>/,
    `  <link rel="canonical" href="${BASE_URL}/guide" />\n  <meta property="og:url" content="${BASE_URL}/guide" />\n</head>`,
  )
  .replace('<div id="root"></div>', `<div id="root">${content}</div>`);

mkdirSync(resolve("dist/guide"), { recursive: true });
writeFileSync(resolve("dist/guide/index.html"), html);
console.log("dist/guide/index.html written (prerendered guide content)");
