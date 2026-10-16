import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { textToChapterHtml } from '@/lib/onboarding';
import { PROJECT_KEYS } from '@/lib/waitlist-flow';
import {
  MAX_NOTEBOOKS_PER_FOLIO,
  emojiOr,
  firstHeading,
  htmlToMarkdown,
  normalizePlan,
  sanitizeChapterHtml,
  writingProfileFor,
} from '../../supabase/functions/onboarding-setup/plan';
import { fallbackFolios, fallbackProjectIcon } from '../../supabase/functions/onboarding-setup/templates';

describe('sanitizeChapterHtml', () => {
  it('keeps basic formatting and strips attributes', () => {
    expect(sanitizeChapterHtml('<p class="MsoNormal" style="x">She <em>ran</em>.</p>')).toBe('<p>She <em>ran</em>.</p>');
  });

  it('removes scripts, styles and event handlers entirely', () => {
    const dirty = '<p onclick="steal()">Hi</p><script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)>';
    expect(sanitizeChapterHtml(dirty)).toBe('<p>Hi</p>');
  });

  it('drops unknown tags but keeps their text', () => {
    expect(sanitizeChapterHtml('<div><span>Night fell.</span></div>')).toBe('Night fell.');
  });

  it('normalizes self-closing line breaks', () => {
    expect(sanitizeChapterHtml('<p>One<br/>Two</p>')).toBe('<p>One<br>Two</p>');
  });
});

describe('htmlToMarkdown', () => {
  // The Story editor parses chapters with markdown-it (via tiptap-markdown) using these options.
  const editor = new MarkdownIt({ html: false, linkify: true, breaks: true });

  it('stores chapters as Markdown paragraphs, headings and emphasis', () => {
    expect(
      htmlToMarkdown('<h2>Chapter One</h2><p>The horizon was <em>dreadful</em> on fire.</p><p>A <strong>week</strong> later.</p>'),
    ).toBe('## Chapter One\n\nThe horizon was *dreadful* on fire.\n\nA **week** later.');
  });

  it('renders in the editor as formatting, never as literal tags', () => {
    const html = sanitizeChapterHtml(
      textToChapterHtml("The Long Night's End\nThe horizon was on fire. Embers at the Long Night's end.\nA week, and then the whole of Harwood Camp will be torn down."),
    );
    expect(editor.render(htmlToMarkdown(html))).toBe(
      "<h2>The Long Night's End</h2>\n<p>The horizon was on fire. Embers at the Long Night's end.</p>\n<p>A week, and then the whole of Harwood Camp will be torn down.</p>\n",
    );
  });

  it('keeps dialogue dashes and numbers as prose, not lists', () => {
    const markdown = htmlToMarkdown('<p>- Olá, disse ela.</p><p>1. Not a list either.</p><p># Not a heading</p>');
    expect(editor.render(markdown)).toBe('<p>- Olá, disse ela.</p>\n<p>1. Not a list either.</p>\n<p># Not a heading</p>\n');
  });

  it('decodes entities and keeps angle brackets as text', () => {
    const markdown = htmlToMarkdown('<p>Fish &amp; chips &lt;3 &quot;yes&quot;</p>');
    expect(markdown).toBe('Fish & chips <3 "yes"');
    expect(editor.render(markdown)).toBe('<p>Fish &amp; chips &lt;3 &quot;yes&quot;</p>\n');
  });

  it('converts line breaks, lists, quotes and rules from Word documents', () => {
    expect(
      htmlToMarkdown('<p>One<br>Two</p><ul><li>Salt</li><li><em>Iron</em></li></ul><ol><li>First</li><li>Second</li></ol><blockquote><p>Quoted</p></blockquote><hr><p>End</p>'),
    ).toBe('One\nTwo\n\n- Salt\n- *Iron*\n\n1. First\n2. Second\n\n> Quoted\n\n---\n\nEnd');
  });

  it('keeps spaces outside emphasis markers so they still apply, and drops empty ones', () => {
    expect(htmlToMarkdown('<p>a<em> word </em>here<strong></strong></p>')).toBe('a *word* here');
  });
});

describe('firstHeading', () => {
  it('uses the first heading as the chapter title', () => {
    expect(firstHeading('<h1>Chapter 1: <em>The Long Dusk</em></h1><p>Text</p>')).toBe('Chapter 1: The Long Dusk');
    expect(firstHeading('<p>No heading here</p>')).toBe('');
  });
});

describe('emojiOr', () => {
  it('accepts a single emoji, including multi-part ones', () => {
    expect(emojiOr('🌗', '📁')).toBe('🌗');
    expect(emojiOr('🧙‍♀️ wizard', '📁')).toBe('🧙‍♀️');
  });

  it('falls back for text or empty values', () => {
    expect(emojiOr('Characters', '📁')).toBe('📁');
    expect(emojiOr(undefined, '📝')).toBe('📝');
  });
});

