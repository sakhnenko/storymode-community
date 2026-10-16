import { describe, expect, it } from 'vitest';
import { bookQuestionKind, focusedBookContext, referencedChapters, type BookChapter } from '../../supabase/functions/_shared/book-context';
import { wholeBookText } from '../../supabase/functions/story-chat/editor-request';
import type { MemoryChapter, MemoryClaim, ProjectMemory } from '../../supabase/functions/_shared/project-memory';

const filler = (seed: number) => Array.from({ length: 30 }, (_, i) =>
  `The wind moved over the hills (${seed}-${i}) and the river ran cold under the old stone bridge, `.repeat(4).trim()).join('\n\n');
const book: BookChapter[] = [
  { id: 'c1', title: 'Chapter 1: Treetops', content: `${filler(1)}\n\nLia's eyes were green as moss, and she never looked away.\n\n${filler(11)}` },
  { id: 'c2', title: 'Underland', content: `${filler(2)}\n\nThe amulet hung from a nail above the door.\n\n${filler(12)}` },
  { id: 'c3', title: 'The Return', content: `${filler(3)}\n\nLia blinked her brown eyes at the light.\n\n${filler(13)}` },
  { id: 'c4', title: 'Chapter 4', content: filler(4) },
];
const claim: MemoryClaim = {
  key: 'a'.repeat(64), subject: 'Lia', kind: 'person', aliases: [], statement: 'Lia has green eyes.',
  quote: "Lia's eyes were green as moss, and she never looked away.", basis: 'stated', scope: '', related: [],
};
function memoryChapter(chapter: BookChapter, position: number, patch: Partial<MemoryChapter> = {}): MemoryChapter {
  return { id: chapter.id, title: chapter.title, position, revision: 'r', currentRevision: 'r', draftId: null,
    claims: chapter.id === 'c1' ? [claim] : [], entities: [], version: 6, writingKind: 'literary',
    analyzedAt: '2026-10-01', status: 'complete', overrides: {}, ...patch };
}
function memory(stale: string[] = []): ProjectMemory {
  return { profile: { enabled: true, register: 'auto', genre: '', guidance: '' },
    chapters: book.map((c, i) => memoryChapter(c, i, stale.includes(c.id) ? { currentRevision: 'edited' } : {})) };
}
const ask = (question: string, data = memory(), passage = '') =>
  focusedBookContext({ chapters: book, activeChapterId: 'c4', question, passage, memory: data });

describe('bookQuestionKind', () => {
  it('keeps craft questions and explicit whole-book asks on the full text', () => {
    expect(bookQuestionKind('Are Lia’s eyes the same colour everywhere?')).toBe('facts');
    expect(bookQuestionKind('How is the pacing across the book?')).toBe('craft');
    expect(bookQuestionKind('Does her character development land?')).toBe('craft');
    expect(bookQuestionKind('O ritmo do livro funciona?')).toBe('craft');
    expect(bookQuestionKind('Does the book ending make sense based on the other chapters? Any way to make it more of a twist?')).toBe('craft');
    expect(bookQuestionKind('Are there any plot holes?')).toBe('craft');
    expect(bookQuestionKind('O final faz sentido?')).toBe('craft');
    expect(bookQuestionKind('Read the whole book and check continuity')).toBe('asked');
    expect(bookQuestionKind('Verifique o livro inteiro')).toBe('asked');
  });
});

describe('referencedChapters', () => {
  const chapters = [{ id: 'a', title: 'Prologue', content: '' }, { id: 'b', title: 'Chapter 2: Underland', content: '' },
    { id: 'c', title: 'The Return', content: '' }, { id: 'd', title: 'Chapter 4', content: '' }];
  const refs = (question: string, active = 2) => referencedChapters(question, chapters, active);
  it('finds chapters by number, range, order, position and title', () => {
    expect(refs('In chapter 2, what did Kai say?')).toEqual([1]);
    expect(refs('Compare chapters 1-2')).toEqual([0, 1]);
    expect(refs('the first chapter')).toEqual([0]);
    expect(refs('the previous chapter')).toEqual([1]);
    expect(refs('the next chapter')).toEqual([3]);
    expect(refs('the last chapter')).toEqual([3]);
    expect(refs('Is it the same as in Underland?')).toEqual([1]);
    expect(refs('No capítulo anterior')).toEqual([1]);
    expect(refs('capítulo dois')).toEqual([1]);
  });
  it('leaves out the open chapter and words that are not chapter numbers', () => {
    expect(refs('chapter three')).toEqual([]);
    expect(refs('chapters about Kai')).toEqual([]);
  });
});

