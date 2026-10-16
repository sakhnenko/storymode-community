import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en.json';
import ptBR from '@/i18n/locales/pt-BR.json';
import {
  AI_REPLY_STEPS,
  DETAIL_CHIPS,
  OWN_KEY_ANSWERS,
  PROJECT_KEYS,
  STEP_ORDER,
  TOTAL_STEPS,
  aiReplyPayload,
  emptyAnswers,
  joinParts,
  nextStep,
  stepInputs,
  stepNumber,
  submissionPayload,
  uiLanguageForTyped,
  wantsAiReply,
} from '@/lib/waitlist-flow';

const locales = { en: en.waitlistChat, 'pt-BR': ptBR.waitlistChat } as const;

function lookup(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
}

describe('waitlist step order', () => {
  it('asks for language first and email last', () => {
    expect(STEP_ORDER[0]).toBe('language');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('email');
    expect(nextStep('email')).toBeNull();
  });

  it('numbers every step for the progress indicator', () => {
    expect(STEP_ORDER.map(stepNumber)).toEqual(Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1));
  });

  it('only lets AI write replies about the project', () => {
    expect([...AI_REPLY_STEPS].sort()).toEqual(['premise', 'project', 'project_detail']);
  });

  it('saves AI replies for answers typed in the visitor\'s own words', () => {
    expect(wantsAiReply('project', 'A tabletop wargame')).toBe(true);
    expect(wantsAiReply('project_detail', 'a mix of fantasy and sci-fi')).toBe(true);
    expect(wantsAiReply('project', '')).toBe(false);
    expect(wantsAiReply('project_detail', '   ')).toBe(false);
    expect(wantsAiReply('name', 'Ana')).toBe(false);
  });
});

describe('step inputs', () => {
  it('offers chips plus free text for known project follow-ups', () => {
    expect(stepInputs('project_detail', 'rpg')).toEqual({ chips: true, text: true, skippable: false });
  });

  it('falls back to skippable free text when the project was typed in', () => {
    expect(stepInputs('project_detail', null)).toEqual({ chips: false, text: true, skippable: true });
  });

  it('has no free text for the API key question', () => {
    expect(stepInputs('own_key', null).text).toBe(false);
  });
});

describe('typed-in languages', () => {
  it.each([
    ['English', 'en'],
    ['inglês', 'en'],
    ['Português', 'pt-BR'],
    ['portuguese (Brazil)', 'pt-BR'],
    ['pt-br', 'pt-BR'],
    ['Russian', null],
    ['Español', null],
  ])('maps %s to %s', (typed, expected) => {
    expect(uiLanguageForTyped(typed)).toBe(expected);
  });
});

describe('payloads', () => {
  const answers = {
    ...emptyAnswers('pt-BR'),
    writingLanguage: 'Portuguese',
    name: '  Ana  ',
    projectKey: 'novel' as const,
    projectType: 'A novel or book',
    projectDetail: joinParts(['Fantasy', ' ', 'Romance']),
    premise: 'A detective who can hear lies',
    ownKey: 'unsure' as const,
    email: ' Ana@Example.com ',
  };

  it('stores the chosen interface language and project answers on signup', () => {
    expect(submissionPayload(answers)).toEqual({
      email: 'ana@example.com',
      source: 'waitlist-chat',
      name: 'Ana',
      writing_about: 'A detective who can hear lies',
      writing_language: 'Portuguese',
      has_own_openai_key: false,
      ui_language: 'pt-BR',
      project_type: 'A novel or book',
      project_detail: 'Fantasy, Romance',
    });
  });

  it('never sends the name or email to the AI reply endpoint', () => {
    const payload = aiReplyPayload('premise', answers);
    expect(JSON.stringify(payload)).not.toContain('Ana');
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('example.com');
    expect(payload.language).toBe('pt-BR');
  });
});

describe('locale coverage', () => {
  it.each(Object.keys(locales))('%s has every option label and reply the flow uses', (lng) => {
    const tree = locales[lng as keyof typeof locales];
    const required = [
      ...PROJECT_KEYS.flatMap((k) => [
        `options.projects.${k}`,
        `replies.project.${k}`,
        `questions.detail.${k}.title`,
        `questions.detail.${k}.why`,
      ]),
      ...PROJECT_KEYS.flatMap((k) => DETAIL_CHIPS[k].ids.map((id) => `options.${DETAIL_CHIPS[k].group}.${id}`)),
      ...OWN_KEY_ANSWERS.flatMap((k) => [`options.ownKey.${k}`, `replies.ownKey.${k}`]),
      ...STEP_ORDER.filter((s) => s !== 'project_detail').flatMap((s) => [`questions.${s}.title`, `questions.${s}.why`]),
      'questions.detail.custom.title',
    ];
    const missing = required.filter((path) => typeof lookup(tree, path) !== 'string');
    expect(missing).toEqual([]);
  });

  it.each(Object.keys(locales))('%s has variants for replies to typed-in answers', (lng) => {
    const tree = locales[lng as keyof typeof locales];
    for (const path of ['replies.customProject', 'replies.customDetail', 'replies.premise']) {
      const lines = lookup(tree, path);
      expect(Array.isArray(lines) && lines.length > 1 && lines.every((l) => typeof l === 'string')).toBe(true);
    }
    expect((lookup(tree, 'replies.customProject') as string[]).every((l) => l.includes('{{project}}'))).toBe(true);
    expect((lookup(tree, 'replies.customDetail') as string[]).every((l) => l.includes('{{detail}}'))).toBe(true);
  });
});
