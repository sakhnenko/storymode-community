import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { paragraphize } from '@/lib/paragraphize';

describe('paragraphize', () => {
  it('gives each plain line its own paragraph', () => {
    expect(paragraphize('One idea\nAnother idea')).toBe('One idea\n\nAnother idea');
  });

  it('keeps lines joined by a hard break together, so no stray backslash shows', () => {
    const note = "**Arcadia** - Olive's mom\\\n**Rostov** - Hermit of the Kalissa mountains\\\n**Olivier** - Mad scientist";
    expect(paragraphize(note)).toBe(note);
    const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkBreaks] }, paragraphize(note)));
    expect(html).not.toContain('\\');
    expect(html.match(/<br\s*\/?>/g)).toHaveLength(2);
  });

  it('treats two trailing spaces as a hard break too', () => {
    expect(paragraphize('Line one  \nLine two')).toBe('Line one  \nLine two');
  });
});
