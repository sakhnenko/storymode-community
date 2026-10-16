import { selectProjectMemory } from './memory-graph.ts';
import { isMemoryCurrent, type ProjectMemory } from './project-memory.ts';

// Focused context for the AI editor's book-wide questions. Instead of every
// chapter's full text: project memory (facts with their quotes), in full only
// the chapters the question names or whose current text memory hasn't read,
// and from the rest the paragraphs that mention what the question is about.
// Questions about the craft of the whole book, or with nothing to search for,
// keep the full text.

export interface BookChapter {
  id: string;
  title: string;
  content: string;
}

export type FullReason = 'noMemory' | 'craft' | 'asked' | 'small' | 'nothingToSearch' | 'notWorthIt';

export interface FocusedStats {
  /** Characters the full text of the other chapters would have taken. */
  fullChars: number;
  /** Characters sent instead: whole chapters and excerpts, not counting memory. */
  chars: number;
  wholeChapters: number;
  excerpts: number;
  records: number;
}

export type BookContext =
  | { mode: 'focused'; memory: string; chapters: string; stats: FocusedStats }
  | { mode: 'full'; reason: FullReason };

/** The full-text path's own cap on the other chapters. */
const FULL_TEXT_CHARS = 120_000;
/** Below this, the other chapters cost little enough to send whole. */
const SMALL_BOOK_CHARS = 30_000;
const MEMORY_CHARS = 16_000;
const EXCERPT_CHARS = 24_000;
const PIECE_CHARS = 1_200;
const PIECES_PER_CHAPTER = 8;
/** Focused context must come to less than this share of the full text, or the full text goes. */
const WORTH_IT = 0.7;

/**
 * Questions about the craft or the story of the whole book (its plot, its
 * ending, whether it holds together), which need its prose rather than a few
 * facts and the paragraphs that use the question's words.
 */
const CRAFT = /\b(pacing|arcs?|foreshadow\w*|character development|subplots?|structure|themes?|tone|voice|prose|style|tension|stakes|momentum|climax|midpoint|endings?|beginning|twists?|plot|plots|makes? sense|so far|overall|as a whole|summar\w*|synopsis|resolution|payoff|conclusion)\b|(?<!\p{L})(ritmo|arcos?|prenúnci\w*|desenvolvimento d[eo]s? personage\w*|subtramas?|estrutura|temas?|voz|estilo|tensão|clímax|final|desfecho|começo|reviravoltas?|enredo|faz sentido|até agora|resumo|resum\w+|sinopse|conclusão)(?!\p{L})/iu;
/** The author asked for the whole text. */
const WHOLE_BOOK = /\b(full text|full book|whole book|entire book)\b|(?<!\p{L})(texto completo|livro inteiro|livro todo|todo o livro)(?!\p{L})/iu;

