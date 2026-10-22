import { describe, expect, it } from 'vitest';
import { isMemoryCurrent, memorySourceText, parseMemoryReply, validateMemoryExtraction,
  MEMORY_EXTRACTION_PROMPT, type MemoryClaim, type MemoryChapter, type ProjectMemory } from '../../supabase/functions/_shared/project-memory';
import { buildProjectMemoryContext } from '../../supabase/functions/_shared/memory-graph';

const source = '<p>Kai lost his left eye during the winter battle.</p><p>Mara believed that Kai was dead.</p>';
const raw = { subject: 'Kai', kind: 'person', statement: 'Kai loses his left eye in the winter battle.',
  quote: 'Kai lost his left eye during the winter battle.', basis: 'stated', scope: 'During the winter battle', aliases: [], related: [] };
const claim: MemoryClaim = { ...raw, kind: 'person', basis: 'stated', key: 'a'.repeat(64) };
function chapter(patch: Partial<MemoryChapter> = {}): MemoryChapter {
  return { id: 'ch1', title: 'The winter battle', position: 0, revision: 'r1', currentRevision: 'r1',
    draftId: 'draft1', claims: [claim], writingKind: 'literary', analyzedAt: '2026-09-28', status: 'complete', overrides: {}, ...patch };
}
function memory(chapters = [chapter()]): ProjectMemory {
  return { profile: { enabled: true, register: 'auto', genre: '', guidance: '' }, chapters };
}

describe('project memory extraction', () => {
  it('accepts exact evidence and preserves time and attribution', async () => {
    const output = await validateMemoryExtraction({ writingKind: 'literary', claims: [raw,
      { ...raw, subject: 'Mara', statement: 'Mara believes Kai is dead, without confirmation.', quote: 'Mara believed that Kai was dead.', basis: 'reported' },
    ] }, source);
    expect(output.claims).toHaveLength(2);
    expect(output.claims[0].scope).toBe('During the winter battle');
    expect(output.claims[1].basis).toBe('reported');
    expect(output.claims[0].key).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects fabricated and tiny quotes without discarding valid claims', async () => {
    const output = await validateMemoryExtraction({ claims: [raw,
      { ...raw, quote: 'Kai never lost his left eye during the winter battle.' },
      { ...raw, quote: 'Kai' },
    ] }, source);
    expect(output.claims).toHaveLength(1);
    expect(output.rejected).toBe(2);
  });
  it('does not publish a malformed or entirely unsupported result', async () => {
    await expect(validateMemoryExtraction({}, source)).rejects.toThrow();
    await expect(validateMemoryExtraction({ claims: [{ ...raw, basis: 'verified' }] }, source)).rejects.toThrow();
    await expect(validateMemoryExtraction({ claims: [{ ...raw, kind: 'secret' }] }, source)).rejects.toThrow();
  });
  it('allows an honest empty extraction without claiming a writing type', async () => {
    expect(await validateMemoryExtraction({ claims: [] }, source)).toEqual({ entities: [], claims: [], writingKind: 'general', genre: '', rejected: 0 });
  });
  it('keeps the detected kind of writing and genre', async () => {
    const output = await validateMemoryExtraction({ writingKind: 'script', genre: '  Crime drama ', claims: [] }, source);
    expect(output).toMatchObject({ writingKind: 'script', genre: 'Crime drama' });
    expect((await validateMemoryExtraction({ writingKind: 'poetry', claims: [] }, source)).writingKind).toBe('general');
  });
  it('deduplicates evidence, retaining stable keys across model paraphrases', async () => {
    const a = await validateMemoryExtraction({ claims: [raw, raw] }, source);
    const b = await validateMemoryExtraction({ claims: [{ ...raw, statement: 'His left eye was lost during the winter battle.' }] }, source);
    expect(a.claims).toHaveLength(1);
    expect(a.claims[0].key).toBe(b.claims[0].key);
  });
  it('keeps distinct source evidence separate even for same-name characters', async () => {
    const other = 'Kai works as the town doctor and has both eyes.';
    const output = await validateMemoryExtraction({ claims: [raw,
      { ...raw, quote: other, statement: 'A town doctor named Kai has both eyes.' },
    ] }, source + other);
    expect(output.claims[0].key).not.toBe(output.claims[1].key);
  });
  it('normalizes HTML and whitespace consistently', async () => {
    expect(memorySourceText('<p>A &amp; B</p><p>Next<br>line</p>')).toBe('A & B Next line');
    const output = await validateMemoryExtraction({ claims: [{ ...raw, quote: 'Kai lost his left eye\n during the winter battle.' }] }, source);
    expect(output.claims).toHaveLength(1);
  });
  it('requires generative, source-only extraction with reported beliefs', () => {
    expect(MEMORY_EXTRACTION_PROMPT).toContain('Do not invent');
    expect(MEMORY_EXTRACTION_PROMPT).toContain('WHO believes/says');
    expect(MEMORY_EXTRACTION_PROMPT).toContain('Chapter order is not necessarily chronological');
    expect(MEMORY_EXTRACTION_PROMPT).toContain('including its ending');
  });
});

