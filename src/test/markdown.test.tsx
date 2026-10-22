import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '@/components/Markdown';

const html = (node: JSX.Element) => renderToStaticMarkup(node);

describe('Markdown', () => {
  it('turns "[ ]" and task items into checkboxes in notebooks, in text order', () => {
    const out = html(<Markdown variant="notebook" content={'[ ] buy glass\n\n- [x] map the mines\n- [ ] ask Vic'} onContentChange={() => {}} />);
    const boxes: string[] = out.match(/<input[^>]*>/g) ?? [];
    expect(boxes).toHaveLength(3);
    expect(boxes.map(b => b.includes('checked'))).toEqual([false, true, false]);
    expect(boxes.every(b => !b.includes('disabled'))).toBe(true);
  });

  it('disables checkboxes in read-only notes and leaves "[ ]" alone in chat', () => {
    expect(html(<Markdown variant="notebook" content="[x] done" readOnly />)).toMatch(/<input[^>]*disabled/);
    expect(html(<Markdown content="[ ] not a box" />)).not.toContain('<input');
  });

  it('keeps single line breaks and colours notebook links', () => {
    const out = html(<Markdown variant="notebook" content={'one\ntwo [site](https://example.com)'} />);
    expect(out).toContain('<br/>');
    expect(out).toContain('--notepad-link');
    expect(html(<Markdown content="[site](https://example.com)" />)).not.toContain('--notepad-link');
  });
});
