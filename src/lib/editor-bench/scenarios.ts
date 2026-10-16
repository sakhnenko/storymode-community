import { EDITORIAL_REVIEW_REQUEST } from '../editorial-review-request.ts';
import { chapterById, scene } from './fixture.ts';

// The AI editor questions benchmarked on the fixture book, one of each kind
// authors ask: about a selected passage, the open chapter, or the whole book.
// `expect` lists what a correct answer has to mention; live runs check it.

export type BenchKind = 'passage' | 'chapter' | 'book';

export interface BenchScenario {
  id: string;
  kind: BenchKind;
  /** The chapter open in the editor. */
  chapterId: string;
  question: string;
  /** A passage selected in that chapter, word for word. */
  selection?: string;
  prefab?: 'editorial-review' | 'spelling-grammar' | 'reading-flow';
  /** Every pattern must appear in a correct answer. */
  expect?: RegExp[];
  /** Sentences of the book a correct answer depends on: the prompt has to include them. */
  evidence?: string[];
  /** About the story as a whole (its plot, its ending), so it needs the whole book even with memory. */
  wholeBook?: boolean;
}

// The prefab requests the editor's buttons send (see PREFABS in StoryChat.tsx).
const SPELLING = 'Check this passage for spelling, grammar, and punctuation errors. List only actual errors found. For every issue, include a concrete corrected option prefixed with Try: or Could be:. Do not add broader style rewrites.';
const FLOW = 'Analyze how the sentences in this passage flow when read. Comment on rhythm, cadence, sentence length variety, and any moments that feel abrupt or trip up the reader. When a moment trips the reader, include a concrete option for smoother flow, prefixed with Try: or Could be:.';

export const SCENARIOS: BenchScenario[] = [
  { id: 'passage-review', kind: 'passage', chapterId: 'ch-5', prefab: 'editorial-review',
    question: EDITORIAL_REVIEW_REQUEST.en, selection: scene('ch-5', 0) },
  { id: 'passage-spelling', kind: 'passage', chapterId: 'ch-5', prefab: 'spelling-grammar',
    question: SPELLING, selection: scene('ch-5', 5), expect: [/across/i, /straight/i, /their/i] },
  { id: 'passage-flow', kind: 'passage', chapterId: 'ch-6', prefab: 'reading-flow',
    question: FLOW, selection: scene('ch-6', 1) },
  { id: 'passage-continuity', kind: 'passage', chapterId: 'ch-8',
    question: 'Is this consistent with earlier chapters?', selection: scene('ch-8', 2), expect: [/left/i],
    evidence: ['Kai lost his left eye'] },
  { id: 'chapter-review', kind: 'chapter', chapterId: 'ch-5',
    question: "What's working in this chapter, and what isn't?" },
  { id: 'chapter-brainstorm', kind: 'chapter', chapterId: 'ch-7',
    question: 'Suggest three different ways this chapter could end.' },
  { id: 'chapter-local', kind: 'chapter', chapterId: 'ch-5',
    question: 'Where are Sky and Lia staying in this chapter?', expect: [/Vic/], evidence: ["They stayed at Vic's safe house"] },
  { id: 'book-eyes', kind: 'book', chapterId: 'ch-8',
    question: "What color are Lia's eyes, and is that consistent across the book?", expect: [/green/i, /brown/i],
    evidence: ["Lia's eyes were green as moss", 'her brown eyes'] },
  { id: 'book-age', kind: 'book', chapterId: 'ch-8',
    question: "Is Kai's age consistent throughout the book?", expect: [/twenty-three|\b23\b/i, /twenty-five|\b25\b/i],
    evidence: ['Kai had turned twenty-three that spring', 'Kai, twenty-five years old'] },
  { id: 'book-injury', kind: 'book', chapterId: 'ch-8',
    question: 'Which eye did Kai lose, and is the book consistent about it?', expect: [/left/i, /right/i],
    evidence: ['Kai lost his left eye', "the scar over Kai's right eye"] },
  { id: 'book-mention', kind: 'book', chapterId: 'ch-8',
    question: 'Where did I first mention the amulet?', expect: [/Descent|chapter 3/i],
    evidence: ['an amulet: a disc of green glass'] },
  { id: 'book-named-chapter', kind: 'book', chapterId: 'ch-8',
    question: 'What happens to Kai in chapter 4?', expect: [/eye/i], evidence: ['Kai lost his left eye in the battle at the roots'] },
  { id: 'book-reported', kind: 'book', chapterId: 'ch-8',
    question: 'Earlier in the book, who believed Kai was dead, and were they right?', expect: [/Mara/],
    evidence: ['she believed Kai was dead'] },
  { id: 'book-ending', kind: 'book', chapterId: 'ch-5', wholeBook: true,
    question: 'Does the ending make sense given what happened in the other chapters? Could it be more of a twist?',
    evidence: ['That night Harwood lit every lantern on every bridge'] },
  { id: 'book-craft', kind: 'book', chapterId: 'ch-8',
    question: 'How is the pacing across the book?' },
  { id: 'book-plot-holes', kind: 'book', chapterId: 'ch-8',
    question: 'Are there any plot holes so far?' },
];

/** The user message the editor sends, with a selection quoted the way StoryChat quotes it. */
export function userMessage(scenario: BenchScenario) {
  const { selection, question } = scenario;
  return selection ? `> Selected text from chapter:\n> ${selection.replace(/\n/g, '\n> ')}\n\n${question}` : question;
}

/** The text around a selection, as the review queue sends it with an editorial review. */
export function reviewContext(scenario: BenchScenario) {
  if (scenario.prefab !== 'editorial-review' || !scenario.selection) return undefined;
  const content = chapterById(scenario.chapterId).content;
  const at = content.indexOf(scenario.selection);
  return { before: content.slice(Math.max(0, at - 600), at), after: content.slice(at + scenario.selection.length, at + scenario.selection.length + 600) };
}

/** The answer after the status lines, which is what `expect` is checked against. */
export function answerBody(raw: string) {
  const divider = raw.match(/(?:^|\n)---\s*\n/);
  return divider?.index == null ? raw : raw.slice(divider.index + divider[0].length);
}

export const failedChecks = (scenario: BenchScenario, answer: string) =>
  (scenario.expect || []).filter(pattern => !pattern.test(answerBody(answer))).map(String);
