import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '@/components/Markdown';
import { splitBodyIntoItems } from '@/lib/story-chat-items';

const html = (content: string, quotes = false) =>
  renderToStaticMarkup(<Markdown content={content} onQuoteClick={quotes ? () => {} : undefined} />);

describe('AI editor answers', () => {
  it('renders bold, italic and lists the same way everywhere', () => {
    expect(html('In the supplied *Homecoming* excerpt, **the lights** stay on.'))
      .toBe('<div><p>In the supplied <em>Homecoming</em> excerpt, <strong>the lights</strong> stay on.</p></div>');
    expect(html('Groundwork:\n\n- The glass grows.\n- Mirrors connect places.'))
      .toBe('<div><p>Groundwork:</p>\n<ul>\n<li>The glass grows.</li>\n<li>Mirrors connect places.</li>\n</ul></div>');
  });

  it('highlights quoted passages where a click can jump to them, also inside italics and lists', () => {
    const out = html('- The line *"which for once was silent"* lands.', true);
    expect(out).toContain('<li>The line <em><span role="button"');
    expect(out).toContain('“which for once was silent”');
    expect(html('The line "which for once was silent" lands.')).not.toContain('role="button"');
  });

  it('keeps a list as one comment, even spaced out, and the quote apart from the comment on it', () => {
    const items = splitBodyIntoItems([
      '> That night Harwood lit every lantern.',
      'In the supplied *Homecoming* excerpt, the lights read as celebration.',
      '',
      'This has groundwork:',
      '',
      '- The glass grows.',
      '',
      '- Mirrors connect places.',
      '',
      '> Try: That night Harwood lit every lantern, and kept them lit.',
    ].join('\n'));
    expect(items.map(i => [i.type, i.text])).toEqual([
      ['quote', 'That night Harwood lit every lantern.'],
      ['text', 'In the supplied *Homecoming* excerpt, the lights read as celebration.'],
      ['text', 'This has groundwork:'],
      ['text', '- The glass grows.\n- Mirrors connect places.'],
      ['suggestion', 'Try: That night Harwood lit every lantern, and kept them lit.'],
    ]);
  });
});
