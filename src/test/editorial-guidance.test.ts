import { describe, expect, it } from 'vitest';
import {
  EDITORIAL_REGISTER_GUIDANCE,
  editorialReviewGuidance,
  formatReviewContext,
} from '../../supabase/functions/story-chat/editorial-guidance';
import { EDITORIAL_REVIEW_REQUEST, editorialReviewRequest, readEditorialMetadata, visibleEditorialRequest } from '../lib/editorial-review-request';

describe('AI Editor review guidance', () => {
  it('cleans the old automatic request without rewriting custom questions', () => {
    expect(visibleEditorialRequest('Review this passage as a literary, academic, or technical editor, whichever fits the writing.'))
      .toBe(EDITORIAL_REVIEW_REQUEST.en);
    const custom = 'Compare literary, academic, or technical editing approaches.';
    expect(visibleEditorialRequest(custom)).toBe(custom);
  });

  it('waits for a complete classification line even when tokens split mid-word', () => {
    const prefix = '[editor] academic\r\n';
    for (let end = 1; end < prefix.length; end++) {
      expect(readEditorialMetadata(prefix.slice(0, end)).kind).toBeUndefined();
    }
    const response = '[status] Checking the argument\n---\n**Clarity**\nThe definition is precise.';
    const parsed = readEditorialMetadata(prefix + response);
    expect(parsed.kind).toBe('academic');
    expect(parsed.content).toBe(response);
    expect(editorialReviewRequest('en', parsed.kind)).toBe('Review this passage as an academic editor.');
    expect(editorialReviewRequest('pt-BR', parsed.kind)).toBe('Revise esta passagem como editor acadêmico.');
  });

  it('falls back to a neutral request for old responses or unrecognized classifications', () => {
    const oldResponse = '[status] Reading the scene\n---\n**Story**\nThe scene moves well.';
    expect(readEditorialMetadata(oldResponse)).toEqual({ content: oldResponse });
    const unknown = readEditorialMetadata('[editor] unexpected\n' + oldResponse);
    expect(unknown.kind).toBeUndefined();
    expect(unknown.content).toBe(oldResponse);
    expect(editorialReviewRequest('en', unknown.kind)).toBe(EDITORIAL_REVIEW_REQUEST.en);
    expect(editorialReviewRequest('en', 'general')).toBe(EDITORIAL_REVIEW_REQUEST.en);
  });

  it('strips terminal metadata without touching similar text inside an answer', () => {
    expect(readEditorialMetadata('[editor] technical', true)).toEqual({ kind: 'technical', content: '' });
    const answer = '**Corrections**\nThe literal tag is:\n[editor] literary\n';
    expect(readEditorialMetadata(answer, true)).toEqual({ content: answer });
  });

  it('requires a narrative sensory assessment without forcing extra detail', () => {
    const guidance = editorialReviewGuidance('en');
    expect(guidance).toContain('**Sensory**');
    expect(guidance).toContain('keep the established Continuity, Story, What is working, Corrections, Worth considering, and Imagery sections');
    expect(guidance).toContain('add **Sensory** as its own section');
    expect(guidance).toContain('viewpoint character');
    expect(guidance).toContain('If no change is justified');
    expect(guidance).toContain('Do not require all five senses');
  });

  it('protects academic terminology and avoids narrative advice', () => {
    expect(EDITORIAL_REGISTER_GUIDANCE).toContain('Infer the register from the selected passage');
    expect(EDITORIAL_REGISTER_GUIDANCE).toContain('Preserve correct discipline-specific terms');
    expect(EDITORIAL_REGISTER_GUIDANCE).toContain('Do not suggest story beats, sensory embellishment');
    expect(editorialReviewGuidance('en')).toContain('do not force Story, Imagery, or Sensory sections');
  });

  it('provides the same review distinction in Portuguese', () => {
    const guidance = editorialReviewGuidance('pt-BR');
    expect(guidance).toContain('**Sensorial**');
    expect(guidance).toContain('mantenha as seções habituais');
    expect(guidance).toContain('texto técnico ou acadêmico');
    expect(guidance).toContain('não troque termos corretos por sinônimos');
  });

  it('bounds nearby text and keeps it out of the review target', () => {
    const context = formatReviewContext({ before: `prefix${'a'.repeat(600)}`, after: `${'b'.repeat(600)}suffix` });
    expect(context).not.toContain('prefix');
    expect(context).not.toContain('suffix');
    expect(context).toContain('register context only');
    expect(context).toContain('only the selected passage above is under review');
    expect(formatReviewContext(null)).toBe('');
  });

  it('includes bounded chapter context when only the selected passage would otherwise be sent', () => {
    const context = formatReviewContext(undefined, `${'x'.repeat(6000)}do not include this suffix`);
    expect(context).toContain('Chapter sample:');
    expect(context).toContain('x'.repeat(6000));
    expect(context).not.toContain('do not include this suffix');
    expect(context).toContain('only the selected passage above is under review');
  });
});
