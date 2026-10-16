import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, MapTrifold, SpinnerGap, Warning } from '@/components/ui/icons';
import { computeChapterStats } from '@/lib/chapter-stats';
import { ChapterExportSection } from './ChapterExportSection';
import { ChapterMapOutlineModal, type MapRelationshipTestResult } from './ChapterMapOutlineModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/function-error';
import { CHAPTER_MAP_OUTLINE_FLAG, useFeatureAccess } from '@/hooks/useFeatureAccess';
import { SELF_HOSTED } from '@/lib/self-hosted';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  chapterId?: string;
  title: string;
  content: string;
  updatedAt?: string;
}

type Scope = 'chapter' | 'story';
interface StoryChapter { id: string; title: string; content: string }


function StatLabel({ label, info }: { label: string; info?: string }) {
  return (
    <div className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.18em]">
      <span className="opacity-40">{label}</span>
      {info && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="-my-1 inline-flex h-5 w-5 items-center justify-center rounded-full opacity-45 transition-colors hover:bg-foreground/10 hover:opacity-90 focus-visible:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
              aria-label={label}
            >
              <Info weight="bold" className="h-3 w-3" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-72 normal-case tracking-normal font-sans text-xs leading-relaxed">
            {info}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function Stat({ label, value, hint, info }: { label: string; value: React.ReactNode; hint?: string; info?: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-[hsl(var(--notepad-fg,var(--foreground))/0.055)]"
      style={{ background: 'hsl(var(--notepad-fg, var(--foreground)) / 0.035)' }}
    >
      <StatLabel label={label} info={info} />
      <span className="text-base font-medium leading-tight tabular-nums">{value}</span>
      {hint && <span className="text-[10px] opacity-40 mt-0.5">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-[0.22em] font-mono opacity-35 mb-2 px-1">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function ScopeToggle({ scope, onChange }: { scope: Scope; onChange: (scope: Scope) => void }) {
  const { t } = useTranslation();
  const option = (id: Scope, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={scope === id}
      onClick={() => onChange(id)}
      className={cn(
        'h-7 flex-1 rounded-md text-[11px] font-mono uppercase tracking-[0.12em] transition-colors',
        scope === id ? 'bg-[hsl(var(--notepad-fg,var(--foreground))/0.1)]' : 'opacity-50 hover:opacity-80',
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" className="mb-4 flex gap-1 rounded-lg bg-[hsl(var(--notepad-fg,var(--foreground))/0.04)] p-0.5">
      {option('chapter', t('story.export.thisChapter'))}
      {option('story', t('story.export.wholeStory'))}
    </div>
  );
}

function ChapterInfoPanelInner({ projectId, chapterId, title, content, updatedAt }: Props) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>('chapter');
  const [projectTitle, setProjectTitle] = useState('');
  const [storyChapters, setStoryChapters] = useState<StoryChapter[] | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const [mapTest, setMapTest] = useState<MapRelationshipTestResult | null>(null);
  const [mapTestLoading, setMapTestLoading] = useState(false);
  const [mapTestError, setMapTestError] = useState('');
  const [mapTestOpen, setMapTestOpen] = useState(false);
  // The outline runs on Jev, which only Lovable's AI gateway has; self-hosted
  // installs use OpenRouter, so the button could only fail there.
  const mapOutlineFlag = useFeatureAccess(CHAPTER_MAP_OUTLINE_FLAG);
  const canUseMapOutline = mapOutlineFlag && !SELF_HOSTED;

  useEffect(() => {
    let cancelled = false;
    void supabase.from('projects').select('title').eq('id', projectId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setProjectTitle(data?.title || ''); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Other chapters come from the database once per switch to the whole story;
  // the open chapter's live text replaces its saved copy below.
  useEffect(() => {
    if (scope !== 'story') return;
    let cancelled = false;
    setStoryChapters(null);
    void supabase.from('story_chapters').select('id, title, content').eq('project_id', projectId)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setStoryChapters((data || []).map(c => ({ id: c.id, title: c.title || '', content: c.content || '' })));
      });
    return () => { cancelled = true; };
  }, [scope, projectId]);

  const wholeStory = useMemo(
    () => storyChapters?.map(c => (c.id === chapterId ? { ...c, title, content } : c)) ?? null,
    [storyChapters, chapterId, title, content],
  );

  useEffect(() => {
    setMapTest(null);
    setMapTestError('');
    setMapTestLoading(false);
    setMapTestOpen(false);
  }, [chapterId]);

  useEffect(() => {
    const isInsideEditor = (node: Node | null): boolean => {
      let el: Node | null = node;
      while (el) {
        if (el instanceof HTMLElement) {
          if (
            el.matches?.('.ProseMirror, .notepad-content, [contenteditable="true"]') ||
            el.closest?.('.ProseMirror, .notepad-content, [contenteditable="true"]')
          ) {
            return true;
          }
        }
        el = el.parentNode;
      }
      return false;
    };
    const onSelect = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionText('');
        return;
      }
      const range = sel.getRangeAt(0);
      if (!isInsideEditor(range.commonAncestorContainer)) {
        setSelectionText('');
        return;
      }
      const text = sel.toString();
      setSelectionText(text.trim().length > 0 ? text : '');
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  const isStory = scope === 'story';
  const isSelection = !isStory && selectionText.length > 0;
  const source = isStory
    ? (wholeStory ?? []).map(c => c.content).join('\n\n')
    : isSelection ? selectionText : (content || '');
  const stats = useMemo(() => computeChapterStats(source), [source]);
  const updatedLabel = useMemo(() => {
    if (!updatedAt) return null;
    try { return new Date(updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return null; }
  }, [updatedAt]);

  const runMapRelationshipTest = async () => {
    if (!canUseMapOutline || !chapterId || mapTestLoading) return;
    setMapTestLoading(true);
    setMapTestError('');
    try {
      const { data, error } = await supabase.functions.invoke('ai-scene-map-plan', {
        body: {
          action: 'relationships',
          projectId,
          chapterId,
          chapterContent: content,
        },
      });
      if (error) {
        throw new Error(await functionErrorMessage(error, t('story.mapRelationshipTest.failed')));
      }
      const response = (data || {}) as { error?: string; relationshipTest?: MapRelationshipTestResult };
      if (response.error) throw new Error(response.error);
      if (!response.relationshipTest) throw new Error(t('story.mapRelationshipTest.failed'));
      setMapTest(response.relationshipTest);
      setMapTestOpen(true);
    } catch (error) {
      setMapTestError(error instanceof Error && error.message ? error.message : t('story.mapRelationshipTest.failed'));
    } finally {
      setMapTestLoading(false);
    }
  };

  if (!title && !content) {
    return <div className="p-4 text-xs text-muted-foreground">{t('story.selectChapterForInfo')}</div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="h-full overflow-y-auto p-4 text-sm">
      <ScopeToggle scope={scope} onChange={setScope} />
      <div className="mb-4 px-1">
        <div className="text-base font-medium truncate" title={isStory ? projectTitle : title}>
          {isStory ? projectTitle || t('story.export.wholeStory') : title || t('story.infoUntitled')}
        </div>
        {isStory ? (
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] opacity-35 mt-1">
            {wholeStory ? t('story.infoChapters', { count: wholeStory.length }) : t('common.loading')}
          </div>
        ) : isSelection ? (
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] mt-1 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {t('story.infoSelection')}
          </div>
        ) : updatedLabel && (
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] opacity-35 mt-1">
            {t('story.lastEdited', { date: updatedLabel })}
          </div>
        )}
      </div>

      <ChapterExportSection
        docTitle={isStory ? projectTitle || t('story.export.wholeStory') : title || t('story.infoUntitled')}
        items={isStory ? wholeStory : [{ title, content }]}
      />

      {canUseMapOutline && !isStory && <div className="mb-5 rounded-lg border border-[hsl(var(--notepad-fg,var(--foreground))/0.12)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <MapTrifold className="h-3.5 w-3.5" aria-hidden="true" />
              {t('story.mapRelationshipTest.title')}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed opacity-50">
              {t('story.mapRelationshipTest.description')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2 text-[10px]"
            onClick={() => mapTest ? setMapTestOpen(true) : void runMapRelationshipTest()}
            disabled={!chapterId || mapTestLoading}
          >
            {mapTestLoading
              ? <SpinnerGap className="h-3 w-3 animate-spin" aria-hidden="true" />
              : <MapTrifold className="h-3 w-3" aria-hidden="true" />}
            {mapTestLoading
              ? t('story.mapRelationshipTest.running')
              : mapTest
                ? t('story.mapRelationshipTest.open')
                : t('story.mapRelationshipTest.action')}
          </Button>
        </div>

        {mapTestError && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
            <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{mapTestError}</span>
          </div>
        )}

      </div>}

      {canUseMapOutline && !isStory && <ChapterMapOutlineModal
        open={mapTestOpen}
        onOpenChange={setMapTestOpen}
        result={mapTest}
        loading={mapTestLoading}
        onRegenerate={() => void runMapRelationshipTest()}
      />}

      <Section title={t('story.infoLength')}>
        <Stat label={t('story.statWords')} value={stats.words.toLocaleString()} />
        <Stat label={t('story.statPages')} value={stats.pages} hint={t('story.statPagesHint')} />
        <Stat label={t('story.statCharacters')} value={stats.characters.toLocaleString()} />
        <Stat label={t('story.statNoSpaces')} value={stats.charactersNoSpaces.toLocaleString()} />
        <Stat label={t('story.statSentences')} value={stats.sentences.toLocaleString()} />
        <Stat label={t('story.statParagraphs')} value={stats.paragraphs.toLocaleString()} />
      </Section>

      <Section title={t('story.infoTime')}>
        <Stat label={t('story.statReading')} value={stats.readingTime} hint={t('story.statReadingHint')} />
        <Stat label={t('story.statSpeaking')} value={stats.speakingTime} hint={t('story.statSpeakingHint')} />
      </Section>

      <Section title={t('story.infoReadability')}>
        <Stat
          label={t('story.statFleschEase')}
          value={stats.fleschReadingEase || '—'}
          info={t('story.statFleschEaseInfo')}
        />
        <Stat
          label={t('story.statFKGrade')}
          value={stats.fleschKincaidGrade || '—'}
          info={t('story.statFKGradeInfo')}
        />
      </Section>
      <div
        className="rounded-lg px-3 py-2.5 mb-5"
        style={{ background: 'hsl(var(--notepad-fg, var(--foreground)) / 0.035)' }}
      >
        <StatLabel label={t('story.statReadingLevel')} info={t('story.statReadingLevelInfo')} />
        <div className="text-sm mt-0.5">{stats.readingLevelLabel}</div>
      </div>

      <Section title={t('story.infoStyle')}>
        <Stat label={t('story.statAvgWord')} value={t('story.statAvgWordUnit', { n: stats.avgWordLength })} />
        <Stat label={t('story.statAvgSentence')} value={t('story.statAvgSentenceUnit', { n: stats.avgSentenceLength })} />
      </Section>

      {stats.topWords.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono opacity-35 mb-2 px-1">{t('story.infoMostUsed')}</div>
          <ul className="space-y-1">
            {stats.topWords.map(w => (
              <li
                key={w.word}
                className="flex items-baseline justify-between rounded-lg px-3 py-1.5 text-sm"
                style={{ background: 'hsl(var(--notepad-fg, var(--foreground)) / 0.035)' }}
              >
                <span className="truncate">{w.word}</span>
                <span className="text-[10px] font-mono opacity-45 tabular-nums">{w.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

export const ChapterInfoPanel = memo(ChapterInfoPanelInner);