describe('focusedBookContext', () => {
  it('answers a fact question from memory and the paragraphs that mention it', () => {
    const context = ask("Are Lia's eyes the same colour everywhere?");
    expect(context.mode).toBe('focused');
    if (context.mode !== 'focused') return;
    expect(context.memory).toContain('green as moss');
    expect(context.chapters).toContain('brown eyes');
    expect(context.chapters).toContain('green as moss');
    expect(context.chapters).not.toContain('The wind moved over the hills (2-0)');
    expect(context.chapters).toContain('No paragraph mentions it in: "Underland"');
    expect(context.stats.chars).toBeLessThan(context.stats.fullChars * 0.2);
  });

  it('finds plain words too, and falls back when they appear nowhere', () => {
    const found = ask('Where did I mention the amulet?');
    expect(found.mode === 'focused' && found.chapters).toContain('The amulet hung');
    expect(ask('Where did I mention the lighthouse?')).toEqual({ mode: 'full', reason: 'nothingToSearch' });
    expect(ask('Where is the lantern festival?')).toEqual({ mode: 'full', reason: 'nothingToSearch' });
  });

  it('gives whole the chapters the question names and the ones memory has not read', () => {
    const named = ask('What does Lia see in chapter 2?');
    expect(named.mode === 'focused' && named.chapters).toContain('### Underland (full text)');
    const stale = ask("Are Lia's eyes the same colour everywhere?", memory(['c3']));
    expect(stale.mode === 'focused' && stale.chapters).toContain('### The Return (full text)');
    expect(stale.mode === 'focused' && stale.chapters).toContain('has not read their current text: "The Return"');
  });

  it('keeps the full text when focusing would not save much, or memory is off', () => {
    expect(ask("Are Lia's eyes the same colour everywhere?", memory(['c1', 'c2', 'c3']))).toEqual({ mode: 'full', reason: 'notWorthIt' });
    expect(ask('How is the pacing across the book?')).toEqual({ mode: 'full', reason: 'craft' });
    const off = memory(); off.profile!.enabled = false;
    expect(ask("Are Lia's eyes the same colour everywhere?", off)).toEqual({ mode: 'full', reason: 'noMemory' });
    const short = book.map(c => ({ ...c, content: c.content.slice(0, 2000) }));
    expect(focusedBookContext({ chapters: short, activeChapterId: 'c4', question: 'Where is Lia?', passage: '', memory: memory() }))
      .toEqual({ mode: 'full', reason: 'small' });
  });

  it('searches for the names in a selected passage', () => {
    const context = ask('Is this consistent with earlier chapters?', memory(), 'Lia looked up at the canopy.');
    expect(context.mode === 'focused' && context.chapters).toContain('brown eyes');
  });
});

describe('wholeBookText', () => {
  const chapters = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, title: `Chapter ${i + 1}`, content: `Text of chapter ${i + 1}. `.repeat(800) }));

  it('sends a book that fits as it is', () => {
    expect(wholeBookText(chapters.slice(0, 2))).toBe(chapters.slice(0, 2).map(c => `\n\n## ${c.title}\n${c.content}`).join(''));
  });

  it('keeps the opening and the ending of a long book and names what it left out', () => {
    const text = wholeBookText(chapters, 60_000);
    expect(text.length).toBeLessThanOrEqual(60_000);
    expect(text).toContain('## Chapter 1\n');
    expect(text).toContain('## Chapter 10\n');
    expect(text).toMatch(/Not loaded, because the book is too long to send whole: "Chapter \d+"/);
    expect(text).not.toContain('## Chapter 9\n');
  });
});
