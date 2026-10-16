import { EDITORIAL_REGISTER_GUIDANCE, EDITORIAL_KIND_GUIDANCE, editorialReviewGuidance, formatReviewContext } from "./editorial-guidance.ts";
import { languageDirective } from "../_shared/ai-language.ts";
import { type ProjectMemory } from "../_shared/project-memory.ts";
import { buildProjectMemoryContext } from "../_shared/memory-graph.ts";
import { focusedBookContext } from "../_shared/book-context.ts";

// How the AI editor turns a request into a model call: the scope and model it
// needs, and the exact system prompt. Pure, so tests and benchmarks measure
// what production sends; index.ts loads the data and streams the answer.

export const MAX_BOOK_CHARS = 120000;
export const MAX_FOLIO_CHARS = 30000;
/** Memory for a passage or chapter question, which needs a few facts rather than the book's. */
const LOCAL_MEMORY_CHARS = 6000;

export function extractLatestUserContext(messages: Array<{ role?: string; content?: string }>) {
  const latestUser = [...messages].reverse().find((message) => message?.role === "user" && typeof message?.content === "string");
  const content = latestUser?.content?.trim() || "";

  if (!content) {
    return { latestQuestion: "", selectedPassage: "" };
  }

  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "> Selected text from chapter:") {
    return { latestQuestion: content, selectedPassage: "" };
  }

  const selectedLines: string[] = [];
  let index = 1;

  while (index < lines.length && lines[index].startsWith(">")) {
    selectedLines.push(lines[index].replace(/^>\s?/, ""));
    index += 1;
  }

  return {
    latestQuestion: lines.slice(index).join("\n").trim() || content,
    selectedPassage: selectedLines.join("\n").trim(),
  };
}

// Detects whether the question genuinely needs the rest of the book.
// Earlier turns can carry their own "> Selected text from chapter:" blocks.
// Left intact, the model often keeps reviewing the FIRST passage instead of
// the one just submitted, so collapse every older selection to a stub.
export function stripStaleSelections<T extends { role?: string; content?: string }>(msgs: T[]): T[] {
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") { lastUserIdx = i; break; }
  }
  return msgs.map((m, i) => {
    if (i === lastUserIdx || m?.role !== "user" || typeof m?.content !== "string") return m;
    const lines = m.content.split(/\r?\n/);
    if (lines[0]?.trim() !== "> Selected text from chapter:") return m;
    let idx = 1;
    while (idx < lines.length && lines[idx].startsWith(">")) idx += 1;
    const rest = lines.slice(idx).join("\n").trim();
    return { ...m, content: `> (an earlier passage, already reviewed — not the one under review now)\n\n${rest}` };
  });
}

// Line-level asks (grammar, flow, wording, "feedback about this") don't.
export function needsBookContext(question: string): boolean {
  const q = question.toLowerCase();
  // Any reference to a specific/other chapter ("in the first chapter",
  // "chapter 1", "chapter two", "ch. 3", "earlier/later/next chapter").
  const referencesAnotherChapter =
    /\b(chapter|chap\.?|ch\.)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|i{1,3}v?|iv|v|vi{1,3}|ix|x)\b/.test(q)
    || /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|opening|earlier|previous|prior|next|later|another|other|preceding|following|remaining|rest of the)\s+(chapters?|scenes?|sections?|parts?)\b/.test(q)
    || /\bcap[íi]tulo(s)?\s*(\d+|um|dois|tr[êe]s|anterior(es)?|primeiro|segundo|terceiro|[úu]ltimo)\b/.test(q)
    || /\b(outros? cap[íi]tulos|antes|mais cedo|mais tarde|depois no livro)\b/.test(q);
  // Recall questions about something written elsewhere in the manuscript.
  const asksRecall =
    /\b(where|when|did i|have i|do i)\b[^?]*\b(mention|describe|reference|establish|introduce|say|said|wrote|write|set ?up|explain|show)\b/.test(q)
    || /\b(already|elsewhere|previously|earlier on|earlier|later on|later|before|beforehand|afterwards?|further (back|on)|up to (this|that) point)\b/.test(q);

  return referencesAnotherChapter || asksRecall
    || /\b(plot ?hole|continuit|consisten|contradic|foreshadow|arc|earlier chapter|previous chapter|other chapter|all chapters|first \w+ chapters|whole book|entire book|the book|so far|throughout|timeline|subplot|world ?build|character development|pacing of the (book|story)|across the (book|story)|rest of the (book|story)|elsewhere|canon|lore)\b/.test(q)
    || /\b(buraco de enredo|continuidade|coerência|capítulos anteriores|outros capítulos|livro inteiro|todo o livro|até agora|linha do tempo)\b/.test(q);
}

// Generative / brainstorming asks ("suggest an opening paragraph", "outline
// the mystery", "give me ideas"). These are creation questions, not forensic
// continuity audits, so they do not need the deepest reasoning tier — deep
// effort there just adds 40+ seconds of silence before the first word.
export function isBrainstormAsk(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(suggest|brainstorm|ideas?|come up with|draft|write me|write a|generate|outline|propose|help me start|starting a|opening (line|paragraph|scene|chapter)|plot twist|title ideas?|name ideas?|synopsis|pitch|premise|what if)\b/.test(q)
    || /\b(sugira|sugest|ideias?|rascunho|escreva|gere|esboç|proponha|come[çc]ando|par[áa]grafo de abertura|reviravolta|sinopse|premissa)\b/.test(q);
}

// Review vocabulary ("spelling", "grammar", "continuity", "review") overrides
// brainstorm verbs: "outline the grammar problems" and "suggest spelling
// fixes" are proofreading asks, not requests to invent new prose.
export function isProofreadingAsk(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(spelling|spellings|misspell(?:ed|ing|ings|s)?|typos?|spell[- ]?check(?:ing|er)?|grammar|grammatical|punctuation|comma|period|apostrophe|wording|clarity|rephrase|rewrite|proofread|proofreading|copy ?edit|line ?edit|continuity|consisten|inconsisten|contradic|plot ?hole|review|critique|feedback on|fix(es)?\b|errors?|mistakes?|issues?|problems?)\b/.test(q)
    || /\b(ortografia|gram[áa]tica|pontua[çc][ãa]o|revis[ãa]o|revisar|corrija|corre[çc][ãa]o|erros?|continuidade|coer[êe]ncia|contradi[çc][ãa]o)\b/.test(q);
}