describe('normalizePlan', () => {
  it('trims to the folio limit and drops empty folios and untitled notebooks', () => {
    const plan = normalizePlan(
      {
        projectIcon: '🌗',
        chapterTitle: '  The Long Dusk ',
        folios: [
          { title: 'Characters', icon: '👤', notebooks: [{ title: 'Mira', icon: '🌙', content: '- Night-born' }, { title: '' }] },
          { title: 'Empty', icon: '📁', notebooks: [] },
          { title: 'Locations', icon: 'not an emoji', notebooks: [{ title: 'The Dayside', content: '' }] },
          { title: 'Lore', notebooks: [{ title: 'The Turning' }] },
        ],
      },
      2,
    );
    expect(plan).toEqual({
      projectIcon: '🌗',
      chapterTitle: 'The Long Dusk',
      writingType: '',
      genre: '',
      folios: [
        { title: 'Characters', icon: '👤', notebooks: [{ title: 'Mira', icon: '🌙', content: '- Night-born' }] },
        { title: 'Locations', icon: '📁', notebooks: [{ title: 'The Dayside', icon: '📝', content: '' }] },
      ],
    });
  });

  it('caps notebooks per folio', () => {
    const notebooks = Array.from({ length: 20 }, (_, i) => ({ title: `N${i}` }));
    const plan = normalizePlan({ folios: [{ title: 'Characters', notebooks }] }, 3);
    expect(plan?.folios[0].notebooks).toHaveLength(MAX_NOTEBOOKS_PER_FOLIO);
  });

  it('accepts near-miss field names from the model', () => {
    const plan = normalizePlan(
      { folders: [{ name: 'Personagens', emoji: '👤', notes: [{ name: 'Mira', description: '- Ouve mentiras' }] }] },
      3,
    );
    expect(plan?.folios).toEqual([
      { title: 'Personagens', icon: '👤', notebooks: [{ title: 'Mira', icon: '📝', content: '- Ouve mentiras' }] },
    ]);
  });

  it('leaves the project icon empty when the model gave none, so a fallback can apply', () => {
    expect(normalizePlan({ folios: [{ title: 'Characters', notebooks: [{ title: 'Mira' }] }] }, 3)?.projectIcon).toBe('');
  });

  it('returns null when nothing usable came back', () => {
    expect(normalizePlan({ folios: [] }, 3)).toBeNull();
    expect(normalizePlan('nonsense', 3)).toBeNull();
  });

  it('keeps a known writing type and the genre, and drops an unknown type', () => {
    const folios = [{ title: 'Characters', notebooks: [{ title: 'Mira' }] }];
    expect(normalizePlan({ writingType: ' Script ', genre: ' Crime drama ', folios }, 3)).toMatchObject({
      writingType: 'script',
      genre: 'Crime drama',
    });
    expect(normalizePlan({ writingType: 'poetry', folios }, 3)?.writingType).toBe('');
  });
});

describe('writingProfileFor', () => {
  const plan = normalizePlan({ folios: [{ title: 'Characters', notebooks: [{ title: 'Mira' }] }] }, 3)!;

  it("prefers the model's reading of the project", () => {
    expect(writingProfileFor({ ...plan, writingType: 'script', genre: 'Cooking videos' }, 'novel', 'Fantasy')).toEqual({
      register: 'script',
      genre: 'Cooking videos',
    });
  });

  it('falls back to what the project type implies, with picked genres as the genre', () => {
    expect(writingProfileFor(null, 'screenplay', 'TV series')).toEqual({ register: 'script', genre: '' });
    expect(writingProfileFor(plan, 'novel', 'Fantasy, Romance')).toEqual({ register: 'literary', genre: 'Fantasy, Romance' });
    expect(writingProfileFor(null, 'nonfiction', 'Memoir')).toEqual({ register: 'nonfiction', genre: 'Memoir' });
    expect(writingProfileFor(null, 'rpg', 'D&D 5e')).toEqual({ register: 'worldbuilding', genre: '' });
  });

  it('leaves a typed-in project type to adapt to the writing', () => {
    expect(writingProfileFor(null, null, 'YouTube cooking scripts')).toEqual({ register: 'auto', genre: '' });
  });

  it('knows every onboarding project type', () => {
    for (const key of PROJECT_KEYS) expect(writingProfileFor(null, key, '').register).not.toBe('auto');
  });
});

describe('fallbackProjectIcon', () => {
  it('picks an icon by project type, with a writing hand otherwise', () => {
    expect(fallbackProjectIcon('rpg')).toBe('🎲');
    expect(fallbackProjectIcon('novel')).toBe('📖');
    expect(fallbackProjectIcon(null)).toBe('✍️');
    expect(fallbackProjectIcon('unknown')).toBe('✍️');
  });
});

describe('fallbackFolios', () => {
  it.each(['en', 'pt-BR'] as const)('gives every project type three starter folios in %s', (lang) => {
    for (const key of [...PROJECT_KEYS, null]) {
      const folios = fallbackFolios(key, lang);
      expect(folios).toHaveLength(3);
      for (const folio of folios) {
        expect(folio.title).toBeTruthy();
        expect(folio.notebooks.length).toBeGreaterThan(0);
        for (const notebook of folio.notebooks) {
          expect(notebook.title).toBeTruthy();
          expect(notebook.content).toBeTruthy();
        }
      }
    }
  });

  it('localizes titles', () => {
    expect(fallbackFolios('novel', 'en')[0].title).toBe('Characters');
    expect(fallbackFolios('novel', 'pt-BR')[0].title).toBe('Personagens');
  });
});
