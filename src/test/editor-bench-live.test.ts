import { afterEach, describe, expect, it, vi } from 'vitest';
import { BENCH_CHAPTERS } from '@/lib/editor-bench/fixture';
import { estimateCredits, planRun, regressions, runBenchmark, summarize, type LiveResult } from '@/lib/editor-bench/live';
import { SCENARIOS } from '@/lib/editor-bench/scenarios';
import { editorModel } from '../../supabase/functions/story-chat/editor-request';

const result = (patch: Partial<LiveResult>): LiveResult => ({
  key: 'book-eyes|thoughtful|memory', id: 'book-eyes', kind: 'book', speed: 'thoughtful', mode: 'memory', repeat: 0, status: 200,
  firstTextMs: 1_000, totalMs: 5_000, answerChars: 900, failedChecks: [], inputTokens: 10_000, outputTokens: 1_000, credits: 3,
  context: 'book-focused', ...patch,
});

describe('planRun', () => {
  it('asks each chosen question at each speed, text then memory, for every repeat', () => {
    const plan = planRun({ speeds: ['fast', 'thoughtful'], modes: ['text', 'memory'], kinds: ['book'], repeat: 2 });
    const books = SCENARIOS.filter(s => s.kind === 'book').length;
    expect(plan).toHaveLength(books * 2 * 2 * 2);
    expect(plan.slice(0, 4).map(p => `${p.key}#${p.repeat}`)).toEqual([
      'book-eyes|fast|text#0', 'book-eyes|fast|memory#0', 'book-eyes|fast|text#1', 'book-eyes|fast|memory#1',
    ]);
  });

  it('narrows to named questions', () => {
    expect(planRun({ speeds: ['fast'], modes: ['memory'], kinds: ['passage', 'book'], only: ['book-age'], repeat: 1 }).map(p => p.key))
      .toEqual(['book-age|fast|memory']);
  });
});

describe('estimateCredits', () => {
  it('costs more for more requests and slower speeds', () => {
    const one = estimateCredits(planRun({ speeds: ['thoughtful'], modes: ['memory'], kinds: ['book'], only: ['book-eyes'], repeat: 1 }));
    const creative = estimateCredits(planRun({ speeds: ['creative'], modes: ['memory'], kinds: ['book'], only: ['book-eyes'], repeat: 1 }));
    expect(one).toBeGreaterThan(0);
    expect(creative).toBeGreaterThan(one);
    expect(estimateCredits(planRun({ speeds: ['thoughtful'], modes: ['memory'], kinds: ['book'], only: ['book-eyes'], repeat: 3 }))).toBe(one * 3);
  });
});

describe('summarize and regressions', () => {
  it('takes medians over repeats and fails a request when any repeat failed', () => {
    const summary = summarize([
      result({ repeat: 0, inputTokens: 9_000, firstTextMs: 900 }),
      result({ repeat: 1, inputTokens: 10_000, firstTextMs: 5_000, failedChecks: ['/brown/i'] }),
      result({ repeat: 2, inputTokens: 11_000, firstTextMs: 1_100 }),
    ]);
    expect(summary['book-eyes|thoughtful|memory']).toMatchObject({ inputTokens: 10_000, firstTextMs: 1_100, passed: false, context: 'book-focused' });
  });

  it('flags more tokens or credits, a much slower start, and checks that stopped passing', () => {
    const baseline = summarize([result({})]);
    expect(regressions(summarize([result({ inputTokens: 10_500, credits: 4, firstTextMs: 2_400 })]), baseline)).toEqual([]);
    expect(regressions(summarize([result({ inputTokens: 12_000, credits: 6, firstTextMs: 4_000, failedChecks: ['/green/i'] })]), baseline)
      .map(r => r.what)).toEqual(['inputTokens', 'credits', 'firstTextMs', 'checks']);
  });
});

