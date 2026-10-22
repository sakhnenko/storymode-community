import { describe, expect, it } from 'vitest';
import { blocksToText, markdownBlocks, type Block } from '@/lib/markdown';
import { chapterText } from '@/lib/story-export';

const text = (block: Block) => ('runs' in block ? block.runs.map(r => r.text).join('') : block.kind);

describe('markdownBlocks', () => {
  it('reads headings, paragraphs, quotes and rules', () => {
    const blocks = markdownBlocks('## The Treetops\n\nThe kettle sang.\n\n> Not yet.\n\n---');
    expect(blocks.map(b => [b.kind, text(b)])).toEqual([
      ['heading', 'The Treetops'], ['paragraph', 'The kettle sang.'], ['quote', 'Not yet.'], ['hr', 'hr'],
    ]);
  });

  it('keeps bold and italic, including nested, and drops link targets', () => {
    const [block] = markdownBlocks('A ***very*** **bold _and slanted_** [map](https://example.com).');
    expect('runs' in block && block.runs).toEqual([
      { text: 'A ', bold: false, italic: false },
      { text: 'very', bold: true, italic: true },
      { text: ' ', bold: false, italic: false },
      { text: 'bold ', bold: true, italic: false },
      { text: 'and slanted', bold: true, italic: true },
      { text: ' ', bold: false, italic: false },
      { text: 'map', bold: false, italic: false },
      { text: '.', bold: false, italic: false },
    ]);
  });

  it('keeps single line breaks, as the screens do', () => {
    const [block] = markdownBlocks("**Arcadia** - Olive's mom\\\n**Rostov** - Hermit\nOlivier");
    expect(text(block)).toBe("Arcadia - Olive's mom\nRostov - Hermit\nOlivier");
  });

  it('numbers ordered lists from their start, nests lists and marks tasks', () => {
    const blocks = markdownBlocks('3. Salt\n4. Iron\n   - Rust\n\n- [x] Map the mines\n- [ ] Ask Vic');
    expect(blocks.map(b => b.kind === 'list' && [b.marker, b.depth, text(b)])).toEqual([
      ['3.', 0, 'Salt'], ['4.', 0, 'Iron'], ['•', 1, 'Rust'], ['•', 0, '☑ Map the mines'], ['•', 0, '☐ Ask Vic'],
    ]);
  });
});

describe('plain text export', () => {
  it('separates paragraphs, keeps list items together and line breaks', () => {
    expect(blocksToText(markdownBlocks('# One\n\nFirst line\nsecond line\n\n- a\n- b\n\nEnd'))).toBe(
      'One\n\nFirst line\nsecond line\n\n- a\n- b\n\nEnd');
  });

  it('leaves no stray backslashes from editor line breaks', () => {
    expect(chapterText('Line one\\\nLine two\n\\\nAfter a blank')).toBe('Line one\nLine two\n\nAfter a blank');
  });
});

describe('word counts', () => {
  it('counts words the same for the editor header, the Info tab and onboarding', async () => {
    const { countWords, computeChapterStats } = await import('@/lib/chapter-stats');
    const md = "## Chapter one\n\nNão — she said, **well-known** and _calm_.\n\n- 3 lanterns\n- [x] done";
    // What the editor shows as text: no marks, no list markers.
    const editorText = "Chapter one\n\nNão — she said, well-known and calm.\n\n3 lanterns\n\ndone";
    expect(countWords(editorText)).toBe(11);
    expect(computeChapterStats(md).words).toBe(countWords(editorText));
  });
});
