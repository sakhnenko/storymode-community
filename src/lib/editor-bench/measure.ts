import { USD_PER_CREDIT, estimateTokens, usdForTokens } from '../../../supabase/functions/_shared/ai-cost.ts';
import { buildEditorPrompt, editorModel, planEditorRequest, type ContextMode, type EditorSpeed } from '../../../supabase/functions/story-chat/editor-request.ts';
import { BENCH_CHAPTERS, BENCH_FOLIOS, benchMemory, chapterById } from './fixture.ts';
import { reviewContext, userMessage, type BenchKind, type BenchScenario } from './scenarios.ts';

export const SPEEDS: EditorSpeed[] = ['fast', 'thoughtful', 'creative'];
export const MODES: ContextMode[] = ['text', 'memory'];

/** What one request sends, measured offline from the exact production prompt. */
export interface PromptMeasure {
  id: string;
  kind: BenchKind;
  speed: EditorSpeed;
  mode: ContextMode;
  scope: string;
  /** How the context was built: selection, chapter, book-full or book-focused. */
  context: string;
  reason?: string;
  model: string;
  inputTokens: number;
  /** Credits for the input alone, before rounding; output comes on top. */
  inputCredits: number;
}

export const measureKey = (m: Pick<PromptMeasure, 'id' | 'speed' | 'mode'>) => `${m.id}|${m.speed}|${m.mode}`;

/** The request the editor would send for a scenario, built with production code. */
export function benchRequest(scenario: BenchScenario, speed: EditorSpeed, mode: ContextMode) {
  const messages = [{ role: 'user', content: userMessage(scenario) }];
  const plan = planEditorRequest({ messages, hasSelection: !!scenario.selection, prefab: scenario.prefab,
    reviewMetadata: scenario.prefab === 'editorial-review' || undefined, speed });
  const chapter = chapterById(scenario.chapterId);
  const { systemPrompt, contextMetadata } = buildEditorPrompt({
    plan, aiLanguage: 'en', prefab: scenario.prefab,
    // Like story-chat: a selection only loads its own chapter.
    chapters: plan.scope === 'selection' ? [chapter] : BENCH_CHAPTERS,
    activeChapterId: chapter.id, activeChapterTitle: chapter.title, reviewContext: reviewContext(scenario),
    folios: BENCH_FOLIOS, memory: benchMemory(), focusAllowed: false, contextMode: mode, today: '2026-10-01',
  });
  return { plan, messages, systemPrompt, contextMetadata, model: editorModel(plan.speed, false) };
}

export function measurePrompt(scenario: BenchScenario, speed: EditorSpeed, mode: ContextMode): PromptMeasure {
  const { plan, messages, systemPrompt, contextMetadata, model } = benchRequest(scenario, speed, mode);
  // The same estimate story-chat bills by when the provider reports no usage.
  const inputTokens = estimateTokens(systemPrompt + messages.map(m => m.content).join(''));
  return {
    id: scenario.id, kind: scenario.kind, speed, mode, scope: plan.scope, model, inputTokens,
    context: String(contextMetadata.context),
    ...(contextMetadata.context_reason ? { reason: String(contextMetadata.context_reason) } : {}),
    inputCredits: Math.round((usdForTokens(model, inputTokens, 0) / USD_PER_CREDIT) * 100) / 100,
  };
}

/** A Markdown table comparing the text-only and memory editors for each request. */
export function promptReport(measures: PromptMeasure[]) {
  const byKey = new Map(measures.map(m => [measureKey(m), m]));
  const rows = measures.filter(m => m.mode === 'text').map(text => {
    const memory = byKey.get(measureKey({ ...text, mode: 'memory' }))!;
    const change = Math.round(((memory.inputTokens - text.inputTokens) / text.inputTokens) * 100);
    return `| ${text.id} | ${text.speed} | ${text.model.replace(/^.*\//, '')} | ${memory.context}${memory.reason ? ` (${memory.reason})` : ''} | ${text.inputTokens.toLocaleString('en')} | ${memory.inputTokens.toLocaleString('en')} | ${change > 0 ? '+' : ''}${change}% | ${text.inputCredits} | ${memory.inputCredits} |`;
  });
  return ['| Question | Speed | Model | Memory context | Text tokens | Memory tokens | Change | Text credits | Memory credits |',
    '|---|---|---|---|---:|---:|---:|---:|---:|', ...rows].join('\n');
}
