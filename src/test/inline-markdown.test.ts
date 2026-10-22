import { describe, expect, it } from 'vitest';
import { parseInlineMarkdown } from '@/lib/markdown';

describe('parseInlineMarkdown', () => {
  it('turns *text* and _text_ into italics without the markers', () => {
    expect(parseInlineMarkdown('Fantasy *and* sci-fi? _Love_ it.')).toEqual([
      { text: 'Fantasy ' },
      { text: 'and', italic: true },
      { text: ' sci-fi? ' },
      { text: 'Love', italic: true },
      { text: ' it.' },
    ]);
  });

  it('turns **text** and __text__ into bold', () => {
    expect(parseInlineMarkdown('A **bold** move, __truly__.')).toEqual([
      { text: 'A ' },
      { text: 'bold', bold: true },
      { text: ' move, ' },
      { text: 'truly', bold: true },
      { text: '.' },
    ]);
  });

  it('handles italics inside bold', () => {
    expect(parseInlineMarkdown('**a *very* big deal**')).toEqual([
      { text: 'a ', bold: true },
      { text: 'very', bold: true, italic: true },
      { text: ' big deal', bold: true },
    ]);
  });

  it('leaves arithmetic, snake_case and unmatched markers alone', () => {
    expect(parseInlineMarkdown('3 * 4 * 5')).toEqual([{ text: '3 * 4 * 5' }]);
    expect(parseInlineMarkdown('my_chapter_1.docx')).toEqual([{ text: 'my_chapter_1.docx' }]);
    expect(parseInlineMarkdown('A lone *star')).toEqual([{ text: 'A lone *star' }]);
  });

  it('keeps a list marker and line breaks', () => {
    expect(parseInlineMarkdown('1. Pick *one*')).toEqual([{ text: '1. ' }, { text: 'Pick ' }, { text: 'one', italic: true }]);
    expect(parseInlineMarkdown('Line one\nLine two')).toEqual([{ text: 'Line one' }, { text: '\n' }, { text: 'Line two' }]);
  });

  it('returns nothing for empty text', () => {
    expect(parseInlineMarkdown('')).toEqual([]);
  });
});
