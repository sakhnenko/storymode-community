import { USD_PER_CREDIT, priceFor } from '../../../supabase/functions/_shared/ai-cost.ts';
import type { ContextMode, EditorSpeed } from '../../../supabase/functions/story-chat/editor-request.ts';
import { BENCH_CHAPTERS, BENCH_FOLIOS } from './fixture.ts';
import { measureKey, measurePrompt } from './measure.ts';
import { SCENARIOS, failedChecks, reviewContext, userMessage, type BenchKind, type BenchScenario } from './scenarios.ts';

// Running the AI editor benchmark against the deployed app, shared by the
// admin page and scripts/editor-bench-live.ts: the fixture project, the
// requests, what they were charged, and the runs kept for comparison.
// Plain fetch calls, so it works the same in the browser and in Node.

export const BENCH_PROJECT_TITLE = 'Editor benchmark: The Glass Hollows';
export const KINDS: BenchKind[] = ['passage', 'chapter', 'book'];
/** Typical output tokens per answer, reasoning included, from the first live run; for estimates only. */
const OUTPUT_GUESS: Record<EditorSpeed, number> = { fast: 600, thoughtful: 1_400, creative: 1_000 };

export interface BenchConnection {
  url: string;
  key: string;
  userId: string;
  /** A current access token for an admin. */
  token: () => Promise<string>;
}

export interface RunOptions {
  speeds: EditorSpeed[];
  modes: ContextMode[];
  kinds: BenchKind[];
  /** Question ids; all of the chosen kinds when empty. */
  only?: string[];
  repeat: number;
}

export interface PlannedRequest {
  scenario: BenchScenario;
  speed: EditorSpeed;
  mode: ContextMode;
  repeat: number;
  /** question|speed|mode */
  key: string;
}

export interface LiveResult {
  key: string;
  id: string;
  kind: BenchKind;
  speed: EditorSpeed;
  mode: ContextMode;
  repeat: number;
  status: number;
  /** Milliseconds from sending to the first answer text, as the browser sees it. */
  firstTextMs: number | null;
  totalMs: number;
  answerChars: number;
  failedChecks: string[];
  error?: string;
  /** Why the answer stream ended, as the provider said. */
  finishReason?: string;
  // From the charge, once recorded.
  inputTokens?: number;
  outputTokens?: number;
  credits?: number;
  context?: string;
  reason?: string;
  model?: string;
}

/** Per question, speed and mode: medians over repeats, and whether every repeat passed its checks. */
export type RunSummary = Record<string, {
  context?: string;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  firstTextMs: number;
  totalMs: number;
  passed: boolean;
}>;

export interface BenchRun {
  id: string;
  created_at: string;
  options: RunOptions;
  results: LiveResult[];
  summary: RunSummary;
  is_baseline: boolean;
}

export function planRun(options: RunOptions): PlannedRequest[] {
  const scenarios = SCENARIOS.filter(s => options.kinds.includes(s.kind) && (!options.only?.length || options.only.includes(s.id)));
  return scenarios.flatMap(scenario => options.speeds.flatMap(speed => Array.from({ length: options.repeat }, (_, repeat) =>
    options.modes.map(mode => ({ scenario, speed, mode, repeat, key: measureKey({ id: scenario.id, speed, mode }) }))).flat()));
}

/** Rough credits for a plan: the measured input of each request and a typical answer. */
export function estimateCredits(plan: PlannedRequest[]) {
  return plan.reduce((total, { scenario, speed, mode }) => {
    const measure = measurePrompt(scenario, speed, mode);
    const price = priceFor(measure.model);
    return total + Math.ceil((measure.inputTokens * price.in + OUTPUT_GUESS[speed] * price.out) / 1_000_000 / USD_PER_CREDIT);
  }, 0);
}