export function bookQuestionKind(question: string): 'facts' | 'craft' | 'asked' {
  if (WHOLE_BOOK.test(question)) return 'asked';
  return CRAFT.test(question) ? 'craft' : 'facts';
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
/** Folded text without Markdown marks, for finding a quote in the stored chapter. */
const plain = (text: string) => fold(text.replace(/[*_~`>#\\]/g, '').replace(/\s+/g, ' ')).trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5, sexto: 6, setimo: 7, oitavo: 8, nono: 9, decimo: 10,
};

/**
 * Indexes (in book order) of the chapters a question names: by number
 * ("chapter 3", "ch. 2-4", "capítulo dois"), as first or last, as the one
 * before or after the open chapter, or by title.
 */
export function referencedChapters(question: string, chapters: BookChapter[], activeIndex: number) {
  const q = fold(question);
  const found = new Set<number>();
  const add = (index: number) => { if (index >= 0 && index < chapters.length) found.add(index); };
  const byNumber = (n: number) => {
    const titled = chapters.findIndex(c => new RegExp(`^(?:chapter|capitulo|ch\\.?)\\s*${n}(?!\\p{N})`, 'u').test(fold(c.title.trim())));
    add(titled >= 0 ? titled : n - 1);
  };
  for (const match of q.matchAll(/(?<!\p{L})(?:chapters?|chap\.?|ch\.|capitulos?|cap\.)\s*((?:\d{1,3}|\p{L}+)(?:\s*(?:,|and|e|&|-|–|to|a)\s*\d{1,3})*)/gu)) {
    const list = match[1];
    const range = list.match(/^(\d{1,3})\s*(?:-|–|to|a)\s*(\d{1,3})$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      for (let n = from; n <= to && n - from < 12; n++) byNumber(n);
      continue;
    }
    const word = list.match(/^\p{L}+/u)?.[0];
    if (word) { if (NUMBERS[word]) byNumber(NUMBERS[word]); continue; }
    for (const n of list.match(/\d{1,3}/g) || []) byNumber(Number(n));
  }
  for (const match of q.matchAll(/(?<!\p{L})(\p{L}+)\s+(?:chapter|capitulo)(?!\p{L})/gu)) {
    const word = match[1];
    if (ORDINALS[word]) add(ORDINALS[word] - 1);
    else if (['last', 'final', 'ultimo'].includes(word)) add(chapters.length - 1);
    else if (['previous', 'prior', 'preceding'].includes(word) && activeIndex > 0) add(activeIndex - 1);
    else if (['next', 'following', 'proximo'].includes(word) && activeIndex >= 0) add(activeIndex + 1);
  }
  if (/(?<!\p{L})capitulo (anterior)(?!\p{L})/u.test(q) && activeIndex > 0) add(activeIndex - 1);
  if (/(?<!\p{L})capitulo (seguinte)(?!\p{L})/u.test(q) && activeIndex >= 0) add(activeIndex + 1);
  if (/(?<!\p{L})capitulo final(?!\p{L})/u.test(q)) add(chapters.length - 1);
  chapters.forEach((chapter, index) => {
    const title = fold(chapter.title.trim());
    const names = [title, title.split(/\s*[:—–]\s*/).slice(1).join(' ')]
      .filter(name => name.length >= 4 && !/^(?:chapter|capitulo|ch\.?)\s*\d+$/.test(name));
    if (names.some(name => new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'u').test(q))) add(index);
  });
  found.delete(activeIndex);
  return [...found].sort((a, b) => a - b);
}

/** Words that would match almost any paragraph, or only describe the question, in English and Portuguese. */
const STOP = new Set([
  'the', 'and', 'for', 'but', 'not', 'you', 'his', 'her', 'she', 'him', 'its', 'our', 'all', 'any', 'can', 'did',
  'was', 'are', 'has', 'had', 'who', 'how', 'why', 'one', 'two', 'out', 'yet', 'too', 'now', 'got', 'get', 'let',
  'may', 'own', 'way', 'use', 'see', 'say', 'yes', 'far', 'lot', 'bit', 'new', 'put', 'set',
  'about', 'above', 'after', 'again', 'against', 'already', 'also', 'another', 'anything', 'anywhere', 'around',
  'because', 'been', 'before', 'beforehand', 'being', 'between', 'book', 'books', 'both', 'came', 'chapter',
  'chapters', 'character', 'characters', 'check', 'come', 'consistency', 'consistent', 'continuity', 'contradict',
  'contradiction', 'contradictions', 'contradicts', 'correct', 'correctly', 'could', 'describe', 'described',
  'description', 'different', 'does', 'doing', 'done', 'down', 'during', 'each', 'earlier', 'either', 'else',
  'elsewhere', 'even', 'ever', 'every', 'everything', 'find', 'first', 'found', 'from', 'happen', 'happened',
  'happens', 'have', 'having', 'here', 'hole', 'holes', 'inconsistency', 'inconsistent', 'into', 'just', 'know',
  'later', 'like', 'line', 'lines', 'look', 'make', 'manuscript', 'many', 'mention', 'mentioned', 'mentions',
  'more', 'most', 'much', 'must', 'name', 'named', 'names', 'never', 'novel', 'once', 'only', 'other', 'others',
  'over', 'page', 'pages', 'part', 'passage', 'place', 'places', 'plot', 'point', 'previous', 'previously',
  'reader', 'readers', 'rest', 'right', 'said', 'same', 'says', 'scene', 'scenes', 'should', 'show', 'shown',
  'shows', 'since', 'some', 'something', 'still', 'story', 'such', 'sure', 'tell', 'text', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'this', 'those', 'through', 'throughout',
  'time', 'timeline', 'under', 'until', 'very', 'want', 'were', 'what', 'when', 'where', 'whether', 'which',
  'while', 'will', 'with', 'within', 'would', 'write', 'written', 'wrong', 'wrote', 'your',
  'across', 'always', 'call', 'called', 'calls', 'change', 'changed', 'changes', 'everywhere', 'match', 'matches',
  'matching', 'nowhere', 'somewhere', 'spelled', 'spelling', 'stay', 'stayed', 'stays', 'whole',
  'que', 'com', 'por', 'uma', 'dos', 'das', 'nos', 'nas', 'aos', 'ele', 'ela', 'seu', 'sua', 'foi', 'era', 'tem',
  'sem', 'ate', 'mas', 'ser', 'vai', 'meu', 'nao', 'sim',
  'algum', 'alguma', 'algumas', 'alguns', 'antes', 'aqui', 'cada', 'capitulo', 'capitulos', 'cena', 'cenas',
  'certo', 'coerencia', 'coerente', 'como', 'consistente', 'continuidade', 'contradicao', 'contradicoes',
  'contradiz', 'dela', 'delas', 'dele', 'deles', 'depois', 'descrevi', 'descrita', 'descrito', 'deve', 'devem',
  'enredo', 'entre', 'errado', 'essa', 'esse', 'esta', 'estao', 'estava', 'este', 'fazer', 'feito', 'foram',
  'historia', 'historias', 'isso', 'isto', 'leitor', 'linha', 'livro', 'lugar', 'lugares', 'menciona',
  'mencionada', 'mencionado', 'mencionei', 'mesma', 'mesmo', 'minha', 'minhas', 'meus', 'nome', 'nomes', 'nunca',
  'onde', 'outra', 'outras', 'outro', 'outros', 'pagina', 'paginas', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'personagem', 'personagens', 'pode', 'podem', 'primeira', 'primeiro', 'qual', 'quais', 'quando', 'seria',
  'sempre', 'sobre', 'tambem', 'tempo', 'texto', 'toda', 'todas', 'todo', 'todos', 'trecho', 'verificar',
  'verifique', 'acontece', 'aconteceu', 'ainda', 'chamada', 'chamado', 'diferente', 'diferentes', 'igual', 'iguais',
  'muda', 'mudar', 'mudou',
]);

/** A short word stem, so "injured" finds "injury" and "eyes" finds "eye". */
const stem = (word: string) => word.length >= 7 ? word.slice(0, -3) : word.length >= 4 && word.endsWith('s') ? word.slice(0, -1) : word;

interface Term { label: string; re: RegExp }

/** Content words of `text`, folded and stemmed, without stop words or words of the given names. */
function contentWords(text: string, minLength: number, skip: Set<string>): Term[] {
  const seen = new Set<string>();
  const terms: Term[] = [];
  for (const raw of text.match(/[\p{L}\p{N}]+/gu) || []) {
    const word = fold(raw);
    if (word.length < minLength || STOP.has(word) || /^\d+$/.test(word) || skip.has(word)) continue;
    const root = stem(word);
    if (seen.has(root)) continue;
    seen.add(root);
    terms.push({ label: raw, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(root)}`, 'u') });
  }
  return terms;
}