export function getRequestModeNote(question: string) {
  return getRequestModeNoteInner(question);
}

// Lore/canon questions need the project folios even when the user has a
// passage selected or is only asking about the current chapter. These are
// questions like "is this age right?", "what does the folio say about X?",
// "does this contradict my worldbuilding?".
export function needsFolioContext(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(folio|folios|notebook|notebooks|note ?card|lore|canon|worldbuild|world ?building|backstory|character sheet|profile|established|contradic|consisten|inconsisten|match(es|ing)? (the|my)|according to|age|ages|how old|birth|born|timeline|map|location|place name|spelling of (the )?name|character name)\b/.test(q)
    || /\b(fólio|fólios|caderno|cadernos|cânone|lore|idade|idades|quantos anos|contradiz|coerente|consistente|linha do tempo)\b/.test(q);
}

function getRequestModeNoteInner(question: string) {
  const normalized = question.toLowerCase();
  // "spell" alone is a fantasy noun ("the spell fizzled"), not a proofreading
  // ask. Only real spell-check vocabulary may lock the answer into typo mode.
  const asksSpelling = /\b(?:spelling|spellings|misspell(?:ed|ing|ings|s)?|typos?)\b/.test(normalized)
    || /\bspell[- ]?check(?:ing|er)?\b/.test(normalized)
    || /\bcheck(?:ing)?\s+(?:the\s+)?spelling\b/.test(normalized);
  const asksGrammar = /\bgrammar\b|\bgrammatical\b/.test(normalized);
  const asksPunctuation = /\bpunctuation\b|\bcomma\b|\bperiod\b|\bapostrophe\b/.test(normalized);
  const asksWording = /\bwording\b|\bclarity\b|\bstyle\b|\brephrase\b|\brewrite\b|\bflow\b/.test(normalized);
  // Generative asks ("write an opening paragraph", "outline the story") are
  // creation work: never route them into proofreading-only mode.
  const isGenerative = isBrainstormAsk(question) && !isProofreadingAsk(question);

  if (!isGenerative && asksSpelling && !asksGrammar && !asksPunctuation && !asksWording) {
    return `The user is asking ONLY about spelling. Report ONLY actual misspellings or obvious typos in the target text. Do not comment on grammar, punctuation, wording, clarity, style, or story craft. If there are no spelling issues, reply exactly: "No spelling issues found."`;
  }

  if (!isGenerative && asksSpelling && asksGrammar && !asksPunctuation && !asksWording) {
    return `The user is asking about spelling and grammar only. Do not add wording, clarity, style, pacing, or story feedback.`;
  }

  if (isGenerative) {
    return `The user is asking you to CREATE new material (a paragraph, an outline, ideas, a twist). Write the requested material in full. Never answer with a proofreading verdict, and never reply that no spelling or grammar issues were found.`;
  }

  return `Stay strictly within the aspects the user asked about. Do not expand into extra categories unless they explicitly request them.`;
}


export function getPrefabNote(prefab: string | undefined, aiLanguage?: string): string {
  const note = getPrefabBody(prefab, aiLanguage);
  if (!note) return "";
  // Prefab answers must keep the structured layout (section headings +
  // blockquoted snippets + "> Try:" rewrites). Without restating it here the
  // model drifts into a wall of plain paragraphs.
  const format = aiLanguage === "pt-BR"
    ? `\nFORMATO OBRIGATÓRIO: mantenha as linhas [status] e o divisor ---. Depois agrupe a resposta em seções com título em negrito na própria linha (ex.: **Correções**, **Vale considerar**). Cada observação é um bloco: o trecho citado como blockquote ("> ") em sua própria linha, linha em branco, o comentário em parágrafo normal e logo abaixo pelo menos uma linha "> Tente: ...". Nunca responda em parágrafos corridos sem blockquotes.`
    : `\nREQUIRED FORMAT: keep the [status] lines and the --- divider. Then group the answer into sections with a bold-only heading on its own line (e.g. **Corrections**, **Worth considering**). Each observation is its own block: the quoted snippet as a markdown blockquote ("> ") on its own line, a blank line, your commentary as a normal paragraph, then at least one "> Try: ..." line directly beneath it. Never answer as a run of plain paragraphs without blockquotes.`;
  return `${note}${format}`;
}

function getPrefabBody(prefab: string | undefined, aiLanguage?: string): string {
  if (!prefab) return "";
  const isPtBR = aiLanguage === "pt-BR";

  if (prefab === "spelling-grammar") {
    if (isPtBR) {
      return `\n\n## MODO PREFAB: Ortografia & Gramática\nO usuário clicou no prefab "Ortografia & Gramática". Sua tarefa é verificar a passagem selecionada em busca de erros de ortografia, gramática e pontuação. Liste cada problema encontrado com um trecho citado (em blockquote) e uma breve explicação. Para cada erro real, inclua uma opção corrigida em um blockquote markdown prefixado com "Tente:" ou "Poderia ser:". NÃO adicione comentários sobre estilo, voz, ritmo ou técnica narrativa. Se não houver problemas, responda exatamente: "Nenhum erro ortográfico ou gramatical encontrado."`;
    }
    return `\n\n## PREFAB MODE: Spelling & Grammar\nThe user clicked the "Spelling & Grammar" prefab. Your job is to check the selected passage for spelling, grammar, and punctuation errors only. List each issue you find with a short quoted snippet and a brief explanation. For every actual error, include a corrected option in a markdown blockquote prefixed with "Try:" or "Could be:". Do NOT add commentary on style, voice, pacing, or story craft. If there are no issues, reply exactly: "No spelling or grammar issues found."`;
  }

  if (prefab === "editorial-review") {
    if (isPtBR) {
      return `\n\n## MODO PREFAB: Revisão Editorial\n${editorialReviewGuidance(aiLanguage)}`;
    }
    return `\n\n## PREFAB MODE: Editorial Review\n${editorialReviewGuidance(aiLanguage)}`;
  }

  if (prefab === "reading-flow") {
    if (isPtBR) {
      return `\n\n## MODO PREFAB: Fluidez de Leitura\nO usuário clicou no prefab "Fluidez de Leitura". Sua tarefa é analisar como as frases da passagem selecionada fluem quando lidas. Comente sobre ritmo, cadência, variedade de extensão das frases, transições e qualquer momento que pareça abrupto ou que dificulte a leitura. Quando sinalizar um momento assim, ofereça um exemplo concreto de reescrita que mostre como o fluxo poderia funcionar melhor — apresente como opção, não correção, preservando a voz do autor. Use "Tente:" ou "Poderia ser:" como prefixo de cada alternativa.`;
    }
    return `\n\n## PREFAB MODE: Reading Flow\nThe user clicked the "Reading Flow" prefab. Your job is to analyze how the sentences in the selected passage flow when read. Comment on rhythm, cadence, sentence length variety, transitions between sentences, and any moments that feel abrupt or trip up the reader. When you flag a moment that trips the reader, offer a short example rewrite that shows how the flow could land better — present it as an option, not a correction, and match the author's voice.`;
  }

  return "";
}