async function call<T>(conn: BenchConnection, path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const response = await fetch(`${conn.url}/${path}`, {
    method: init.method || (init.body === undefined ? 'GET' : 'POST'),
    headers: { apikey: conn.key, Authorization: `Bearer ${await conn.token()}`, 'Content-Type': 'application/json',
      Prefer: init.prefer || 'return=representation' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 300);
    try { const body = JSON.parse(text); message = body.message || body.error || message; } catch { /* not JSON */ }
    throw new Error(`${path.split('?')[0]}: ${message || response.status}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Stops before any credits are spent if the account or the deployed app can't run the benchmark. */
export async function checkReady(conn: BenchConnection) {
  const roles = await call<unknown[]>(conn, `rest/v1/user_roles?select=role&user_id=eq.${conn.userId}&role=eq.admin`);
  if (!roles.length) throw new Error('This account is not an admin; only admins can run the benchmark.');
  const flags = await call<unknown[]>(conn, 'rest/v1/feature_flags?select=key&key=eq.memory_book_context');
  if (!flags.length) {
    throw new Error('The deployed app does not have the benchmark yet: deploy the memory-first editor (PR #31) with its migrations, then try again.');
  }
}

export async function findProject(conn: BenchConnection) {
  const rows = await call<{ id: string }[]>(conn, `rest/v1/projects?select=id&title=eq.${encodeURIComponent(BENCH_PROJECT_TITLE)}`);
  return rows[0]?.id as string | undefined;
}

/** Fixture chapter id to the project's chapter id. */
export async function chapterIds(conn: BenchConnection, projectId: string) {
  const rows = await call<{ id: string; title: string }[]>(conn, `rest/v1/story_chapters?select=id,title&project_id=eq.${projectId}`);
  return new Map(BENCH_CHAPTERS.map(c => [c.id, rows.find(r => r.title === c.title)?.id]));
}

/** Creates the fixture project with its chapters and folios, and turns its project memory on. */
export async function createProject(conn: BenchConnection) {
  const { userId } = conn;
  const [project] = await call<{ id: string }[]>(conn, 'rest/v1/projects',
    { body: { user_id: userId, title: BENCH_PROJECT_TITLE, icon: '🧪', position: 9999, ai_language: 'en' } });
  await call(conn, 'rest/v1/story_chapters', {
    body: BENCH_CHAPTERS.map((c, position) => ({ user_id: userId, project_id: project.id, title: c.title, position, content: c.content })),
    prefer: 'return=minimal',
  });
  for (const [position, folio] of BENCH_FOLIOS.entries()) {
    const [grid] = await call<{ id: string }[]>(conn, 'rest/v1/notebook_grids',
      { body: { user_id: userId, project_id: project.id, title: folio.title, icon: '📁', position } });
    await call(conn, 'rest/v1/notepads', {
      body: folio.notes.map((n, i) => ({ user_id: userId, grid_id: grid.id, title: n.title, icon: '📝', content: n.content,
        theme: 'cream', font: 'inter', col_index: i % 3, row_index: Math.floor(i / 3), height: 260 })),
      prefer: 'return=minimal',
    });
  }
  await call(conn, 'rest/v1/project_writing_profiles', {
    body: { project_id: project.id, enabled: true, register: 'literary', genre: 'Fantasy', guidance: '' },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  return project.id;
}

/** How many of the project's chapters project memory has read in their current form. */
export async function codexStatus(conn: BenchConnection, projectId: string) {
  const memory = await call<{ chapters?: { revision: string | null; currentRevision: string }[] } | null>(
    conn, 'rest/v1/rpc/read_project_memory', { body: { _project_id: projectId } });
  const chapters = memory?.chapters || [];
  return { read: chapters.filter(c => c.revision && c.revision === c.currentRevision).length, total: chapters.length };
}

/** Reads one chapter into the Codex; about 10 credits unless it is already current. */
export async function readChapter(conn: BenchConnection, projectId: string, chapterId: string) {
  const response = await fetch(`${conn.url}/functions/v1/project-memory`, {
    method: 'POST',
    headers: { apikey: conn.key, Authorization: `Bearer ${await conn.token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, chapterId, acceptUsage: true }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, cached: !!body.cached, count: body.count as number | undefined, error: body.error as string | undefined };
}

/** One editor request as the browser sends it, timing what the author would see. */
async function askEditor(conn: BenchConnection, projectId: string, ids: Map<string, string | undefined>, item: PlannedRequest,
  tag: string, signal?: AbortSignal) {
  const { scenario, speed, mode } = item;
  const chapter = BENCH_CHAPTERS.find(c => c.id === scenario.chapterId)!;
  const started = Date.now();
  let firstTextMs: number | null = null;
  let answer = '';
  let finishReason: string | undefined;
  let streamError: string | undefined;
  try {
    const response = await fetch(`${conn.url}/functions/v1/story-chat`, {
      method: 'POST', signal,
      headers: { apikey: conn.key, Authorization: `Bearer ${await conn.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId, messages: [{ role: 'user', content: userMessage(scenario) }],
        activeChapterId: ids.get(chapter.id), activeChapterTitle: chapter.title, hasSelection: !!scenario.selection,
        prefab: scenario.prefab, reviewContext: reviewContext(scenario), reviewMetadata: scenario.prefab === 'editorial-review' || undefined,
        aiLanguage: 'en', speed, contextMode: mode, benchTag: tag,
      }),
    });
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      return { status: response.status, firstTextMs, totalMs: Date.now() - started, answer, finishReason, error: String(body.error || response.statusText) };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
        try {
          const event = JSON.parse(line.slice(5));
          const delta = event.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            firstTextMs ??= Date.now() - started;
            answer += delta;
          }
          if (typeof event.choices?.[0]?.finish_reason === 'string') finishReason = event.choices[0].finish_reason;
          if (event.error) streamError = String(event.error.message ?? event.error);
        } catch { /* a partial or foreign event line */ }
      }
    }
    // A stream that ends without text is a failed answer, whatever its status.
    const empty = answer.trim() ? undefined : `empty answer${finishReason ? ` (${finishReason})` : ''}${streamError ? `: ${streamError}` : ''}`;
    return { status: response.status, firstTextMs, totalMs: Date.now() - started, answer, finishReason, error: empty };
  } catch (error) {
    return { status: 0, firstTextMs, totalMs: Date.now() - started, answer, finishReason,
      error: signal?.aborted ? 'stopped' : error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Sends a plan one request at a time (so timings don't compete), then reads
 * what each was charged from the credit ledger by its benchmark tag.
 */
export async function runBenchmark(conn: BenchConnection, plan: PlannedRequest[],
  { onResult, signal, chargeDelayMs = 5_000 }: {
    onResult?: (result: LiveResult, index: number) => void;
    signal?: AbortSignal;
    /** How long to wait for the last charge to be recorded. */
    chargeDelayMs?: number;
  } = {}) {
  const projectId = await findProject(conn);
  if (!projectId) throw new Error('There is no benchmark project yet: set it up first.');
  const ids = await chapterIds(conn, projectId);
  // Short, because the editor keeps 80 characters of a benchmark tag.
  const runId = `b${Date.now().toString(36)}`;
  const results: LiveResult[] = [];
  for (const [index, item] of plan.entries()) {
    if (signal?.aborted) break;
    const outcome = await askEditor(conn, projectId, ids, item, `${runId}|${item.key}|${item.repeat}`, signal);
    const result: LiveResult = {
      key: item.key, id: item.scenario.id, kind: item.scenario.kind, speed: item.speed, mode: item.mode, repeat: item.repeat,
      status: outcome.status, firstTextMs: outcome.firstTextMs, totalMs: outcome.totalMs, answerChars: outcome.answer.length,
      failedChecks: outcome.error ? [] : failedChecks(item.scenario, outcome.answer), ...(outcome.error ? { error: outcome.error } : {}),
      ...(outcome.finishReason ? { finishReason: outcome.finishReason } : {}),
    };
    results.push(result);
    onResult?.(result, index);
    if (outcome.status === 403) throw new Error('The editor refused the benchmark options: the account must be an admin.');
  }
  // Charges are recorded as each answer finishes; give the last one a moment.
  await new Promise(resolve => setTimeout(resolve, chargeDelayMs));
  const charges = await call<{ delta: number; metadata: Record<string, unknown> }[]>(conn,
    `rest/v1/credit_ledger?select=delta,metadata&metadata->>bench=like.${encodeURIComponent(`${runId}*`)}`);
  for (const charge of charges) {
    // Tags are run|question|speed|mode|repeat.
    const parts = String(charge.metadata.bench).split('|');
    const result = results.find(r => r.key === parts.slice(1, 4).join('|') && String(r.repeat) === parts[4]);
    if (!result) continue;
    Object.assign(result, {
      inputTokens: Number(charge.metadata.input_tokens), outputTokens: Number(charge.metadata.output_tokens), credits: -charge.delta,
      context: String(charge.metadata.context), model: String(charge.metadata.model),
      ...(charge.metadata.context_reason ? { reason: String(charge.metadata.context_reason) } : {}),
    });
  }
  return { results, summary: summarize(results) };
}

const median = (values: (number | null | undefined)[]) => {
  const sorted = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};

export function summarize(results: LiveResult[]): RunSummary {
  const groups = new Map<string, LiveResult[]>();
  for (const r of results) groups.set(r.key, [...(groups.get(r.key) || []), r]);
  return Object.fromEntries([...groups].map(([key, rs]) => [key, {
    context: rs.find(r => r.context)?.context,
    inputTokens: median(rs.map(r => r.inputTokens)),
    outputTokens: median(rs.map(r => r.outputTokens)),
    credits: median(rs.map(r => r.credits)),
    firstTextMs: median(rs.map(r => r.firstTextMs)),
    totalMs: median(rs.map(r => r.totalMs)),
    passed: rs.every(r => !r.error && !r.failedChecks.length),
  }]));
}

export interface Regression { key: string; what: 'inputTokens' | 'credits' | 'firstTextMs' | 'checks'; before: number; after: number }

/** Requests worse than the baseline: more tokens or credits, much slower to start, or a check that used to pass. */
export function regressions(summary: RunSummary, baseline: RunSummary): Regression[] {
  const found: Regression[] = [];
  for (const [key, now] of Object.entries(summary)) {
    const before = baseline[key];
    if (!before) continue;
    if (now.inputTokens > before.inputTokens * 1.1) found.push({ key, what: 'inputTokens', before: before.inputTokens, after: now.inputTokens });
    if (now.credits > before.credits * 1.15 + 1) found.push({ key, what: 'credits', before: before.credits, after: now.credits });
    if (now.firstTextMs > before.firstTextMs * 1.5 + 2_000) found.push({ key, what: 'firstTextMs', before: before.firstTextMs, after: now.firstTextMs });
    if (before.passed && !now.passed) found.push({ key, what: 'checks', before: 1, after: 0 });
  }
  return found;
}

/** One row of real editor usage (admin_editor_usage): a speed, kind of question, model and tiers. */
export interface UsageRow {
  speed: string | null;
  context: string | null;
  model: string | null;
  tiers: string;
  answers: number;
  writers: number;
  credits: number;
  median_credits: number;
  median_input_tokens: number | null;
  median_output_tokens: number | null;
  median_first_text_ms: number | null;
  p95_first_text_ms: number | null;
  empty_answers: number;
  cached_share: number | null;
}

/** Real editor answers over the last `days`, benchmark runs left out. Admins only. */
export async function editorUsage(conn: BenchConnection, days: number) {
  return call<UsageRow[]>(conn, 'rest/v1/rpc/admin_editor_usage', { body: { _days: days } });
}

export async function saveRun(conn: BenchConnection, run: Pick<BenchRun, 'options' | 'results' | 'summary'>) {
  const [saved] = await call<BenchRun[]>(conn, 'rest/v1/ai_editor_bench_runs', { body: run });
  return saved;
}

export async function listRuns(conn: BenchConnection, limit = 20) {
  return call<BenchRun[]>(conn, `rest/v1/ai_editor_bench_runs?select=*&order=created_at.desc&limit=${limit}`);
}

export async function baselineRun(conn: BenchConnection) {
  const rows = await call<BenchRun[]>(conn, 'rest/v1/ai_editor_bench_runs?select=*&is_baseline=is.true');
  return rows[0];
}

/** Makes a run the one later runs are compared with. */
export async function setBaseline(conn: BenchConnection, id: string) {
  await call(conn, 'rest/v1/ai_editor_bench_runs?is_baseline=is.true', { method: 'PATCH', body: { is_baseline: false }, prefer: 'return=minimal' });
  await call(conn, `rest/v1/ai_editor_bench_runs?id=eq.${id}`, { method: 'PATCH', body: { is_baseline: true }, prefer: 'return=minimal' });
}