/** A chapter's paragraphs, with long ones cut at sentence ends into pieces of at most PIECE_CHARS. */
function pieces(content: string): string[] {
  const result: string[] = [];
  for (const block of content.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)) {
    if (block.length <= PIECE_CHARS) { result.push(block); continue; }
    let current = '';
    for (const sentence of block.split(/(?<=[.!?…]["”’)]?)\s+/)) {
      const part = sentence.length > PIECE_CHARS ? `${sentence.slice(0, PIECE_CHARS - 1)}…` : sentence;
      if (current && current.length + part.length + 1 > PIECE_CHARS) { result.push(current); current = ''; }
      current = current ? `${current} ${part}` : part;
    }
    if (current) result.push(current);
  }
  return result;
}

interface Candidate { index: number; text: string; score: number }

/**
 * The best-matching paragraphs of `chapters`, taken in turns (each chapter's
 * best, then each one's second best, and so on), so the budget spreads
 * across the book rather than filling up on its first chapters.
 */
function excerpts(chapters: BookChapter[], terms: { names: Term[]; words: Term[]; passage: Term[] },
  pins: Map<string, string[]>, budget: number) {
  const needed = Math.min(2, terms.words.length);
  const ranked = chapters.map(chapter => {
    const quotes = pins.get(chapter.id) || [];
    return pieces(chapter.content).flatMap((text, index): Candidate[] => {
      const folded = fold(text);
      const names = terms.names.filter(t => t.re.test(folded)).length;
      const words = terms.words.filter(t => t.re.test(folded)).length;
      const pinned = quotes.length > 0 && quotes.some(quote => plain(text).includes(quote));
      if (!names && !pinned && (!needed || words < needed)) return [];
      const passage = terms.passage.filter(t => t.re.test(folded)).length;
      return [{ index, text, score: names * 3 + words + passage * 0.5 + (pinned ? 3 : 0) }];
    }).sort((a, b) => b.score - a.score);
  });
  const order = chapters.map((_, i) => i).filter(i => ranked[i].length)
    .sort((a, b) => ranked[b][0].score - ranked[a][0].score || a - b);
  const chosen = chapters.map((): Candidate[] => []);
  let used = 0;
  for (let round = 0; round < PIECES_PER_CHAPTER; round++) {
    let added = false;
    for (const i of order) {
      const candidate = ranked[i][round];
      if (!candidate || used + candidate.text.length + 8 > budget) continue;
      chosen[i].push(candidate);
      used += candidate.text.length + 8;
      added = true;
    }
    if (!added) break;
  }
  const blocks: string[] = [];
  chapters.forEach((chapter, i) => {
    const list = chosen[i].sort((a, b) => a.index - b.index);
    if (!list.length) return;
    const body = list.map((c, k) => (k > 0 && c.index !== list[k - 1].index + 1 ? `(…)\n\n${c.text}` : c.text)).join('\n\n');
    blocks.push(`### ${chapter.title} (excerpts)\n${body}`);
  });
  return {
    text: blocks.join('\n\n'),
    count: chosen.reduce((n, list) => n + list.length, 0),
    unmatched: chapters.filter((_, i) => !ranked[i].length),
    more: chapters.filter((_, i) => chosen[i].length < ranked[i].length),
  };
}

/** Builds the focused context for a book-wide question, or says why the full text should go instead. */
export function focusedBookContext({ chapters, activeChapterId, question, passage, memory }: {
  /** Every chapter in book order, with the text the author sees. */
  chapters: BookChapter[];
  activeChapterId?: string | null;
  question: string;
  passage: string;
  memory: ProjectMemory;
}): BookContext {
  if (!memory.profile?.enabled) return { mode: 'full', reason: 'noMemory' };
  const kind = bookQuestionKind(question);
  if (kind !== 'facts') return { mode: 'full', reason: kind };
  const activeIndex = chapters.findIndex(c => c.id === activeChapterId);
  const others = chapters.filter((_, i) => i !== activeIndex);
  const fullChars = Math.min(others.reduce((n, c) => n + c.title.length + c.content.length + 6, 0), FULL_TEXT_CHARS);
  if (fullChars <= SMALL_BOOK_CHARS) return { mode: 'full', reason: 'small' };

  const active = activeIndex >= 0 ? chapters[activeIndex] : null;
  const selection = selectProjectMemory(memory, `${question}\n${passage || active?.title || ''}`, active?.id, MEMORY_CHARS);
  const nameLabels = [...new Set(selection.named.flatMap(node => {
    const names = [node.name, ...node.aliases];
    // People also go by part of their name ("Oren" for "Oren Vale").
    const parts = node.kind === 'person' ? names.flatMap(name => name.split(/\s+/)).filter(part => /^\p{Lu}/u.test(part)) : [];
    return [...names, ...parts];
  }))].filter(name => name.length >= 3);
  const quoted = [...question.matchAll(/["“]([^"“”]{3,80})["”]/g)].map(m => m[1].trim());
  const nameWords = new Set(nameLabels.flatMap(name => fold(name).split(/\s+/)));
  const terms = {
    names: [...nameLabels, ...quoted].map(label => ({
      label, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(fold(label))}(?![\\p{L}\\p{N}])`, 'u'),
    })),
    words: contentWords(question, 3, nameWords),
    passage: contentWords(passage, 5, nameWords).slice(0, 30),
  };
  const referenced = new Set(referencedChapters(question, chapters, activeIndex).map(i => chapters[i].id));
  if (!terms.names.length && !terms.words.length && !referenced.size) return { mode: 'full', reason: 'nothingToSearch' };

  // Memory only speaks for chapters whose current text it has read; the rest go whole.
  const current = new Set(memory.chapters.filter(isMemoryCurrent).map(c => c.id));
  const whole = others.filter(c => referenced.has(c.id) || !current.has(c.id));
  const searched = others.filter(c => !whole.includes(c));
  const pins = new Map<string, string[]>();
  for (const record of selection.records) {
    pins.set(record.chapterId, [...(pins.get(record.chapterId) || []), plain(record.quote).slice(0, 60)]);
  }
  const found = excerpts(searched, terms, pins, EXCERPT_CHARS);
  // Plain words that appear nowhere may be phrased differently in the book; only names make a miss meaningful.
  if (!found.count && !terms.names.length && !referenced.size) return { mode: 'full', reason: 'nothingToSearch' };

  const wholeText = whole.map(c => `### ${c.title} (full text)\n${c.content}`).join('\n\n');
  const chars = wholeText.length + found.text.length;
  if (chars >= WORTH_IT * fullChars) return { mode: 'full', reason: 'notWorthIt' };

  const titles = (list: BookChapter[]) => list.map(c => `"${c.title}"`).join(', ');
  const searchedFor = [...nameLabels, ...quoted, ...terms.words.map(t => t.label)].slice(0, 10).join(', ');
  const unread = whole.filter(c => !referenced.has(c.id));
  const named = whole.filter(c => referenced.has(c.id));
  const notes = [
    `Not the full text of the book. For this question you have: the project memory records above${whole.length ? ', the chapters below marked "full text"' : ''}, and from the other chapters every paragraph that mentions ${searchedFor || 'what the question names'}. Every chapter was searched.`,
    `Chapters in book order: ${chapters.map((c, i) => `${i + 1}. ${c.title}`).join('; ')}.`,
    named.length ? `Given in full because the question names them: ${titles(named)}.` : '',
    unread.length ? `Given in full because project memory has not read their current text: ${titles(unread)}.` : '',
    found.unmatched.length ? `No paragraph mentions it in: ${titles(found.unmatched)}.` : '',
    found.more.length ? `More matching paragraphs than shown in: ${titles(found.more)}. If they could change the answer, say so and name the chapter.` : '',
    'If the answer depends on something not shown here, say which chapters you would need instead of guessing, and tell the author that asking about "the whole book" has every chapter read. Never claim the book lacks something unless it was searched for.',
  ].filter(Boolean).join('\n');
  return {
    mode: 'focused',
    memory: selection.text,
    chapters: [notes, wholeText, found.text].filter(Boolean).join('\n\n'),
    stats: { fullChars, chars, wholeChapters: whole.length, excerpts: found.count, records: selection.records.length },
  };
}