describe('runBenchmark', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The deployed app, as far as the runner sees it: one answer per request, then the ledger. */
  function backend(answers: string[]) {
    const tags: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.includes('/rest/v1/projects')) return json([{ id: 'p1' }]);
      if (url.includes('/rest/v1/story_chapters')) return json(BENCH_CHAPTERS.map(c => ({ id: `db-${c.id}`, title: c.title })));
      if (url.includes('/functions/v1/story-chat')) {
        tags.push(JSON.parse(String(init.body)).benchTag);
        const text = answers[tags.length - 1];
        const events = [...(text ? [{ choices: [{ delta: { content: text } }] }] : []), { choices: [{ delta: {}, finish_reason: text ? 'stop' : 'content_filter' }] }];
        return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200 });
      }
      if (url.includes('/rest/v1/credit_ledger')) {
        return json(tags.map(bench => ({ delta: -3, metadata: { bench, input_tokens: 10_000, output_tokens: 500, context: 'book-focused', model: 'm' } })));
      }
      throw new Error(`unexpected ${url}`);
    });
  }
  const conn = { url: 'https://example.test', key: 'k', userId: 'u', token: async () => 't' };
  const plan = planRun({ speeds: ['thoughtful'], modes: ['text', 'memory'], kinds: ['book'], only: ['book-eyes'], repeat: 1 });

  it('checks each answer and matches its charge by tag', async () => {
    backend(["---\nGreen in one chapter, brown in another.", '---\nGreen, and later brown.']);
    const { results, summary } = await runBenchmark(conn, plan, { chargeDelayMs: 0 });
    expect(results.map(r => [r.key, r.failedChecks, r.credits, r.inputTokens])).toEqual([
      ['book-eyes|thoughtful|text', [], 3, 10_000], ['book-eyes|thoughtful|memory', [], 3, 10_000],
    ]);
    expect(summary['book-eyes|thoughtful|memory'].passed).toBe(true);
  });

  it('fails an answer that streams no text, saying why', async () => {
    backend(['---\nGreen, then brown.', '']);
    const { results, summary } = await runBenchmark(conn, plan, { chargeDelayMs: 0 });
    expect(results[1]).toMatchObject({ error: 'empty answer (content_filter)', finishReason: 'content_filter' });
    expect(summary['book-eyes|thoughtful|memory'].passed).toBe(false);
  });
});

describe('editorModel', () => {
  it('puts every question of a speed on one model in the current tiers', () => {
    expect(['fast', 'thoughtful', 'creative'].map(speed => editorModel(speed as 'fast', false))).toEqual([
      'google/gemini-2.5-flash', 'google/gemini-3.6-flash', 'openai/gpt-6-astra']);
    expect(editorModel('thoughtful', false, { narrowToSelection: true })).toBe('google/gemini-3.6-flash');
  });

  it('keeps the earlier tiers for everyone the flag does not include yet, and BYOK as it was', () => {
    expect(editorModel('fast', false, { tiers: 'earlier' })).toBe('google/gemini-3.6-flash');
    expect(editorModel('thoughtful', false, { tiers: 'earlier', narrowToSelection: true })).toBe('openai/gpt-5.5');
    expect(editorModel('thoughtful', false, { tiers: 'earlier' })).toBe('google/gemini-2.5-flash');
    expect([editorModel('fast', true), editorModel('creative', true)]).toEqual(['openai/gpt-5-mini', 'openai/gpt-5']);
  });
});

describe('cached input', () => {
  it('never costs more than fresh input, and the full rate until the gateway is known to discount it', async () => {
    const { creditsForUsage, CACHED_INPUT_SHARE } = await import('../../supabase/functions/_shared/ai-cost');
    const fresh = creditsForUsage({ model: 'google/gemini-3.6-flash', inputTokens: 20_000, outputTokens: 1_000 });
    const cached = creditsForUsage({ model: 'google/gemini-3.6-flash', inputTokens: 20_000, cachedInputTokens: 15_000, outputTokens: 1_000 });
    expect(cached).toBeLessThanOrEqual(fresh);
    if (CACHED_INPUT_SHARE === 1) expect(cached).toBe(fresh);
  });
});
