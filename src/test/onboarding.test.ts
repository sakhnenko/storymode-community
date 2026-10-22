import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import ptBR from '@/i18n/locales/pt-BR.json';
import { PROJECT_KEYS } from '@/lib/waitlist-flow';
import { countWords } from '@/lib/chapter-stats';
import {
  documentKind,
  joinList,
  needsPasswordSetup,
  parseSetupEvents,
  passwordProblem,
  projectKeyForLabel,
  textToChapterHtml,
} from '@/lib/onboarding';

describe('textToChapterHtml', () => {
  it('treats each line as a paragraph when there are no blank lines, as when pasting from Word', () => {
    expect(textToChapterHtml('First paragraph.\nSecond paragraph.')).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  it('uses blank lines as paragraph breaks and joins wrapped lines, as in PDF text', () => {
    expect(textToChapterHtml('The night was\nlong and cold.\n\nMorning came.')).toBe(
      '<p>The night was long and cold.</p><p>Morning came.</p>',
    );
  });

  it('turns a short, unpunctuated opening line into the chapter heading', () => {
    expect(textToChapterHtml('Chapter One: The Long Dusk\nMira watched the sun sink.')).toBe(
      '<h2>Chapter One: The Long Dusk</h2><p>Mira watched the sun sink.</p>',
    );
    expect(textToChapterHtml('"Run," she said.\nThey ran.')).toBe('<p>"Run," she said.</p><p>They ran.</p>');
    expect(textToChapterHtml('Only a title')).toBe('<p>Only a title</p>');
  });

  it('escapes markup so pasted text stays text', () => {
    expect(textToChapterHtml('<script>alert(1)</script> & more')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>',
    );
  });

  it('normalizes Windows line endings and drops empty input', () => {
    expect(textToChapterHtml('One.\r\nTwo.')).toBe('<p>One.</p><p>Two.</p>');
    expect(textToChapterHtml('   \n  ')).toBe('');
  });
});

describe('documents', () => {
  it.each([
    ['Chapter 1.docx', 'docx'],
    ['draft.PDF', 'pdf'],
    ['notes.txt', 'text'],
    ['notes.md', 'text'],
    ['old.doc', null],
    ['cover.png', null],
  ])('recognizes %s as %s', (name, kind) => {
    expect(documentKind(name)).toBe(kind);
  });

  it('counts words across any whitespace', () => {
    expect(countWords('  The night\nwas  long.\t ')).toBe(4);
    expect(countWords('')).toBe(0);
  });
});

describe('projectKeyForLabel', () => {
  it('maps every English waitlist label back to its key, ignoring case', () => {
    for (const key of PROJECT_KEYS) {
      expect(projectKeyForLabel(en.waitlistChat.options.projects[key].toUpperCase())).toBe(key);
    }
  });

  it('returns null for typed-in projects and missing answers', () => {
    expect(projectKeyForLabel('A tabletop wargame')).toBeNull();
    expect(projectKeyForLabel(null)).toBeNull();
  });
});

describe('passwordProblem', () => {
  it('applies the set-password rules in order', () => {
    expect(passwordProblem('a1!')).toBe('minPassword');
    expect(passwordProblem('123456!')).toBe('mustContainLetter');
    expect(passwordProblem('abcdef!')).toBe('mustContainNumber');
    expect(passwordProblem('abcdef1')).toBe('mustContainSymbol');
    expect(passwordProblem('dusk-2026')).toBeNull();
  });
});

describe('needsPasswordSetup', () => {
  const invited = { invited_at: '2026-09-19T10:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };

  it('asks invited email accounts for a password until one is set', () => {
    expect(needsPasswordSetup(invited)).toBe(true);
    expect(needsPasswordSetup({ ...invited, user_metadata: { password_set: true } })).toBe(false);
  });

  it('never asks accounts that signed up themselves or use Google', () => {
    expect(needsPasswordSetup({ ...invited, invited_at: undefined })).toBe(false);
    expect(needsPasswordSetup({ ...invited, app_metadata: { provider: 'google' } })).toBe(false);
  });
});

describe('joinList', () => {
  it('joins with commas and a final conjunction', () => {
    expect(joinList([], 'and')).toBe('');
    expect(joinList(['Characters'], 'and')).toBe('Characters');
    expect(joinList(['Characters', 'Locations'], 'e')).toBe('Characters e Locations');
    expect(joinList(['Characters', 'Locations', 'Lore'], 'and')).toBe('Characters, Locations and Lore');
  });
});

describe('parseSetupEvents', () => {
  it('returns complete events and keeps a partial line for the next chunk', () => {
    const { events, rest } = parseSetupEvents('{"type":"project","title":"The Long Night"}\n{"type":"plan');
    expect(events).toEqual([{ type: 'project', title: 'The Long Night' }]);
    expect(rest).toBe('{"type":"plan');
  });

  it('skips blank and malformed lines', () => {
    const { events } = parseSetupEvents('\nnot json\n{"type":"done","projectId":"p1"}\n');
    expect(events).toEqual([{ type: 'done', projectId: 'p1' }]);
  });
});

describe('welcome chat locales', () => {
  function paths(tree: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(tree).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? paths(value as Record<string, unknown>, path)
        : [path];
    });
  }

  it('has the same strings in English and Portuguese', () => {
    expect(paths(ptBR.welcomeChat).sort()).toEqual(paths(en.welcomeChat).sort());
  });

  it('has a welcome line for every project type plus a default', () => {
    for (const key of [...PROJECT_KEYS, 'default'] as const) {
      expect(typeof en.welcomeChat.intro[key]).toBe('string');
      expect(typeof ptBR.welcomeChat.intro[key]).toBe('string');
    }
  });
});