describe('project memory retrieval', () => {
  it('uses cited unconfirmed facts automatically and exposes scope', () => {
    const prompt = buildProjectMemoryContext(memory(), 'What happened to Kai?', 'ch1');
    expect(prompt).toContain('extracted-unconfirmed');
    expect(prompt).toContain(raw.quote);
    expect(prompt).toContain('During the winter battle');
    expect(prompt).toContain('Sources used');
    expect(prompt).toContain('1 of 1');
  });
  it('excludes stale and missing revisions, including source deletions/empty drafts', () => {
    expect(isMemoryCurrent(chapter({ revision: null }))).toBe(false);
    const prompt = buildProjectMemoryContext(memory([chapter({ currentRevision: 'empty-draft' })]), 'Kai');
    expect(prompt).not.toContain(raw.quote);
    expect(prompt).toContain('0 of 1');
  });
  it('keeps corrections distinct from source evidence, and excludes rejected facts', () => {
    const overrides: MemoryChapter['overrides'] = { [claim.key]: { disposition: 'corrected', correction: 'The author intends a right-eye injury.' } };
    const prompt = buildProjectMemoryContext(memory([chapter({ overrides })]), 'Kai');
    expect(prompt).toContain('authorCorrection');
    expect(prompt).toContain(raw.quote);
    const excluded = buildProjectMemoryContext(memory([chapter({ overrides: { [claim.key]: { disposition: 'excluded', correction: '' } } })]), 'Kai');
    expect(excluded).not.toContain(raw.quote);
  });
  it('does not alter context for projects that opt out', () => {
    const data = memory(); data.profile!.enabled = false;
    expect(buildProjectMemoryContext(data, 'Kai')).toBe('');
    expect(buildProjectMemoryContext({ ...data, profile: null }, 'Kai')).toBe('');
  });
  it('retrieves related/alias matches and respects a hard output budget', () => {
    const data = memory([chapter({ claims: [{ ...claim, aliases: ['The wanderer'] }] })]);
    expect(buildProjectMemoryContext(data, 'The wanderer')).toContain(raw.quote);
    expect(buildProjectMemoryContext(data, 'Completely unrelated')).not.toContain(raw.quote);
    expect(buildProjectMemoryContext(data, 'Kai', undefined, 1800).length).toBeLessThanOrEqual(1800);
  });
  it('preserves conflicting claims as separate, attributed source records', () => {
    const data = memory([chapter(), chapter({ id: 'ch2', title: 'A different report', position: 1,
      claims: [{ ...claim, statement: 'Mara believes Kai still has both eyes.', basis: 'reported' }] })]);
    const prompt = buildProjectMemoryContext(data, 'Kai');
    expect(prompt).toContain('A different report');
    expect(prompt).toContain('The winter battle');
    expect(prompt).toContain('Surface conflicts');
    expect(prompt).toContain('"basis":"reported"');
  });
});

describe('memory reply recovery', () => {
  it('keeps the first 40 claims instead of rejecting an overlong reply', async () => {
    const result = await validateMemoryExtraction({ claims: Array(45).fill(raw) }, source);
    expect(result.claims).toHaveLength(1);
  });
  it('accepts near-miss kinds such as building', async () => {
    const result = await validateMemoryExtraction({ claims: [{ ...raw, kind: 'Building' }] }, source);
    expect(result.claims[0].kind).toBe('place');
  });
  it('salvages valid claims when one quote breaks the JSON', () => {
    const good = JSON.stringify(raw);
    const broken = '{"subject":"Mara","kind":"person","statement":"x","quote":"He said “Phew...”,\n"basis":"stated"}';
    const reply = `{"writingKind":"literary","claims":[${good},${broken},${good}]}`;
    const parsed = parseMemoryReply(reply);
    expect(parsed?.claims).toHaveLength(2);
    expect(parsed?.writingKind).toBe('literary');
  });
});