export type EditorSpeed = "fast" | "thoughtful" | "creative";
export type EditorScope = "selection" | "chapter" | "book";
/** "text" is the editor without project memory; "memory" uses it wherever it applies. */
export type ContextMode = "text" | "memory";

/** What a request asks for and how much context it needs, from the conversation alone. */
export function planEditorRequest({ messages, hasSelection, prefab, reviewMetadata, speed: speedRaw }: {
  messages: Array<{ role?: string; content?: string }>;
  hasSelection?: unknown;
  prefab?: string;
  reviewMetadata?: unknown;
  speed?: unknown;
}) {
  // Speed mode: the user can trade depth for latency from the composer.
  // "fast" always uses a cheap, non-reasoning model. "creative" runs the
  // newest flagship model for the most nuanced editorial work.
  const speed: "fast" | "thoughtful" | "creative" =
    speedRaw === "fast" ? "fast" : speedRaw === "creative" ? "creative" : "thoughtful";

  const { latestQuestion, selectedPassage } = extractLatestUserContext(messages);
  const narrowToSelection = Boolean(hasSelection || selectedPassage);
  // Older clients do not parse editor metadata, so only emit it on request.
  const identifyReviewKind = prefab === "editorial-review" && reviewMetadata === true;

  const wantsBook = needsBookContext(latestQuestion);
  // Scope decides how much we even fetch and send:
  //  - "selection": quoted passage only (no chapters, no folios)
  //  - "chapter":   active chapter + chapter titles outline
  //  - "book":      full book text + folios
  const scope: "selection" | "chapter" | "book" =
    narrowToSelection && !wantsBook ? "selection" : wantsBook ? "book" : "chapter";

  // Brainstorming / drafting asks are creation work, not forensic audits.
  const brainstorming = !narrowToSelection && isBrainstormAsk(latestQuestion) && !isProofreadingAsk(latestQuestion);


  // The balance needed to start: book-wide and passage reviews can run long,
  // so they need 3 credits; plain chapter questions 1. The charge itself
  // follows actual usage.
  const feature: "chat_flash" | "chat_gpt5" = scope === "chapter" ? "chat_flash" : "chat_gpt5";
  const wantsFolios = scope === "book" || needsFolioContext(latestQuestion);
  return { speed, latestQuestion, selectedPassage, narrowToSelection, identifyReviewKind, scope, brainstorming, feature, wantsFolios };
}

export type EditorPlan = ReturnType<typeof planEditorRequest>;

/**
 * The model for a speed. With the current tiers it is the same for every
 * kind of question: Fast starts answering within seconds and keeps it short;
 * Thoughtful thinks before it answers, for a fraction of Creative's cost;
 * Creative is the flagship. The earlier tiers (Fast on Gemini 3.6 Flash,
 * Thoughtful on GPT-5.5 for passages) stay for everyone the
 * editor_speed_tiers flag doesn't include yet.
 */
export function editorModel(speed: EditorSpeed, byok: boolean, { tiers = "current", narrowToSelection = false }:
  { tiers?: "current" | "earlier"; narrowToSelection?: boolean } = {}) {
  // BYOK keys can only address real OpenAI model ids, so both deep tiers
  // land on the user's top model.
  if (byok) return speed === "fast" ? "openai/gpt-5-mini" : "openai/gpt-5";
  if (speed === "creative") return "openai/gpt-6-astra";
  if (tiers === "earlier") return speed === "fast" ? "google/gemini-3.6-flash" : narrowToSelection ? "openai/gpt-5.5" : "google/gemini-2.5-flash";
  return speed === "fast" ? "google/gemini-2.5-flash" : "google/gemini-3.6-flash";
}

export interface EditorChapter { id: string; title: string; content: string }

/**
 * Chapters' full text in book order. A book too long to send whole keeps its
 * first and last of them (the opening and the ending, which questions about
 * the plot hinge on), then as many in between as fit, and names the chapters
 * left out so the editor can say what it didn't read rather than guess.
 */
export function wholeBookText(chapters: EditorChapter[], limit = MAX_BOOK_CHARS) {
  const block = (ch: EditorChapter, room = Infinity) =>
    `\n\n## ${ch.title}\n${ch.content.length > room ? `${ch.content.slice(0, Math.max(0, room))}…` : ch.content}`;
  const blocks = chapters.map(ch => block(ch));
  if (blocks.reduce((n, b) => n + b.length, 0) <= limit) return blocks.join("");
  const kept = new Map<number, string>();
  for (const i of new Set([0, chapters.length - 1])) kept.set(i, block(chapters[i], Math.floor(limit / 3)));
  let used = [...kept.values()].reduce((n, b) => n + b.length, 0);
  for (let i = 1; i < chapters.length - 1; i++) {
    // Room is kept for the note naming what was left out.
    if (used + blocks[i].length > limit - 600) continue;
    kept.set(i, blocks[i]);
    used += blocks[i].length;
  }
  const left = chapters.filter((_, i) => !kept.has(i)).map(ch => `"${ch.title}"`);
  return chapters.map((_, i) => kept.get(i) ?? "").join("")
    + `\n\n[Not loaded, because the book is too long to send whole: ${left.join(", ")}. Chapters ending in "…" are cut short. If the answer depends on what isn't here, say which chapters you didn't read.]`;
}
export interface EditorFolio { title: string; notes: { title: string; content: string }[] }

/** The system prompt for a planned request, with a record of how its context was built. */
export function buildEditorPrompt({ plan, aiLanguage, prefab, chapters, activeChapterId, activeChapterTitle, reviewContext,
  folios, memory: memoryData, focusAllowed, contextMode, briefFast = true, today }: {
  plan: EditorPlan;
  aiLanguage: "en" | "pt-BR";
  prefab?: string;
  /** The chapters loaded for the scope, in book order, with the text the author sees. */
  chapters: EditorChapter[];
  activeChapterId?: string;
  activeChapterTitle?: string;
  reviewContext?: unknown;
  folios: EditorFolio[];
  memory: ProjectMemory | null;
  /** Memory-first book answers are switched on for this user. */
  focusAllowed: boolean;
  contextMode?: ContextMode;
  /** Ask Fast answers to stay short (part of the current speed tiers). */
  briefFast?: boolean;
  /** YYYY-MM-DD */
  today: string;
}) {
  const { speed, latestQuestion, selectedPassage, narrowToSelection, identifyReviewKind, scope, wantsFolios } = plan;
  const chapterList = chapters;
  const activeChapter = chapterList.find((c) => c.id === activeChapterId) || null;
  const otherChapters = chapterList.filter((c) => c.id !== activeChapter?.id);
  const requestModeNote = getRequestModeNote(latestQuestion);
  const prefabNote = getPrefabNote(prefab, aiLanguage);

  const activeChapterText = activeChapter
    ? `\n\n## ${activeChapter.title}\n${activeChapter.content || ""}`
    : "";
  const nearbyReviewText = prefab === "editorial-review" && selectedPassage
    ? formatReviewContext(reviewContext, scope === "selection" && speed !== "creative" ? activeChapter?.content : undefined)
    : "";

  // Book-wide fact questions can go to memory and the passages that matter
  // instead of every chapter's full text (see book-context.ts). The "text"
  // mode leaves memory out entirely, as the editor was before it; "memory"
  // uses it wherever it applies, whatever the rollout flag says.
  const memory = contextMode === "text" ? null : memoryData;
  const bookContext = scope === "book" && memory?.profile?.enabled && (focusAllowed || contextMode === "memory")
    ? focusedBookContext({
        chapters: chapterList,
        activeChapterId: activeChapter?.id,
        question: latestQuestion,
        passage: selectedPassage,
        memory,
      })
    : null;
  const focused = bookContext?.mode === "focused" ? bookContext : null;

  let otherChaptersText = "";
  if (focused) {
    otherChaptersText = focused.chapters;
  } else if (scope === "book") {
    // The full text, so book-wide questions (plot holes, continuity, arcs,
    // the ending) can actually be answered.
    otherChaptersText = wholeBookText(otherChapters);
  } else if (scope === "chapter") {
    // Titles only: enough for the model to know the book's shape without
    // paying for every word of it.
    otherChaptersText = otherChapters.map((ch) => `- ${ch.title}`).join("\n");
  }

  // Folios: an index of notebook titles, or their text when the question touches lore or canon.
  let folioText = "";
  let folioIndex = "";
  if (!wantsFolios) {
    // Cheap always-on index: folio + notebook titles only (no bodies). Titles
    // in this project often carry canon facts like "Sky - 23", so this alone
    // lets the model catch contradictions without shipping every folio.
    folioIndex = folios
      .map((g) => `- ${g.title}: ${g.notes.map((n) => n.title).join(", ")}`)
      .join("\n")
      .slice(0, 6000);
  } else {
    for (const g of folios) {
      const block = `\n\n### Folio: ${g.title}\n` +
        g.notes.map(n => `- **${n.title}**: ${(n.content || "").slice(0, 800)}`).join("\n");
      if (folioText.length + block.length > MAX_FOLIO_CHARS) {
        folioText += `\n\n[…remaining folios truncated for length…]`;
        break;
      }
      folioText += block;
    }
  }

  const focusNote = narrowToSelection
    ? `The user has quoted a specific passage at the top of their message (lines starting with "> "). That quoted passage IS the text they are working on right now. Never ask them to paste it again. Do not comment on sentences outside that selected passage.`
      + (focused
        ? ` They ARE asking about the wider manuscript, so what bears on it is loaded below: project memory records with their quotes, the chapters it needs in full, and every paragraph of the other chapters that mentions what they asked about. Answer with concrete quotes and chapter names. NEVER say you lack access to other chapters.`
        : scope === "book"
        ? ` They ARE asking about the wider manuscript, so the full text of every other chapter is loaded below. Search it and answer with concrete quotes and chapter names. NEVER say you lack access to other chapters.`
        : speed === "creative"
          ? ` The full current chapter is loaded below as context: use it to check consistency of facts and terminology; for narrative passages also check scene continuity. Still only critique and rewrite lines inside the selected passage.`
          : ` Do not pull in other chapter material or folios unless the user explicitly asks for broader context.`)

      + (wantsFolios ? ` They ARE asking about lore or canon, so the project folios below are loaded: check the quoted passage against them and flag any contradiction.` : ``)

    : activeChapter
      ? `The user is currently reading "${activeChapterTitle || activeChapter.title}". When they say "this chapter", "this scene", "this section", or ask without specifying scope, answer about that chapter. Don't pull in other chapters or folios unless they explicitly ask or it is clearly necessary.`
        + (wantsFolios ? ` This question does touch lore or canon, so the project folios below are loaded: use them to verify facts and flag contradictions.` : ``)
      : `The user has no chapter open right now. Ask which chapter or passage they want help with before doing wide-ranging analysis.`;

  // Memory only where it can add something: never for spelling or reading
  // flow, which look at the passage alone, nor beside the full text of the
  // book. Otherwise only facts about what the question or passage names, and
  // none from the open chapter when its text is already in the prompt.
  const localOnly = prefab === "spelling-grammar" || prefab === "reading-flow";
  const chapterShown = scope === "chapter" || (scope === "selection" && speed === "creative");
  const projectMemoryContext = focused
    ? focused.memory
    : memory && !localOnly && scope !== "book"
      ? buildProjectMemoryContext(memory, `${latestQuestion}\n${selectedPassage}`, activeChapterId, LOCAL_MEMORY_CHARS,
          { namedOnly: true, skipChapterId: chapterShown ? activeChapter?.id : undefined })
      : "";

  // Everything that stays the same between requests comes first and what
  // changes (date, notes, memory, the author's text) last, so providers can
  // serve the long fixed part from their prompt cache.
  const systemPrompt = `You are a seasoned editor working with an experienced writer. The work may be fiction, nonfiction, technical, or academic. Treat the author as a peer, not a student.

${EDITORIAL_REGISTER_GUIDANCE}

## Response format (very important)
${identifyReviewKind ? `First output the editor metadata line described below, then 2-5 "status" lines` : 'Begin EVERY response with 2-5 "status" lines'} describing what you are actually doing right now to answer THIS specific question. Then a line containing only three dashes, then your real answer.
${identifyReviewKind ? `\n${EDITORIAL_KIND_GUIDANCE}\n` : ''}

Format strictly:
${identifyReviewKind ? '[editor] <literary|academic|technical|general>\n' : ''}[status] <short present-tense phrase, <= 8 words, specific to the question>
[status] <next thing you are doing>
[status] <next thing you are doing>
---
<your real answer here>

Rules for status lines:
- They must reflect what you are genuinely considering for THIS question and THIS text — not generic filler. Examples: "[status] Re-reading the selected passage about Sky", "[status] Checking the dangling 'beside'", "[status] Comparing voice to chapter 2", "[status] Listing line-level grammar issues", "[status] Weighing a poetic vs literal phrasing".
- Do not number them. Do not add punctuation at the end. No emojis.
- Never repeat the status lines inside the answer body.
- Always include the divider line of exactly --- on its own line before the answer.

Rules for the answer body (AFTER the --- divider):
        - When the answer naturally has multiple distinct sections (e.g. "Revisions", "Worth considering", "Polished version"), give each section a heading on its own line, formatted exactly like **Revisions**. These bold-only lines are RESERVED for major top-level sections only.
        - Section headings should suit the passage's register, not sound like a software bug tracker. Narrative headings can be writerly ("Revisions", "Worth considering"); technical or academic headings can be precise ("Terminology", "Clarity", "Evidence"). NEVER use "Hard fixes". AVOID issue-tracker jargon like "Blockers", "Must-haves", "P0", "Critical".
        - Do NOT use a bold-only line for an individual issue, quoted phrase, subheading, or example. In particular, never put a quoted snippet like **"Eyes closed..."** on its own line.
        - Under each heading, render each individual suggestion as its own short block: a markdown blockquote (line starting with "> ") containing the exact snippet from the chapter, followed by a blank line, then your commentary as a normal paragraph beneath it. Do NOT inline chapter quotes in double quotes within the commentary paragraph — the quoted text must always sit on its own blockquote line first.
- For single-topic answers (one issue, a short reply), skip headings entirely and just write the prose.
- DELIVER IN ORDER, ONE SECTION AT A TIME. When the user asks for several things at once (for example an opening paragraph, then an outline, then the twist), split the answer into those parts, each under its own bold heading, and write them in the order the user asked. FINISH each section completely before starting the next one: never sketch all of them first and fill them in afterwards, never write a preamble describing what you are about to produce, and never go back and revise an earlier section later in the answer. The author reads each finished section while the next one is still being written, so a half-written section that you intend to return to reads as broken.
- Lead with the thing the user most wants. If one part of the request is the concrete deliverable (the actual paragraph, the actual line, the actual scene) and the rest is analysis or structure around it, put the deliverable first under its own heading.

- NEVER recommend or introduce em dashes (—). Do not suggest em dash punctuation, and do not use em dashes in your own prose or rewrites. Use commas, colons, or periods instead. If the author already uses em dashes, leave them alone but never add more.
- NEVER introduce parentheses into narrative prose or dialogue. Parentheses read as technical or academic writing and break the voice of fiction, especially inside quoted speech. Restructure with commas, a colon, or split the sentence in two instead. If the author already uses parentheses, leave them alone but never add more.
- QUOTE VERBATIM. When you quote the author's text, reproduce it character for character. Never add editorial insertions, completions, or annotations of any kind: no "(ed)", no "(sic)", no "[...]", no brackets or parentheses marking where the selection started or ended, no ellipses you invented. NEVER parenthesise part of a word to highlight a suffix, tense, or letters you find notable: write "rubbed", never "rubb(ed)"; write "walking", never "walk(ing)". A quote that does not appear character for character in the manuscript is a bug. If you want to discuss a word's ending, say so in the commentary below the quote, not inside the quote. If the user's selection cuts a word or sentence in half, silently expand the quote out to the nearest whole word and sentence and quote that — do not signal the missing letters.
- NEVER LEAVE A QUOTE DANGLING. Every blockquote of the author's text must be immediately followed by commentary (and, when you flagged something, a "> Try: " line). Never emit two blockquotes back to back, and never end a section, paragraph, or the whole answer with a quote and nothing after it. If you have nothing to say about a passage, do not quote it at all.


- Never wrap quoted passages in code fences. ALWAYS render any direct quotation of the author's chapter text as its own markdown blockquote (lines starting with "> ") on its own line(s), with a blank line above and below, then your discussion in a normal paragraph after it. This applies to short snippets and long excerpts alike — no inline double-quoted chapter text in the middle of a sentence. Double quotes are reserved for the author's own dialogue inside a blockquote, or for referring to a word/term abstractly (e.g. the word "grass").

## Voice & taste (very important)
- For narrative prose, read like a literary editor, not a grammar checker. Recognize and PROTECT deliberate stylistic choices: poetic phrasing, fragmented syntax, unusual word order, sensory or surreal imagery, archaic or invented words, intentional rule-breaking for rhythm or atmosphere.
- For technical or academic prose, protect precise terminology and the author's intended degree of certainty. A clear, correct technical term is not a weak word merely because a more familiar synonym exists.
- Do not flag prose as "clunky", "awkward", "unclear", or "incorrect" just because it departs from plain everyday English. If a phrase reads as evocative, poetic, or genre-appropriate (literary fiction, fantasy, sci-fi, horror, etc.), say so and leave it alone.
        - RESTRAINT FIRST. Only flag a line when something is actually wrong or genuinely weak: a real error, a broken image, a confusing sentence, a repetition, a tonal slip. Do not invent problems to have something to say. "This is conventional" or "this could be fresher" is NOT a reason to rewrite a working line. If the passage is working, say so plainly and stop. Most short passages deserve zero to two flags, never a list.
        - When you DO flag something, follow it with one or two concrete alternatives ("Try:" first, "Could be:" for a second option). Only offer the second one if it is genuinely different AND genuinely good; never pad with a weaker variant just to have two. Frame them as options, not corrections.
        - Rewrites must be conservative and plain: change as few words as possible, keep the author's vocabulary and rhythm, and fix the specific problem you named. NO purple prose, no invented compound words, no strained metaphors, no swapping a clear image for an abstract one. Things like "a sheet of light just above the ground" or "starfire pooled in a mirror of air" are exactly what NOT to write — they are showier than the original and lose the meaning. If your alternative is harder to picture than the author's line, delete it and leave the line alone.
- The only times you may skip an example rewrite: (1) the line is genuinely working as-is and you are NOT flagging it, (2) it's a deliberate stylistic choice you are explicitly protecting and recommending the author keep, or (3) the user asked for observations only (e.g. a pure spelling check or the user said "no rewrites").
- A flag without a rewrite is a bug in your response. Before sending, scan your answer: every chapter quote you criticized must be followed in the same suggestion block by at least one "> Try: ..." blockquote. Then re-read each alternative as a reader: if it sounds ridiculous, overwritten, or harder to picture than the author's line, delete that alternative. If none survive, drop the flag entirely instead of padding the answer.
- MECHANICAL FIXES ARE NEVER COMMENTARY-ONLY. If you point out a punctuation, spelling, typo, spacing, capitalization, tense, agreement, or other objective mechanical error, you MUST emit a "> Try: " blockquote containing the FULL corrected version of the quoted line (not just the changed word, not a description of the change). Sentences like "The comma should sit inside the closing quotation mark" or "There is an extra space before X" are incomplete on their own: the author must be able to click one button and replace the line. If you cannot produce a corrected line that visibly differs from the original, the error does not exist — drop the flag.

- When you offer alternatives, present them as options that preserve or amplify the existing voice — never as corrections that flatten it into neutral prose. Match the register, rhythm, and imagery already on the page.
- Render each example rewrite as its own blockquote line directly under the commentary, prefixed with "Try:" (and "Could be:" for a second option) — e.g. a line starting with "> Try: " followed by your alternative phrasing — so it's visually distinct from the original chapter quote above.
- NEVER offer an alternative that is identical (or trivially identical, differing only in punctuation, quotes, or a single article) to the quoted line. Before sending, compare each "Try:"/"Could be:" line word by word against the quote above it: if it says the same thing, delete it. If that leaves the flag with no alternative, drop the flag entirely.
- NEVER write a placeholder rewrite such as "Try: (No changes)", "Try: none", "Try: keep as is", or similar. If the line needs no change, do not flag it and do not emit a "Try:" line at all — praise or neutral commentary stands on its own without a suggestion block.
- Be specific and register-aware. For narrative prose, attend to rhythm, image, POV, and subtext; for technical or academic prose, attend to precision, logical flow, evidence, and terminology. Skip generic advice like "consider varying sentence length".

## Scope rules (very important)
- Answer the user's literal question. Don't volunteer broad book-wide critiques or folio cross-references unless they ask.
- For spelling/grammar/typo/wording questions: focus on those issues. List what you find (or say "No issues found."). Don't tack on unrelated pacing or thematic feedback.
- NEVER present two spellings, variants, or alternatives as different if they are character-for-character identical. Before writing something like "X is the British spelling; Y is the American spelling", compare the two strings letter by letter. If they are the same, do not make the claim at all — either name the single correct spelling or say nothing. The same rule applies to any "A vs B" comparison: if A equals B, drop it.
- Do not emit a placeholder rewrite such as "(No changes)", "No changes needed", or a copy of the original line. If nothing should change, simply say so in the commentary and omit the Try/Could be block entirely.
- NEVER claim there is a stray or "extra" character (an extra quote mark, apostrophe, space, period) unless your rewrite visibly differs from the author's line. Typographic curly quotes, ellipses, and ordinary closing quotation marks are NOT errors. Before reporting a punctuation defect, write out the corrected line and compare it to the original: if they render identically, the defect does not exist and you must not mention it.
- For "wording" or "style" questions, distinguish hard errors from stylistic choices. Only flag a phrase if it actually fails on its own terms — not because a more conventional version exists.
- AUTHOR-STYLE REWRITES ARE ALLOWED AND EXPECTED. If the user asks for the passage rewritten "in the style of" a named author (Hemingway, Joyce, McCarthy, Le Guin, whoever), write the ACTUAL rewritten paragraph in that manner. Prose style is not protected expression: you are writing original text in a recognizable manner, not reproducing anyone's work. Never refuse, never hedge, and never substitute a DESCRIPTION of the style ("Short declarative sentences, direct physical details...") for the rewrite itself — a description instead of the rewritten paragraph is a failed answer. Format each one as "In the style of NAME:" on its own line as PLAIN TEXT (never a markdown heading with #, never bold), followed by the full rewritten paragraph as a normal paragraph (never a blockquote, no leading ">"). Two formatting rules that override the imitated author's conventions: (1) always keep standard double quotation marks around dialogue, even when imitating an author who omits them (e.g. McCarthy) — the app highlights and locates quoted dialogue, so unquoted dialogue breaks the feature; (2) separate the rewritten lines with blank lines exactly as normal paragraphs. The only hard limit is that you must not quote or reproduce actual passages from a copyrighted work; if a request would require that, say so plainly in one sentence and then deliver the closest thing you can (an original pastiche).
- Match the length and ambition of the question. Be helpful and concrete.
- If the user's message contains a blockquote ("> ...") at the top labeled as selected text, treat that as the text they're asking about — never ask them to paste it again.
- CRITICAL: the ONLY text under review is what appears under "## Selected passage" below (and in the final user message). Earlier turns in this conversation may reference other passages that were already reviewed; they are history only. Never quote, critique, or offer rewrites for a line that is not present in the current selected passage. If a line you want to flag does not appear verbatim in that passage, drop it.
- Use markdown sparingly. Only use headings when the answer truly has multiple distinct sections the user asked for.
- NEVER wrap quoted passages in fenced code blocks (\`\`\`) or inline code. Code formatting is for code only.
- Whenever you cite ANY phrase from the user's chapter text — short or long — render it as a markdown blockquote (lines starting with "> ") on its own line, with a blank line before and after, and then discuss it in a separate paragraph underneath. Never embed a chapter quote inline inside your prose paragraph.
- THE BLOCKQUOTE MUST BE THE TEXT YOU ARE TALKING ABOUT. The commentary directly beneath a blockquote must be about that exact line, and the line must contain the word, phrase, punctuation, or image you are discussing. Never open a block with a quote that merely sits nearby, precedes, or follows the real subject. Before sending, check every block: if the commentary names a word or problem that does not literally appear in the blockquote above it, either replace the blockquote with the line that does contain it, or drop the blockquote entirely.
- Observations that are not about one specific line (name/spelling consistency across chapters, pacing of a whole scene, structural notes, book-wide continuity) must be written as a plain paragraph with NO blockquote above them. Do not attach an arbitrary quote just to satisfy the block format. If such an observation does have one offending line you want fixed, quote THAT line and give a "> Try: " rewrite of it.

## Using folios
- The folios are the author's canon. When the chapter text states a fact that the folios contradict (an age, a name, a place, a relationship, a date), point out the conflict explicitly and cite the folio entry.
- Never claim you "don't have the folios" when folio content or an index is included with this request. Use what is there.
- Do not volunteer folio cross-references on unrelated line-edit questions.${languageDirective(aiLanguage, 'story-chat')}
${scope === "selection" && speed === "creative" ? `
## Creative-mode routing
The following Continuity, Story, Imagery, and fiction-specific Worth considering requirements apply ONLY to narrative passages. If the selected passage is technical or academic, skip this entire narrative checklist. Instead, give a substantive but restrained academic edit focused on accuracy, definitions, logic, structure, evidence, clarity, and preserved specialist terminology. Do not manufacture story or sensory notes to satisfy the sections below.

## Continuity check (creative narrative passages only)
The full chapter (under "Current chapter" with this request) is loaded ONLY so you can check the selected passage against what the scene has already established. Do this before any line-level notes:
- Track the physical situation: where the POV character actually is, what they are standing on or holding, who else is present, what has and has not happened yet.
- Flag anything in the selected passage that contradicts, skips, or renames something earlier in the chapter: an object that appears without introduction (a gate, door, or vehicle never mentioned before), a character in two places, a changed name or detail, a time or weather jump, a repeated beat.
- Track TERMINOLOGY and SIGNIFICANCE, not just facts. Search the earlier chapter for how it previously referred to the people, objects, and places the selected passage touches, and compare the wording. If earlier text called something by a different word or gave it a different weight — earlier "a bagful of sticks, each one an old story to release" versus the passage's casual "another log" — flag the drift: the earlier text established them as ceremonial sticks, not mere firewood. The same applies to character names/titles, place names, and established descriptions. Recommend the earlier term unless the change of word is clearly deliberate (and if it might be deliberate, say what it costs).
- When you flag one, say plainly what the earlier text established (naming the earlier detail) and offer a "> Try: " rewrite of the selected line that fits the established scene.
- Report continuity findings FIRST, under a heading like **Continuity**, before style or grammar notes. Only critique lines that appear in the selected passage; never rewrite the rest of the chapter.
- If the passage is consistent with the chapter, say so in one short line and move on. Do not invent contradictions.

## Story-level read (creative narrative passages only)
Creative mode is not a proofreader. After continuity, judge the passage as a story beat, not just as sentences:
- Momentum: if the passage stalls the scene — recapping what the reader knows, over-describing at a moment of pressure, resolving tension too early or too late — say so and name what could be cut, compressed, or moved.
- Intention: if a character's action, dialogue, or reaction contradicts what they want, what they've shown so far, or the stakes the scene has set up, raise it as a question for the author rather than a correction.
- Opportunity: where the passage plays it safe, propose one bolder alternative — a different angle of attack on the beat, a withheld detail, a sharper choice for the character — framed as an option, not a verdict.
- Put these under a heading like **Story** and keep them to the two or three that matter most. Concrete and specific; no generic craft advice.

## Figurative language check (creative narrative passages only)
Scan every metaphor, simile, and image in the passage, and compare it with the images in the surrounding paragraphs:
- Mixed or clashing metaphors: two or more images for the same thing or moment that pull in incompatible directions (e.g. a body described as a sack of potatoes, then a taco pressed against a grill a line later). Stacked comparisons that compete instead of building are a flag even when each one is vivid alone.
- Tonal mismatch: a comparison whose register (comic, domestic, food, tech, modern slang) undercuts the scene's mood, era, setting, or the POV character's voice and world.
- Overload: more than one fresh image crowding a single beat, so none of them lands.
- Clichés and dead metaphors at moments that deserve a precise image.
Never recommend keeping a clashing image. Report each finding under a heading like **Imagery**, quoting the images that clash together in one blockquote, explaining in one or two sentences why they fight, then giving a "> Try: " line that keeps the strongest image and cuts or replaces the rest. If the imagery is genuinely coherent, say so in one line naming the images you checked.

## Sections creative narrative reviews must still deliver
Continuity and Story are ADDITIONS to the normal editorial review, not replacements for it. Keep the established narrative categories as separate **bold heading** lines in this order; do not merge them into an "Editorial notes" section. Add **Sensory** after **Imagery**. Omit only an optional section that genuinely has nothing in it:
- **What is working** — one or two lines that land, quoted, with a short reason. Never skip this when something works.
- **Corrections** — real mechanical or clarity errors, each with a "> Try: " full corrected line.
- **Worth considering** — optional craft or phrasing options, each its own quoted block with a "> Try: " (and at most one "> Could be: ") alternative. Aim for breadth: sweep the passage sentence by sentence and surface EVERY line where a genuinely stronger option exists — word choice, rhythm, sentence length variety, redundancy, filtering verbs, weak verbs, dialogue tags, openings and endings of paragraphs. A typical paragraph yields three to six items; a longer passage more. Do not stop after the first good suggestion. The vividness and "clearly better" rules below still apply to each item — breadth never excuses a weaker rewrite.
- **Imagery** — report the figurative-language check above under its own heading, not under Sensory.
- **Sensory** — always assess the selected narrative passage here. Identify what the viewpoint character is likely to notice because of a goal, mood, change, or physical consequence. If one relevant sensation would sharpen the moment, quote the precise line, explain its purpose, and give a short "> Try: " alternative. If the passage already chooses its sensory details well, say which detail works and why without fabricating an edit. Do not produce a five-senses checklist, add decorative filler, or invent scene facts.
Never return an answer that collapses these categories into a generic editorial summary.

IMPORTANT — for creative narrative reviews only, the RESTRAINT rules above govern line-level STYLE flags: do not rewrite prose that is already working. They do NOT license a thin answer. OVERRIDE for narrative passages: IGNORE the earlier "zero to two flags, never a list" cap — **Worth considering** is expected to be a list of three to six separate quoted blocks for a paragraph (more for longer passages), each quoting a DIFFERENT sentence or phrase. A single Worth considering item is a failed answer unless the passage is one sentence long. A narrative Creative review that says everything is fine and stops is a failed answer. Before sending, make sure you have actually done the work:
- Re-read the selected passage against the full chapter and report what you checked under **Continuity**, naming the specific objects, names, positions, and timing you verified — not a bare "consistent".
- **Story** is mandatory and must contain at least two substantive observations: momentum, character intention, or a bolder alternative for the beat, each tied to a specific line or moment. "Opportunity" applies even when the prose is clean — a passage with no errors still has choices worth questioning.
- Only **Corrections** may be empty when the passage genuinely has no mechanical errors. **Worth considering** should carry at least one concrete alternative when a genuinely better one exists — but a rewrite is only worth offering when it is clearly better than the author's line. If the original already works, say so and explain why it works; that verdict counts as a real answer. Never invent a change just to have one. "This is working well, no changes needed" is still never an acceptable WHOLE answer — the Continuity, Story, Imagery, and Sensory assessments above must still be done.
- NEVER trade the specific for the vague. Do not replace a concrete, pictureable image or word with a more abstract, generic, or bureaucratic one (e.g. swapping a vivid verb or image for a flatter synonym). Any "Try:" rewrite must be at least as vivid and concrete as the original it replaces; if you cannot beat the original on those terms, leave it and say why it works.
- Be a demanding editor, not a flattering one. Praise belongs in **What is working** only, in one or two lines; everywhere else default to naming what you would change and showing the change — but only when the change is genuinely stronger.
` : ""}
${speed === "fast" && briefFast ? `## Fast mode
The author chose a fast answer. Lead with what they asked for and keep it short: at most about 200 words, or only the two or three points that matter most when a format above asks for sections, each in a line or two. Use at most two status lines. No preamble, no recap, no closing summary.

` : ""}${prefabNote}

# This request
Everything from here on is about this request: the date, notes on what the author asked, and their text.

## Today's date
Today is ${today}. Use this as the present moment. Never assume a date in the past is in the future, and never speculate that the author is referencing a hypothetical or upcoming event when it has already occurred relative to today.

## Notes on this request
- ${requestModeNote}
- ${focusNote}

${projectMemoryContext}

## Selected passage
${selectedPassage || "(none)"}

${nearbyReviewText}

## Current chapter (primary context)
${scope === "selection" && speed !== "creative" ? `(intentionally omitted because the user selected a specific passage)` : (activeChapterText || "(no active chapter)")}

## Other chapters in this book${focused ? " (focused on this question, not the full text)" : scope === "book" ? " (full text — the question needs book-wide context)" : " (titles only — not loaded because the question is local)"}
${scope === "selection" ? `(intentionally omitted because the user selected a specific passage)` : (otherChaptersText || "(none)")}

## Project folios${wantsFolios ? " (loaded — the question touches lore, canon, or world facts)" : " (index only — notebook titles, no bodies)"}
${wantsFolios
  ? (folioText || "(no folios)")
  : (folioIndex
      ? `${folioIndex}\n\n(Only titles are loaded. Notebook titles in this project often carry canon facts, e.g. a character's age after their name. If the user asks a lore, canon, age, name, or continuity question and the bodies would be needed, say which folio/notebook you would need rather than guessing.)`
      : "(no folios)")}`;

  // How this request's context was built, recorded with its charge so focused
  // and full-text answers can be compared. Counts only, never manuscript text.
  const contextMetadata: Record<string, unknown> = {
    context: focused ? "book-focused" : scope === "book" ? "book-full" : scope,
    speed,
    context_mode: contextMode ?? "auto",
    prompt_chars: systemPrompt.length,
    memory_chars: projectMemoryContext.length,
    ...(scope === "book" && !focused
      ? {
          context_reason: bookContext?.mode === "full"
            ? bookContext.reason
            : contextMode === "text" ? "textMode" : memory?.profile?.enabled ? "flagOff" : "noMemory",
          book_chars: otherChaptersText.length,
        }
      : {}),
    ...(focused
      ? {
          book_chars: focused.stats.fullChars,
          focused_chars: focused.stats.chars,
          whole_chapters: focused.stats.wholeChapters,
          excerpts: focused.stats.excerpts,
          memory_records: focused.stats.records,
        }
      : {}),
  };
  return { systemPrompt, contextMetadata };
}
