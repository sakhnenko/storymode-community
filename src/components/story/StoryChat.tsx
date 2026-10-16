import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaperPlaneRight, ArrowClockwise, SpinnerGap, X, CaretRight, PencilSimple, Lightbulb, Sparkle, Note, Notebook as NotebookIcon, BookmarkSimple, Lightning, Brain, Copy, Check, ArrowDown, ArrowsLeftRight, MusicNotes, Scissors, Eye, FilmSlate, Heart, Wind, Feather, Snowflake, PenNib, MagnifyingGlass, Compass, ChatCircleDots, BookOpen, Scroll, ImageSquare } from '@/components/ui/icons';
import { paragraphize } from '@/lib/paragraphize';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useAiLanguage } from '@/hooks/useAiLanguage';
import { AiTrialCard } from '@/components/credits/AiTrialCard';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { notifyCreditsChanged } from '@/hooks/useUserCredits';
import { useUserPlan } from '@/hooks/useUserPlan';
import { ToastAction } from '@/components/ui/toast';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { EDITORIAL_REVIEW_REQUEST, editorialReviewRequest, readEditorialMetadata, visibleEditorialRequest } from '@/lib/editorial-review-request';
import { isDoubleMark, reviewKey } from '@/lib/review-queue';
import { Markdown } from '@/components/Markdown';
import { ReviewHowTo } from './ReviewHowTo';
import { getVariantLabel, isStyleVariantLabel, splitBodyIntoItems, splitStandaloneAlternatives, type BodyItem } from '@/lib/story-chat-items';

export interface ReviewRequest {
  id: string;
  quote: string;
  intent?: string;
  contextBefore?: string;
  contextAfter?: string;
  /** When it was marked, to tell a double click from marking the passage again on purpose. */
  createdAt?: number;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  /** The speed a request was answered at, shown under it. */
  speed?: ChatSpeed;
  /** How long the editor thought before answering, ms, shown under the answer. */
  thoughtMs?: number;
  /** Credits the answer cost (none when it ran on the writer's own API key). */
  credits?: number;
}

// Split assistant markdown into collapsible "answer groups". Each group starts
// with a bold-only paragraph (e.g. **"Quoted phrase."**) which becomes the
// section title. Anything before the first such heading becomes a preamble.
function splitIntoGroups(content: string): {
  preamble: string;
  groups: { title: string; body: string }[];
} {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const preamble: string[] = [];
  const groups: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;
  let buffer: string[] = [];

  const isMajorHeading = (value: string): boolean => {
    const normalized = value.trim().replace(/:\s*$/, '');
    if (!normalized) return false;
    if (/^["“'‘]/.test(normalized) || /["”'’]$/.test(normalized)) return false;
    if (/[.!?]$/.test(normalized)) return false;
    if (normalized.length > 90) return false;
    if (normalized.split(/\s+/).length > 10) return false;
    return /[A-Za-z]/.test(normalized);
  };

  const headingFromLine = (line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const boldOnlyMatch = trimmed.match(/^\*\*(.+?)\*\*[.!?]?\s*$/s);
    const markdownHeadingMatch = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
    const candidate = (boldOnlyMatch?.[1] ?? markdownHeadingMatch?.[1] ?? '').trim().replace(/:\s*$/, '');

    // Style labels belong with the rewritten passage that follows them. If we
    // promote them to top-level groups here, consecutive labels become empty
    // accordion rows before the alternative parser gets a chance to pair each
    // label with its body.
    if (
      (boldOnlyMatch || markdownHeadingMatch) &&
      isMajorHeading(candidate) &&
      !isStyleVariantLabel(candidate)
    ) return candidate;
    return null;
  };

  const flushBufferToCurrent = () => {
    const body = buffer.join('\n').trim();
    if (!body) {
      buffer = [];
      return;
    }

    if (current) current.body.push(body);
    else preamble.push(body);
    buffer = [];
  };

  for (const line of lines) {
    const title = headingFromLine(line);
    if (title) {
      flushBufferToCurrent();
      if (current) groups.push(current);
      current = { title, body: [] };
      continue;
    }

    buffer.push(line);
  }

  flushBufferToCurrent();
  if (current) groups.push(current);

  return {
    preamble: preamble.join('\n\n'),
    groups: groups.map(g => ({ title: g.title, body: g.body.join('\n\n') })),
  };
}

/** A question whose answer is still being written, remembered so a reload can pick it up. */
interface PendingAnswer {
  /** The id story-chat saves the answer under (ai_chat_answers). */
  id: string;
  sentAt: number;
  userMessageId: string;
  isEditorialReview: boolean;
  reviewLanguage: string;
}
/** After this long a pending answer is given up on (the server stops long before). */
const PENDING_ANSWER_MAX_MS = 15 * 60 * 1000;
/** How long to wait for the server to start saving an answer before giving up on it. */
const PENDING_ANSWER_GRACE_MS = 20 * 1000;
const pendingAnswerKey = (projectId: string) => `storymode:story:chat-pending:${projectId}`;
function readPendingAnswer(projectId: string): PendingAnswer | null {
  try {
    const pending = JSON.parse(localStorage.getItem(pendingAnswerKey(projectId)) || 'null') as PendingAnswer | null;
    return pending && typeof pending.id === 'string' && Date.now() - pending.sentAt < PENDING_ANSWER_MAX_MS ? pending : null;
  } catch { return null; }
}
function clearPendingAnswer(projectId: string) {
  try { localStorage.removeItem(pendingAnswerKey(projectId)); } catch { /* ignore */ }
}

/** A question with the passage it's about quoted above it, as chat messages store it. */
function quoteSelection(selection: string, request: string) {
  return selection ? `> Selected text from chapter:\n> ${selection.replace(/\n/g, '\n> ')}\n\n${request}` : request;
}

/** The model's raw output split into its status lines and the answer after the `---` divider. */
function readRawAnswer(raw: string) {
  const divider = raw.match(/(?:^|\n)---\s*\n/);
  const head = divider?.index != null ? raw.slice(0, divider.index) : raw;
  const statuses = [...head.matchAll(/^\[status\]\s*(.+?)\s*$/gim)].map((m) => m[1]);
  const answer = divider?.index != null ? raw.slice(divider.index + divider[0].length) : null;
  return { statuses, answer };
}

// Parse a user-composed message that may include a "> Selected text from chapter:"
// blockquote at the top, returning the quoted selection and the trailing question.
function splitSelection(content: string): { selection: string; question: string } {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '> Selected text from chapter:') {
    return { selection: '', question: content };
  }
  const selLines: string[] = [];
  let i = 1;
  while (i < lines.length && lines[i].startsWith('>')) {
    selLines.push(lines[i].replace(/^>\s?/, ''));
    i++;
  }
  // skip a single blank separator line
  if (lines[i] === '') i++;
  return {
    selection: selLines.join('\n').trim(),
    question: lines.slice(i).join('\n').trim(),
  };
}

function UserMessage({ content, onQuoteClick }: { content: string; onQuoteClick?: (quote: string) => void }) {
  const { t } = useTranslation();
  const { selection, question: storedQuestion } = splitSelection(content);
  const question = visibleEditorialRequest(storedQuestion);
  if (!selection) {
    return (
      <div className="max-w-[85%] space-y-1">
        <div className="inline-block bg-primary/15 text-foreground rounded-2xl rounded-br-sm px-3 py-2 text-left leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word]">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[90%] text-left space-y-1.5">
      <div
        role={onQuoteClick ? 'button' : undefined}
        tabIndex={onQuoteClick ? 0 : undefined}
        title={onQuoteClick ? i18n.t('story.jumpToQuote') : undefined}
        onClick={onQuoteClick ? () => onQuoteClick(selection) : undefined}
        onKeyDown={onQuoteClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onQuoteClick(selection); } } : undefined}
        className={cn(
          'rounded-xl bg-foreground/[0.04] px-3 py-2 text-xs leading-relaxed text-foreground/85 italic [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap',
          onQuoteClick && 'cursor-pointer transition-colors hover:bg-primary/[0.12]',
        )}
      >
        <div className="text-[10px] uppercase tracking-[0.2em] not-italic text-foreground/40 font-mono mb-1">
          {t('story.selectedTextFromChapter')}
        </div>
        {selection}
      </div>
      {question && (
        <div className="inline-block bg-primary/15 text-foreground rounded-2xl rounded-br-sm px-3 py-2 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word]">
          {question}
        </div>
      )}
    </div>
  );
}

/** Side padding of the AI editor panel: 4% of its width, between 10 and 20 pixels, so it scales as the panel is resized. */
const SIDE_PADDING = 'px-[clamp(10px,4cqi,20px)]';

const PROSE_CLASSES = cn(
  'story-chat-message prose prose-sm prose-neutral dark:prose-invert max-w-none text-foreground [overflow-wrap:anywhere] [word-break:break-word]',
  'prose-p:my-0 prose-p:leading-relaxed [&_p+p]:mt-2',
  'prose-ul:my-0 prose-ul:pl-5 prose-ol:my-0 prose-ol:pl-5',
  // Tailwind's preflight removes list markers and the typography plugin is not
  // enabled here, so restore them explicitly or numbered answers lose numbers.
  '[&_ol]:list-decimal [&_ul]:list-disc [&_ol]:pl-5 [&_ul]:pl-5 [&_li]:list-item [&_li::marker]:text-foreground/60',
  '[&_li]:my-0 [&_li+li]:mt-1.5 [&_li]:leading-relaxed',
  '[&_p+ul]:mt-2 [&_p+ol]:mt-2',
  'prose-strong:text-foreground prose-strong:font-semibold',
  'prose-blockquote:rounded-md prose-blockquote:bg-primary/[0.10] prose-blockquote:px-3 prose-blockquote:py-2 prose-blockquote:border-l-[3px] prose-blockquote:border-primary/30 prose-blockquote:not-italic prose-blockquote:text-foreground prose-blockquote:my-3',
  'prose-hr:my-4 prose-hr:border-border/20',
  '[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:my-3 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-foreground/[0.04] [&_pre]:text-xs',
  '[&_code]:whitespace-pre-wrap [&_code]:break-words [&_:not(pre)>code]:bg-muted/40 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded',
  '[&_blockquote]:whitespace-pre-wrap [&_blockquote]:break-words',
  '[&>*+*]:mt-2'
);

// Render a plain-text item, highlighting quoted phrases ("..." or curly quotes).
// Plain text of a suggestion, without the Try:/Could be:/style label.
function getSuggestionPlainText(text: string): string {
  const cleaned = text
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^(Try|Could be|Option|Alt|Alternative|Tente|Poderia ser|Op[çc][ãa]o|Alternativa)\s*[:;]\s*/i, '')
    .trim();
  const variant = getVariantLabel(cleaned);
  return (variant ? variant.rest : cleaned).trim();
}

// A fun, on-theme icon for a style label ("Lyrical tilt", "Crisp and direct"...).
function getVariantIcon(label: string): React.ComponentType<{ className?: string; weight?: string }> {
  const l = label.toLowerCase();
  if (/lyric|poet|music|rhythm|song|melod/.test(l)) return MusicNotes;
  if (/crisp|direct|tight|sharp|lean|spare|clean|trim|minimal|blunt/.test(l)) return Scissors;
  if (/observ|measur|neutral|plain|report|detach|clinic|matter/.test(l)) return Eye;
  if (/cinema|visual|vivid|image|immersi|scenic/.test(l)) return FilmSlate;
  if (/tense|urgent|dramatic|punch|action|kinetic|fast|charged/.test(l)) return Lightning;
  if (/warm|intimate|emotion|tender|close|soft/.test(l)) return Heart;
  if (/sweep|single|compress|condens|short|brief|terse|one-sentence/.test(l)) return Wind;
  if (/formal|literary|classic|elegant|ornate|elevated/.test(l)) return Feather;
  if (/playful|light|humor|wry|witty|quirk/.test(l)) return Sparkle;
  if (/dark|grim|cold|bleak|stark/.test(l)) return Snowflake;
  return PenNib;
}

// Render a suggestion item (Try:/Could be:/style variant) with a prefix label.
function renderSuggestion(text: string, onQuoteClick?: (quote: string) => void): ReactNode {
  const cleaned = text
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1');
  const match = cleaned.match(/^(Try|Could be|Option|Alt|Alternative|Tente|Poderia ser|Op[çc][ãa]o|Alternativa)\s*[:;]\s*/i);
  if (!match) {
    const variant = getVariantLabel(cleaned);
    if (!variant) return <Markdown content={cleaned} onQuoteClick={onQuoteClick} quoteTitle={i18n.t('story.jumpToQuote')} />;
    const Icon = getVariantIcon(variant.label);
    return (
      <>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary/80 mb-2">
          <Icon weight="duotone" className="w-3 h-3" />
          {variant.label}
        </span>
        <span className="block text-foreground/85">{variant.rest}</span>
      </>
    );
  }
  const prefix = match[1];
  const rest = cleaned.slice(match[0].length);
  return (
    <>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary/80 mr-1.5">
        <Lightbulb weight="duotone" className="w-3 h-3" />
        {prefix}
      </span>
      <span className="italic text-foreground/85">{rest}</span>
    </>
  );

}

const suggestionActionClass = cn(
  'rounded-md p-1 text-foreground/50',
  'bg-background/70 backdrop-blur-sm border border-foreground/10',
  'opacity-0 group-hover/suggestion:opacity-100 focus-visible:opacity-100',
  'transition-all hover:text-foreground hover:bg-background'
);

function SuggestionActions({
  text,
  quote,
  onQuoteReplace,
}: {
  text: string;
  quote?: string;
  onQuoteReplace?: (quote: string, replacement: string) => boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const canReplace = Boolean(quote && onQuoteReplace);
  return (
    <div className="absolute top-1.5 right-1.5 flex flex-row items-start gap-1">
    <ActionTooltip label="Copy suggestion">
    <button
      type="button"
      aria-label="Copy suggestion"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(getSuggestionPlainText(text));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={suggestionActionClass}
    >
      {copied ? <Check weight="bold" className="w-3.5 h-3.5" /> : <Copy weight="duotone" className="w-3.5 h-3.5" />}
    </button>
    </ActionTooltip>
      {canReplace && (
        <ActionTooltip label="Replace quoted text">
        <button
          type="button"
          aria-label="Replace quoted text with suggestion"
          onClick={(e) => {
            e.stopPropagation();
            const ok = onQuoteReplace!(quote!, getSuggestionPlainText(text));
            if (ok) {
              setReplaced(true);
              setTimeout(() => setReplaced(false), 1500);
            } else {
              toast({
                title: i18n.t('story.replaceFailedTitle', { defaultValue: 'Could not replace' }),
                description: i18n.t('story.replaceFailedBody', {
                  defaultValue: 'The original passage was not found in the chapter.',
                }),
                variant: 'destructive',
              });
            }
          }}
          className={suggestionActionClass}
        >
          {replaced ? (
            <Check weight="bold" className="w-3.5 h-3.5" />
          ) : (
            <ArrowsLeftRight weight="duotone" className="w-3.5 h-3.5" />
          )}
        </button>
        </ActionTooltip>
      )}
    </div>
  );
}

function FeedbackPointSeparator() {
  return (
    <div className="flex items-center justify-center gap-3 py-2.5 opacity-70">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-foreground/10 to-foreground/5" />
      <Sparkle weight="thin" className="w-3 h-3 text-foreground/20" />
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-foreground/10 to-foreground/5" />
    </div>
  );
}

/** A failed editor request the panel explains specifically: out of credits, or AI blocked. */
class ChatError extends Error {
  constructor(message: string, readonly kind: 'credits' | 'blocked' | 'busy') {
    super(message);
  }
}

/** A streamed chunk in any provider's format (chat completions, Responses API, plain parts). */
interface StreamPayload {
  type?: string;
  delta?: unknown;
  content?: unknown;
  choices?: { delta?: { content?: unknown; text?: unknown }; message?: { content?: unknown } }[];
  [key: string]: unknown;
}

function extractStreamText(payload: StreamPayload | null): string {
  const collectText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(collectText).join('');
    if (!value || typeof value !== 'object') return '';

    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.content === 'string') return record.content;
    if (typeof record.delta === 'string') return record.delta;
    if (Array.isArray(record.content)) return record.content.map(collectText).join('');
    if (Array.isArray(record.parts)) return record.parts.map(collectText).join('');
    return '';
  };

  if (payload?.type === 'response.output_text.delta' && typeof payload?.delta === 'string') {
    return payload.delta;
  }

  return [
    payload?.choices?.[0]?.delta?.content,
    payload?.choices?.[0]?.delta?.text,
    payload?.choices?.[0]?.message?.content,
    payload?.delta,
    payload?.content,
    payload?.text,
  ].map(collectText).find(Boolean) || '';
}

function getGroupSemanticStyle(title: string): {
  Icon: React.ComponentType<{ className?: string; weight?: string }>;
  labelClass: string;
  borderClass: string;
} {
  const t = title.toLowerCase();
  const base = {
    labelClass: 'text-foreground',
    borderClass: 'border-l-foreground/25',
  };
  // Specific Creative review sections — each gets a distinct icon.
  if (/continuity|continuidade/.test(t)) return { ...base, Icon: Compass };
  if (/^story$|narrative|narrativa|momentum|história/.test(t)) return { ...base, Icon: Scroll };
  if (/what is working|working well|funcionando|what.*working/.test(t)) return { ...base, Icon: Check };
  if (/sensory|sensorial|sentidos/.test(t)) return { ...base, Icon: Wind };
  if (/imagery|imagem|metaphor|metáfora/.test(t)) return { ...base, Icon: ImageSquare };
  // Generic keyword matches for other section types.
  if (/fix|revision|change|issue|problem|error|broken|grammar|spelling|typo|must|correction/.test(t)) {
    return { ...base, Icon: PencilSimple };
  }
  if (/tweak|optional|consider|suggest|try|idea|maybe|experiment|alternative|worth/.test(t)) {
    return { ...base, Icon: Lightbulb };
  }
  if (/polish|pass|final|rewrite|draft|version|complete|polished/.test(t)) {
    return { ...base, Icon: Sparkle };
  }
  return { ...base, Icon: Note };
}

/** Emoji that mirrors the section's icon (see getGroupSemanticStyle). */
function emojiForGroupTitle(title: string): string {
  const t = title.toLowerCase();
  if (/continuity|continuidade/.test(t)) return '🧭';
  if (/^story$|narrative|narrativa|momentum|história/.test(t)) return '📜';
  if (/what is working|working well|funcionando|what.*working/.test(t)) return '✅';
  if (/sensory|sensorial|sentidos/.test(t)) return '🌬️';
  if (/imagery|imagem|metaphor|metáfora/.test(t)) return '🖼️';
  if (/fix|revision|change|issue|problem|error|broken|grammar|spelling|typo|must|correction/.test(t)) return '✏️';
  if (/tweak|optional|consider|suggest|try|idea|maybe|experiment|alternative|worth/.test(t)) return '💡';
  if (/polish|pass|final|rewrite|draft|version|complete|polished/.test(t)) return '✨';
  return '📝';
}

function trimSectionTitle(value: string): string {
  const raw = value
    // Drop markdown scaffolding: headings, list markers, emphasis, code ticks.
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[*_"“”'`\s]+|[*_"“”'`:\s]+$/g, '');
  if (!raw) return i18n.t('story.chapterNoteFallbackTitle');
  return raw.length > 60 ? `${raw.slice(0, 57).trimEnd()}…` : raw;
}

async function insertAnswerNotebook({
  gridId,
  chapterId,
  title,
  content,
}: {
  gridId: string;
  chapterId?: string;
  title: string;
  content: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('no user');

  const { data: existing } = await supabase
    .from('notepads')
    .select('row_index')
    .eq('grid_id', gridId)
    .order('row_index', { ascending: false })
    .limit(1);
  const nextRow = (existing?.[0]?.row_index ?? -1) + 1;

  const body = paragraphize(content);
  // Size the notebook so it holds the whole answer instead of clipping it.
  const height = Math.min(1400, Math.max(280, Math.round(body.length / 1.8) + 140));

  const { data: inserted, error } = await supabase.from('notepads').insert({
    user_id: userId,
    grid_id: gridId,
    ...(chapterId ? { chapter_id: chapterId } : {}),
    title: trimSectionTitle(title),
    content: body,
    height,
    theme: 'clean-white',
    font: 'inter',
    icon: emojiForGroupTitle(title),
    col_index: 0,
    row_index: chapterId ? 0 : nextRow,
  }).select('id, grid_id, title').single();
  if (error) throw error;
  return inserted;
}

async function ensureChapterNotesGrid(projectId: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('no user');

  const { data: hidden } = await supabase
    .from('notebook_grids')
    .select('id')
    .eq('project_id', projectId)
    .eq('title', '__chapter_notes__')
    .maybeSingle();
  if (hidden?.id) return hidden.id;

  const { data: newGrid, error } = await supabase
    .from('notebook_grids')
    .insert({ project_id: projectId, user_id: userId, title: '__chapter_notes__', icon: '🔗', position: 9999 })
    .select('id')
    .single();
  if (error) throw error;
  return newGrid.id;
}

type SavedNotebook = { id: string; grid_id: string; title: string };

function showSavedNotebookToast({
  folioTitle,
  folioIcon,
  notebook,
  section,
}: {
  folioTitle: string;
  folioIcon: string;
  notebook: SavedNotebook;
  section: 'chapter' | 'project';
}) {
  const openLabel = i18n.t('story.openSavedFolio', { folio: folioTitle });

  toast({
    variant: 'celebration',
    duration: 6500,
    title: (
      <span className="flex items-center gap-2.5">
        <span className="folio-save-toast-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200 ring-1 ring-inset ring-emerald-200/20">
          <Sparkle weight="fill" className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>{i18n.t('story.notebookSaved')}</span>
      </span>
    ),
    description: i18n.t('story.openSavedFolioHint'),
    action: (
      <ToastAction
        altText={openLabel}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('storymode:open-chapter-notebook', {
              detail: {
                id: notebook.id,
                gridId: notebook.grid_id,
                title: notebook.title,
                section,
              },
            }),
          )
        }
        className="max-w-full justify-start gap-2 font-mono"
      >
        <span className="text-base leading-none" aria-hidden="true">{folioIcon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{folioTitle}</span>
        <CaretRight weight="bold" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </ToastAction>
    ),
  });
}

/** Action row for a whole answer or one of its sections. */
function AnswerActions({
  title,
  content,
  projectId,
  chapterId,
  onChatAbout,
  meta,
}: {
  title: string;
  content: string;
  projectId?: string;
  chapterId?: string;
  onChatAbout?: (text: string) => void;
  /** Shown at the start of the row, e.g. how long the answer took and what it cost. */
  meta?: ReactNode;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [savingChapter, setSavingChapter] = useState(false);
  const [savedChapter, setSavedChapter] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folios, setFolios] = useState<{ id: string; title: string; icon: string }[]>([]);
  const [loadingFolios, setLoadingFolios] = useState(false);
  const [savingFolioId, setSavingFolioId] = useState<string | null>(null);

  const plain = content.replace(/^\s*>\s?/gm, '').trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: t('story.answerCopyFailed'), variant: 'destructive' });
    }
  };

  const saveToChapter = async () => {
    if (!projectId || !chapterId || savingChapter) return;
    setSavingChapter(true);
    try {
      const gridId = await ensureChapterNotesGrid(projectId);
      const row = await insertAnswerNotebook({ gridId, chapterId, title, content });
      window.dispatchEvent(new CustomEvent('storymode:chapter-notebooks-changed'));
      setSavedChapter(true);
      showSavedNotebookToast({
        folioTitle: t('story.chapterFolio'),
        folioIcon: '🔗',
        notebook: row,
        section: 'chapter',
      });
      window.setTimeout(() => setSavedChapter(false), 2500);
    } catch {
      toast({ title: t('story.answerSaveFailed'), variant: 'destructive' });
    } finally {
      setSavingChapter(false);
    }
  };

  const openPicker = async () => {
    if (!projectId) return;
    setPickerOpen(true);
    setLoadingFolios(true);
    try {
      const { data } = await supabase
        .from('notebook_grids')
        .select('id, title, icon')
        .eq('project_id', projectId)
        .order('position', { ascending: true });
      setFolios(
        (data || [])
          .filter((g) => g.title !== '__chapter_notes__')
          .map((g) => ({ id: g.id, title: g.title, icon: g.icon || '📁' })),
      );
    } finally {
      setLoadingFolios(false);
    }
  };

  const saveToFolio = async (gridId: string) => {
    if (savingFolioId) return;
    setSavingFolioId(gridId);
    try {
      const row = await insertAnswerNotebook({ gridId, title, content });
      const folio = folios.find((item) => item.id === gridId);
      showSavedNotebookToast({
        folioTitle: folio?.title || t('story.projectFolios'),
        folioIcon: folio?.icon || '📁',
        notebook: row,
        section: 'project',
      });
      setPickerOpen(false);
    } catch {
      toast({ title: t('story.answerSaveFailed'), variant: 'destructive' });
    } finally {
      setSavingFolioId(null);
    }
  };

  const btnClass =
    'inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-[color,background-color,opacity] duration-200 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50 opacity-35 group-hover/actions:opacity-100 group-focus-within/actions:opacity-100 [@media(hover:none)]:opacity-100';

  return (
    <>
      {/* Actions stay faint until the row is hovered or focused (always shown on touch screens). */}
      <div className="group/actions flex items-center justify-end gap-0.5 pt-1">
        {meta && <div className="mr-auto">{meta}</div>}
        <ActionTooltip label={t('story.answerCopy')}>
          <button type="button" onClick={copy} className={btnClass} aria-label={t('story.answerCopy')}>
            {copied ? <Check weight="bold" className="w-4 h-4" /> : <Copy weight="duotone" className="w-4 h-4" />}
          </button>
        </ActionTooltip>
        {onChatAbout && (
          <ActionTooltip label={t('story.answerDiscuss')}>
            <button
              type="button"
              onClick={() => onChatAbout(plain)}
              className={btnClass}
              aria-label={t('story.answerDiscuss')}
            >
              <ChatCircleDots weight="duotone" className="w-4 h-4" />
            </button>
          </ActionTooltip>
        )}
        {projectId && chapterId && (
          <ActionTooltip label={t('story.saveAnswerToFolio')}>
            <button
              type="button"
              onClick={saveToChapter}
              disabled={savingChapter}
              className={btnClass}
              aria-label={t('story.saveAnswerToFolio')}
            >
              {savingChapter ? (
                <SpinnerGap weight="bold" className="w-4 h-4 animate-spin" />
              ) : savedChapter ? (
                <Check weight="bold" className="w-4 h-4" />
              ) : (
                <NotebookIcon weight="duotone" className="w-4 h-4" />
              )}
            </button>
          </ActionTooltip>
        )}
        {projectId && (
          <ActionTooltip label={t('story.saveAnswerToProjectFolio')}>
            <button
              type="button"
              onClick={openPicker}
              className={btnClass}
              aria-label={t('story.saveAnswerToProjectFolio')}
            >
              <BookOpen weight="duotone" className="w-4 h-4" />
            </button>
          </ActionTooltip>
        )}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="z-[70] max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('story.saveAnswerToProjectFolio')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {loadingFolios && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <SpinnerGap weight="bold" className="w-4 h-4 animate-spin" />
              </div>
            )}
            {!loadingFolios && folios.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{t('story.noFoliosToSave')}</p>
            )}
            {folios.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => saveToFolio(f.id)}
                disabled={!!savingFolioId}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.06] disabled:opacity-50"
              >
                <span className="text-base">{f.icon}</span>
                <span className="flex-1 truncate">{f.title}</span>
                {savingFolioId === f.id && <SpinnerGap weight="bold" className="w-4 h-4 animate-spin" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


function AssistantMessage({
  content,
  messageIndex,
  openGroups,
  onToggleGroup,
  onQuoteClick,
  onQuoteReplace,
  fallbackQuote,
  projectId,
  activeChapterId,
  onChatAbout,
  meta,
  streaming = false,
}: {
  content: string;
  messageIndex: number;
  openGroups: Set<string>;
  onToggleGroup: (key: string, open: boolean) => void;
  onQuoteClick?: (quote: string) => void;
  onQuoteReplace?: (quote: string, replacement: string) => boolean;
  fallbackQuote?: string;
  projectId?: string;
  activeChapterId?: string;
  onChatAbout?: (text: string) => void;
  meta?: ReactNode;
  /** Still arriving section by section: the actions for the whole answer wait until it's done. */
  streaming?: boolean;
}) {
  const normalized = paragraphize(content);
  const answerTitle = deriveAnswerTitle(normalized);
  const wholeActions = streaming ? null : (
    <AnswerActions
      title={answerTitle}
      content={normalized}
      projectId={projectId}
      chapterId={activeChapterId}
      onChatAbout={onChatAbout}
      meta={meta}
    />
  );

  const standaloneAlternatives = splitStandaloneAlternatives(normalized);
  if (standaloneAlternatives) {
    return (
      <div className="space-y-3">
        {standaloneAlternatives.lead && (
          <Markdown className={PROSE_CLASSES} content={standaloneAlternatives.lead} />
        )}
        <BodyItems
          items={standaloneAlternatives.items}
          onQuoteClick={onQuoteClick}
          onQuoteReplace={onQuoteReplace}
          fallbackQuote={fallbackQuote}
        />
        {wholeActions}
      </div>
    );
  }
  const { preamble, groups } = splitIntoGroups(normalized);

  // Every section is just a heading over a block quote (written prompts,
  // sample lines): show the answer as written, open, rather than as folded rows.
  const allQuoteOnly = groups.length > 0 && groups.every((g) => {
    const items = splitBodyIntoItems(g.body);
    return items.length > 0 && items.every((i) => i.type === 'quote');
  });

  if (groups.length === 0 || allQuoteOnly) {
    // Plain (ungrouped) answers still get Try:/Could be: rendered as
    // copyable suggestion boxes instead of raw paragraphs.
    const items = splitBodyIntoItems(normalized);
    if (items.some((i) => i.type === 'suggestion')) {
      return (
        <div className="space-y-3">
          <BodyItems
            items={items}
            onQuoteClick={onQuoteClick}
            onQuoteReplace={onQuoteReplace}
            fallbackQuote={fallbackQuote}
          />
          {wholeActions}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <Markdown className={PROSE_CLASSES} content={normalized} />
        {wholeActions}
      </div>
    );
  }


  return (
    <div className="space-y-3">
      {preamble && (
        <Markdown className={cn(PROSE_CLASSES, 'pb-1')} content={preamble} />
      )}
      <div className="space-y-1.5">
        {groups.map((g, idx) => {
          const items = splitBodyIntoItems(g.body);
          const filtered = getFilteredBodySections(items);
          const style = getGroupSemanticStyle(g.title);
          // A section that is nothing but a block quote is the answer itself
          // (a written prompt, a sample line), not an orphan excerpt: show it
          // as written instead of hiding the whole section.
          const quoteOnly = filtered.length === 0 && items.length > 0 && items.every((i) => i.type === 'quote');

          // Skip groups whose body renders nothing (all content filtered out
          // as no-op suggestions).
          if (filtered.length === 0 && !quoteOnly) return null;




          return (
            <details
              key={idx}
              open={openGroups.has(`${messageIndex}:${idx}`)}
              onToggle={(e) =>
                onToggleGroup(`${messageIndex}:${idx}`, (e.currentTarget as HTMLDetailsElement).open)
              }
              className="group rounded-lg bg-foreground/[0.035] overflow-hidden transition-colors hover:bg-foreground/[0.055] [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none select-none px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <style.Icon weight="duotone" className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      'text-sm font-medium leading-snug [overflow-wrap:anywhere] [word-break:break-word]',
                      style.labelClass
                    )}
                  >
                    {g.title}
                  </span>
                </div>
                <CaretRight
                  weight="bold"
                  className="w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                />
              </summary>
              <div className="px-4 pb-4 space-y-3">
                {quoteOnly ? (
                  <Markdown className={PROSE_CLASSES} content={g.body} />
                ) : (
                  <BodyItems
                    items={items}
                    onQuoteClick={onQuoteClick}
                    onQuoteReplace={onQuoteReplace}
                    fallbackQuote={fallbackQuote}
                  />
                )}
                <AnswerActions
                  title={g.title}
                  content={g.body}
                  projectId={projectId}
                  chapterId={activeChapterId}
                  onChatAbout={onChatAbout}
                />
              </div>
            </details>
          );
        })}
      </div>
      {wholeActions}
    </div>
  );
}

/** First meaningful line of an answer, used as a notebook title. */
function deriveAnswerTitle(content: string): string {
  const line = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^[#>\-*\s]+/, '').trim())
    .find((l) => l.length > 0);
  return trimSectionTitle(line || i18n.t('story.chapterNoteFallbackTitle'));
}

/** Normalize text for equality comparisons (ignores quotes/dashes/punct). */
function normalizeForCompare(s: string): string {
  return s
    .replace(/^\s*>\s?/gm, '')
    .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** "No change needed" suggestions carry no value — drop them. */
function isNoOpSuggestion(s: string): boolean {
  const plain = normalizeForCompare(getSuggestionPlainText(s));
  if (!plain) return true;
  return /^(no changes?( needed)?|none|n a|unchanged|keep as is|as is|no suggestion|leave as is|no edit(s)?( needed)?)$/.test(
    plain
  );
}

/**
 * Split body items into quote-delimited sections and drop the ones that
 * would render nothing (no-op suggestions, orphan quotes, etc.). Returns
 * the sections that actually contain visible content.
 */
function getFilteredBodySections(items: BodyItem[]): BodyItem[][] {
  const sections: BodyItem[][] = [];
  let current: BodyItem[] = [];
  items.forEach((item) => {
    if (item.type === 'quote' && current.length > 0) {
      sections.push(current);
      current = [];
    }
    current.push(item);
  });
  if (current.length > 0) sections.push(current);

  return sections
    .map((section) => {
      const quote = section.find((it) => it.type === 'quote');
      if (!quote)
        return section.filter(
          (it) => it.type !== 'suggestion' || !isNoOpSuggestion(it.text)
        );
      const quoteKey = normalizeForCompare(quote.text);
      return section.filter(
        (it) =>
          it.type !== 'suggestion' ||
          (normalizeForCompare(getSuggestionPlainText(it.text)) !== quoteKey &&
            !isNoOpSuggestion(it.text))
      );
    })
    .filter((section) => section.length > 0)
    .filter((section) => section.some((it) => it.type !== 'quote'));
}

/** Renders parsed body items (quotes, suggestions, prose) with their styling. */
function BodyItems({
  items,
  onQuoteClick,
  onQuoteReplace,
  fallbackQuote,
}: {
  items: BodyItem[];
  onQuoteClick?: (quote: string) => void;
  onQuoteReplace?: (quote: string, replacement: string) => boolean;
  fallbackQuote?: string;
}) {

  const filteredSections = getFilteredBodySections(items);

  return (
    <div className="space-y-3">
      {filteredSections.map((section, sectionIndex) => {
        const sectionQuote = section.find((it) => it.type === 'quote')?.text || fallbackQuote;
        return (
        <div key={sectionIndex}>
          {sectionIndex > 0 && <FeedbackPointSeparator />}
          <div className="space-y-2">
            {section.map((item, i) => {
              const isQuote = item.type === 'quote';
              const isSuggestion = item.type === 'suggestion';
              return (
                <div
                  key={i}
                  role={isQuote && onQuoteClick ? 'button' : undefined}
                  tabIndex={isQuote && onQuoteClick ? 0 : undefined}
                  title={isQuote && onQuoteClick ? i18n.t('story.jumpToQuote') : undefined}
                  onClick={isQuote && onQuoteClick ? () => onQuoteClick(item.text) : undefined}
                  className={cn(
                    'text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]',
                    (isQuote || isSuggestion) && 'whitespace-pre-line',
                    isQuote
                      ? cn(
                          'rounded-md bg-primary/[0.10] border-l-[3px] border-primary/40 px-3 py-2 text-foreground font-[450] italic',
                          onQuoteClick && 'cursor-pointer transition-colors hover:bg-primary/[0.18]'
                        )
                      : isSuggestion
                        ? 'group/suggestion relative rounded-md bg-primary/[0.07] border border-dashed border-primary/40 px-3 py-3 pr-16 text-foreground/80'
                        : 'text-foreground/90'
                  )}
                >
                  {isSuggestion && (
                    <SuggestionActions
                      text={item.text}
                      quote={sectionQuote}
                      onQuoteReplace={onQuoteReplace}
                    />
                  )}
                  {isQuote
                    ? item.text
                    : isSuggestion
                      ? renderSuggestion(item.text, onQuoteClick)
                      : <Markdown className={PROSE_CLASSES} content={item.text} onQuoteClick={onQuoteClick} quoteTitle={i18n.t('story.jumpToQuote')} />}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

interface StoryChatProps {
  projectId: string;
  activeChapterId?: string;
  activeChapterTitle?: string;
  /** Passages marked for review in the editor, answered one after another. */
  reviewQueue?: ReviewRequest[];
  onReviewHandled?: (id: string) => void;
  /** Jump to a quoted passage inside the chapter editor. */
  onQuoteClick?: (quote: string) => void;
  /** Replace a quoted passage in the editor with a suggestion. */
  onQuoteReplace?: (quote: string, replacement: string) => boolean;
}

// Multi-part answers arrive section by section. While the model is still
// writing, reveal only the sections it has already FINISHED — everything up to
// the last section heading — so the reader can start on the opening paragraph
// while the outline is still being produced. A half-written trailing section is
// held back so nothing ever appears cut off mid-sentence.
const SECTION_HEADING_RE = /\n(?:\*\*[^\n*]{2,80}\*\*|#{2,4}[ \t][^\n]{2,80})[ \t]*\n/g;

function sealedSections(answer: string): string {
  if (!answer) return '';
  SECTION_HEADING_RE.lastIndex = 0;
  let lastIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = SECTION_HEADING_RE.exec(answer)) !== null) {
    lastIndex = match.index;
    SECTION_HEADING_RE.lastIndex = match.index + 1;
  }
  if (lastIndex <= 0) return '';
  return answer.slice(0, lastIndex).trim();
}


/** 9s, 1m 05s. */
function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** What the editor is doing right now, with a shimmer, and how long it has been at it. */
function ThinkingIndicator({ status, startedAt }: { status?: string; startedAt: number | null }) {
  const label = status?.trim() || i18n.t('story.statusReading');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span className="relative inline-flex w-3.5 h-3.5 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-primary/70" />
      </span>
      <span key={label} className="text-shimmer">{label}</span>
      {startedAt !== null && (
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground/60" aria-hidden="true">
          {formatElapsed(now - startedAt)}
        </span>
      )}
    </div>
  );
}

/** Beside an answer's actions: how long the editor thought and what it cost ("15s · 8 credits"). */
function AnswerMeta({ thoughtMs, credits }: { thoughtMs?: number; credits?: number }) {
  const { t } = useTranslation();
  if (thoughtMs === undefined && credits === undefined) return null;
  const parts = [
    thoughtMs !== undefined ? formatElapsed(thoughtMs) : null,
    credits !== undefined ? t('story.creditsUsed', { count: credits }) : null,
  ].filter(Boolean);
  const label = [
    thoughtMs !== undefined ? t('story.thoughtFor', { time: formatElapsed(thoughtMs) }) : null,
    credits !== undefined ? t('story.creditsUsed', { count: credits }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <span title={label} aria-label={label} className="font-mono text-[10.5px] tabular-nums text-muted-foreground/60">
      {parts.join(' · ')}
    </span>
  );
}

/** The last bold heading in a reasoning summary ("**Weighing the pacing**"), as a status line. */
function reasoningHeading(summary: string): string | null {
  const headings = [...summary.matchAll(/\*\*([^*\n]{3,80})\*\*/g)];
  return headings.length ? headings[headings.length - 1][1].trim() : null;
}

function StoryChatInner({ projectId, activeChapterId, activeChapterTitle, reviewQueue, onReviewHandled, onQuoteClick, onQuoteReplace }: StoryChatProps) {
  const { t } = useTranslation();
  const { plan } = useUserPlan();
  const storageKey = `storymode:story:chat:${projectId}`;
  const aiLanguage = useAiLanguage(projectId);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>('');
  /** When the current request was sent, for the thinking timer. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Finished sections of the answer currently being written, revealed early.
  const [streamingSections, setStreamingSections] = useState<string>('');

  const [selectedText, setSelectedText] = useState<string>('');
  const [speed, setSpeed] = useState<ChatSpeed>(() => {
    try {
      const saved = localStorage.getItem('storymode.chatSpeed');
      if (saved === 'fast' || saved === 'thoughtful' || saved === 'creative') return saved;
    } catch { /* fall through */ }
    return 'fast';
  });

  // Apply the plan-based default speed once the plan is known and the user
  // hasn't explicitly chosen a speed yet.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('storymode.chatSpeed');
      if (saved === 'fast' || saved === 'thoughtful' || saved === 'creative') return;
    } catch { return; }
    const planDefault: ChatSpeed = plan === 'studio' ? 'creative' : plan === 'manuscript' ? 'thoughtful' : 'fast';
    setSpeed(prev => prev === planDefault ? prev : planDefault);
  }, [plan]);

  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const stickToBottomRef = useRef(true);
  const scrollStorageKey = `storymode:story:chat-scroll:${projectId}`;
  const openStorageKey = `storymode:story:chat-open:${projectId}`;
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(openStorageKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const toggleGroup = useCallback((key: string, open: boolean) => {
    setOpenGroups(prev => {
      const has = prev.has(key);
      if (has === open) return prev;
      const next = new Set(prev);
      if (open) next.add(key); else next.delete(key);
      try { localStorage.setItem(openStorageKey, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, [openStorageKey]);
  const restoredScrollRef = useRef(false);
  // Queued status labels — each gets a minimum visible duration so users
  // can actually read them instead of seeing them flash by.
  const phaseQueueRef = useRef<string[]>([]);
  const phaseTimerRef = useRef<number | null>(null);
  // Claim queued reviews synchronously. React effects can run again before the
  // parent has removed an item or loading has committed, which previously sent
  // the same review request twice and appended a second, repeated answer later.
  const claimedReviewIdsRef = useRef<Set<string>>(new Set());
  // Double-click guard: the same passage marked twice within a few seconds at
  // the same speed is one request. Marking it again later, or at another
  // speed to compare, is a new one. Values are when each was marked.
  const claimedReviewQuotesRef = useRef<Map<string, number>>(new Map());
  // The speed each queued review was marked at, so it runs at that speed even
  // if the speed changes while it waits.
  const queuedSpeedRef = useRef<Map<string, ChatSpeed>>(new Map());
  // Synchronous in-flight lock. `loading` is React state, so two callers in the
  // same tick both see `false` and fire — which appended two assistant answers
  // to a single user message.
  const inFlightRef = useRef(false);
  const MIN_PHASE_MS = 1400;

  const advancePhase = useCallback(() => {
    const next = phaseQueueRef.current.shift();
    if (!next) { phaseTimerRef.current = null; return; }
    setLoadingPhase(next);
    phaseTimerRef.current = window.setTimeout(() => {
      phaseTimerRef.current = null;
      if (phaseQueueRef.current.length) advancePhase();
    }, MIN_PHASE_MS);
  }, []);

  const enqueuePhase = useCallback((label: string) => {
    const last = phaseQueueRef.current[phaseQueueRef.current.length - 1];
    if (label === last) return;
    phaseQueueRef.current.push(label);
    if (phaseTimerRef.current == null) advancePhase();
  }, [advancePhase]);

  const resetPhases = useCallback(() => {
    phaseQueueRef.current = [];
    if (phaseTimerRef.current != null) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    setLoadingPhase('');
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let saveTimer: number | null = null;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 80;
      setShowScrollDown(distance > el.clientHeight * 2);
      if (!restoredScrollRef.current) return;
      if (saveTimer != null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try { localStorage.setItem(scrollStorageKey, String(el.scrollTop)); } catch { /* ignore */ }
      }, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (saveTimer != null) window.clearTimeout(saveTimer);
    };
  }, [scrollStorageKey]);

  // Always open the chat at the latest message (bottom) on (re)mount.
  useEffect(() => {
    const settle = () => {
      const node = scrollRef.current;
      if (!node) { restoredScrollRef.current = true; return; }
      node.scrollTop = node.scrollHeight;
      stickToBottomRef.current = true;
      restoredScrollRef.current = true;
    };
    requestAnimationFrame(() => {
      settle();
      requestAnimationFrame(settle);
      window.setTimeout(settle, 120);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(messages));
    if (stickToBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
    }
  }, [messages, storageKey]);

  // Keep the view pinned to the newest finished section while an answer streams.
  useEffect(() => {
    if (!streamingSections) return;
    if (stickToBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
    }
  }, [streamingSections]);


  // Capture text selections made inside the chapter editor (ProseMirror).
  useEffect(() => {
    const draggingRef = { current: false };
    // Sample the full selection text only when the user *finishes* a selection —
    // not while dragging. selectionchange fires constantly during a drag and
    // calling sel.toString() on a large range is expensive.
    const capture = () => {
      const sel = window.getSelection();
      if (!sel) return;
      const node = sel.anchorNode;
      const el = (node?.nodeType === 3 ? node.parentElement : (node as Element | null)) || null;
      // Only react to selection events that originate inside the chapter editor.
      // Clicking into the chat composer (or anywhere else) must NOT clear the
      // previously captured selection.
      if (!el || !el.closest('.ProseMirror, .tiptap-chapter')) return;
      if (sel.isCollapsed) {
        setSelectedText(prev => (prev ? '' : prev));
        setSavedRange(null);
        return;
      }
      let range: Range | null = null;
      try { range = sel.getRangeAt(0).cloneRange(); } catch { range = null; }
      const visibleRange = range ? range.cloneRange() : null;
      // Snap partial-word selections out to whole words for the TEXT sent to
      // the AI (mid-word selections make it quote back with editorial
      // insertions like "Sky rubb(ed)"). The visible highlight stays exactly
      // on what the user selected.
      if (range) {
        const isWord = (c: string) => !!c && /[\p{L}\p{N}'’-]/u.test(c);
        const sNode = range.startContainer;
        if (sNode.nodeType === 3) {
          const data = (sNode as Text).data;
          let i = range.startOffset;
          while (i > 0 && isWord(data[i - 1]) && isWord(data[i])) i--;
          if (i !== range.startOffset) range.setStart(sNode, i);
        }
        const eNode = range.endContainer;
        if (eNode.nodeType === 3) {
          const data = (eNode as Text).data;
          let j = range.endOffset;
          while (j < data.length && isWord(data[j]) && isWord(data[j - 1])) j++;
          if (j !== range.endOffset) range.setEnd(eNode, j);
        }
      }
      const text = (range ? range.toString() : sel.toString()).trim();
      if (!text) {
        setSelectedText(prev => (prev ? '' : prev));
        setSavedRange(null);
        return;
      }
      setSelectedText(prev => (prev === text ? prev : text));
      setSavedRange(visibleRange);

    };
    const onMouseDown = () => { draggingRef.current = true; };
    const onMouseUp = () => { draggingRef.current = false; capture(); };
    document.addEventListener('mousedown', onMouseDown, { passive: true });
    document.addEventListener('mouseup', onMouseUp, { passive: true });
    document.addEventListener('keyup', capture, { passive: true });
    // Track the live caret/selection inside the editor so the kept highlight
    // follows the native selection exactly (single, constant-height style) and
    // is cleared the moment the user clicks back into the prose.
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      const el = (node?.nodeType === 3 ? node.parentElement : (node as Element | null)) || null;
      if (!el || !el.closest('.ProseMirror, .tiptap-chapter')) return;
      if (sel.isCollapsed) {
        setSelectedText(prev => (prev ? '' : prev));
        setSavedRange(null);
        return;
      }
      if (draggingRef.current) {
        // Mid-drag: only keep the visual highlight in sync; the text is sampled
        // once on mouseup.
        try { setSavedRange(sel.getRangeAt(0).cloneRange()); } catch { /* ignore */ }
        return;
      }
      // Programmatic selections (clicking a quote in an answer) never fire
      // mouseup inside the editor, so capture the text here too.
      capture();
    };
    document.addEventListener('selectionchange', onSelectionChange, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', capture);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);


  // Keep the chapter selection visually highlighted after focus moves to the
  // chat composer (clicking the textarea collapses the native selection).
  // Uses the CSS Custom Highlight API so there is only ever one style shown.
  useEffect(() => {
    type HighlightCtor = new (...ranges: Range[]) => unknown;
    const w = window as unknown as {
      Highlight?: HighlightCtor;
      CSS?: { highlights?: Map<string, unknown> };
    };
    const registry = w.CSS?.highlights;
    if (!registry || !w.Highlight) return;
    const KEY = 'storymode-kept-selection';
    if (!savedRange) { registry.delete(KEY); return; }
    try {
      registry.set(KEY, new w.Highlight(savedRange));
    } catch { registry.delete(KEY); }
    return () => { registry.delete(KEY); };
  }, [savedRange]);

  // Receive "chat about this" requests from the Folios sidebar — sets the
  // notebook content as the selected text so the user can ask a follow-up.
  useEffect(() => {
    const onChatAboutText = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      setSavedRange(null);
      setSelectedText(detail.text);
    };
    window.addEventListener('storymode:chat-about-text', onChatAboutText);
    return () => window.removeEventListener('storymode:chat-about-text', onChatAboutText);
  }, []);

  const send = useCallback(async (
    rawText: string,
    prefab?: string,
    selectionOverride?: string,
    reviewContext?: { before: string; after: string },
    speedOverride?: ChatSpeed,
  ) => {
    const text = rawText.trim();
    if (!text || loading || inFlightRef.current) return;
    inFlightRef.current = true;
    const selection = selectionOverride?.trim() || selectedText;
    const withSelection = (request: string) => quoteSelection(selection, request);
    const userMessageId = crypto.randomUUID();
    const reviewLanguage = i18n.language === 'pt-BR' ? 'pt-BR' : 'en';
    const isEditorialReview = prefab === 'editorial-review';
    const requestSpeed = speedOverride ?? speed;
    const next: ChatMessage[] = [...messages, { id: userMessageId, role: 'user' as const, content: withSelection(text), speed: requestSpeed }];

    setSelectedText('');
    // Keep `savedRange` so the passage stays visibly highlighted while the AI
    // answers. It clears when the user clicks back into the prose.

    setLoading(true);
    setStreamingSections('');
    resetPhases();
    // Until the answer stream opens, the server is gathering the chapters and notes it needs.
    enqueuePhase(i18n.t('story.statusReading'));
    const sentAt = Date.now();
    setStartedAt(sentAt);
    // Remembered until the answer arrives, so a reload mid-answer can pick it up.
    const pending: PendingAnswer = { id: crypto.randomUUID(), sentAt, userMessageId, isEditorialReview, reviewLanguage };
    // An earlier answer the server may still be writing; kept if this one is turned away as busy.
    const earlierPending = readPendingAnswer(projectId);
    try { localStorage.setItem(pendingAnswerKey(projectId), JSON.stringify(pending)); } catch { /* resuming is a bonus */ }
    let streamOpened = false;
    let handOff = false;
    let busy = false;

    setMessages(next);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/story-chat`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          projectId,
          messages: next.map(({ role, content }) => ({ role, content })),
          activeChapterId,
          activeChapterTitle,
          hasSelection: !!selection,
          prefab: prefab || undefined,
          reviewContext: reviewContext || undefined,
          reviewMetadata: isEditorialReview || undefined,
          aiLanguage,
          speed: requestSpeed,
          requestId: pending.id,
        }),
      });
      if (!resp.ok) {
        let errMsg = 'Chat failed';
        let payload: { error?: string; code?: string; credits_exhausted?: boolean } | null = null;
        try { payload = await resp.json(); } catch { /* ignore */ }
        if (payload?.error) errMsg = payload.error;
        // The writer's own StoryMode credits ran out (the AI gate says so).
        if (payload?.credits_exhausted) {
          throw new ChatError(
            errMsg && !/chat failed/i.test(errMsg)
              ? errMsg
              : "This account has run out of AI credits. Buy more credits or upgrade the plan to keep using the AI editor.",
            'credits',
          );
        }
        // The AI provider's own balance ran out: StoryMode's gateway on the
        // hosted app, the owner's OpenRouter account on a self-hosted one.
        if (resp.status === 402) throw new ChatError(errMsg, 'blocked');
        if (resp.status === 403 || payload?.code === 'ai_blocked') {
          throw new ChatError(
            errMsg && !/chat failed/i.test(errMsg)
              ? errMsg
              : 'AI access is blocked for this workspace. Ask the workspace admin to enable AI or raise the credit limit.',
            'blocked',
          );
        }
        if (resp.status === 409) { busy = true; throw new ChatError(errMsg, 'busy'); }
        throw new Error(errMsg);
      }
      if (!resp.body) throw new Error('No response body');
      streamOpened = true;
      // The server says what it read; the model may think for a while before writing.
      const scope = resp.headers.get('x-storymode-scope');
      enqueuePhase(i18n.t(scope === 'selection' ? 'story.statusThinkingSelection'
        : scope === 'book' ? 'story.statusThinkingBook' : 'story.statusThinkingChapter'));

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let raw = '';                 // full model output (status lines + divider + answer)
      let inAnswer = false;         // have we passed the --- divider?
      let answer = '';              // text after divider
      let statusCount = 0;          // how many [status] lines we've already enqueued
      let lastSealed = '';          // finished sections already shown to the reader
      let editorIdentified = false;
      let reasoning = '';           // the model's reasoning summary, when it shares one
      let answerStartedAt: number | null = null;
      let credits: number | undefined;
      const identifyEditor = (finished = false) => {
        if (!isEditorialReview || editorIdentified) return;
        const { kind } = readEditorialMetadata(raw, finished);
        if (!kind) return;
        editorIdentified = true;
        const content = withSelection(editorialReviewRequest(reviewLanguage, kind));
        setMessages(prev => prev.map(message => message.id === userMessageId ? { ...message, content } : message));
      };

      const flushParse = () => {
        if (inAnswer) return;
        identifyEditor();
        const dividerMatch = raw.match(/(?:^|\n)---\s*\n/);
        if (!dividerMatch || dividerMatch.index == null) {
          // still in status zone — enqueue any new [status] lines so each one
          // is displayed long enough to read.
          // Only consider COMPLETED lines (those followed by a newline). The
          // last segment after the final '\n' is a partial line still being
          // streamed — enqueuing it would flash partial words like "Re" or
          // "Not" before the full status arrives.
          const lastNewline = raw.lastIndexOf('\n');
          if (lastNewline === -1) return;
          const lines = raw.slice(0, lastNewline).split('\n');
          const statuses: string[] = [];
          for (const line of lines) {
            const m = line.match(/^\[status\]\s*(.+?)\s*$/i);
            if (m) statuses.push(m[1]);
          }
          for (let i = statusCount; i < statuses.length; i++) enqueuePhase(statuses[i]);
          statusCount = statuses.length;
          return;
        }
        inAnswer = true;
        answer = raw.slice(dividerMatch.index + dividerMatch[0].length);
      };

      const consumeEvents = (events: string[]) => {
        for (const evt of events) {
          const lines = evt.split('\n').filter(l => l.startsWith('data:'));
          for (const l of lines) {
            const payload = l.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              // StoryMode's own events: what it cost, and the model's reasoning headings.
              if (typeof json?.storymode?.credits === 'number') credits = json.storymode.credits;
              const thinking = json?.storymode?.thinking
                ?? json?.choices?.[0]?.delta?.reasoning ?? json?.choices?.[0]?.delta?.reasoning_content;
              if (typeof thinking === 'string' && thinking) {
                reasoning += thinking;
                // Reasoning summaries come in English; other projects keep their own language.
                const heading = aiLanguage === 'en' && !inAnswer ? reasoningHeading(reasoning) : null;
                if (heading) enqueuePhase(heading);
                continue;
              }
              const delta = extractStreamText(json);
              if (!delta) continue;
              const wasInAnswer = inAnswer;
              raw += delta;
              flushParse();
              if (inAnswer) {
                if (!wasInAnswer) {
                  answerStartedAt = Date.now();
                  enqueuePhase(i18n.t('story.writingResponse'));
                } else {
                  answer += delta;
                }
                // Reveal every section the model has already finished, so a
                // multi-part answer becomes readable part by part instead of
                // landing all at once at the end.
                const sealed = sealedSections(answer);
                if (sealed && sealed !== lastSealed) {
                  lastSealed = sealed;
                  setStreamingSections(sealed);
                }
              }

            } catch { /* ignore malformed chunk */ }
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';
        consumeEvents(events);
      }
      // Flush the decoder and any trailing event that never got a blank-line
      // terminator — otherwise the last words of the answer are dropped.
      sseBuffer += decoder.decode();
      if (sseBuffer.trim()) consumeEvents(sseBuffer.split('\n\n'));
      sseBuffer = '';

      // Stream finished — now reveal the assistant message in one go.
      const emptyMessage =
        "The AI didn't return anything this time — try rephrasing or asking again.";
      identifyEditor(true);
      const visibleRaw = isEditorialReview ? readEditorialMetadata(raw, true).content : raw;
      const finalContent = inAnswer
        ? (answer.trim() || emptyMessage)
        : (visibleRaw.replace(/^\s*(\[status\][^\n]*\n)+/i, '').trim() || emptyMessage);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: finalContent,
        thoughtMs: (answerStartedAt ?? Date.now()) - sentAt,
        credits,
      }]);
    } catch (e) {
      // The connection dropped mid-answer: the server is still writing it, so
      // follow the saved copy instead of failing.
      if (streamOpened && !(e instanceof ChatError)) {
        handOff = true;
        return;
      }
      const kind = e instanceof ChatError ? e.kind : null;
      const message = e instanceof Error ? e.message : '';
      if (kind === 'credits') {
        toast({ title: 'Out of AI credits', description: message, variant: 'destructive' });
      } else if (kind === 'blocked') {
        toast({ title: 'AI is unavailable right now', description: message, variant: 'destructive' });
      } else if (kind === 'busy') {
        toast({ title: 'Still working on your last question', description: message });
      } else {
        toast({ title: 'Chat failed', description: message || 'Try again.', variant: 'destructive' });
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setStreamingSections('');
      resetPhases();
      setStartedAt(null);
      notifyCreditsChanged();
      if (handOff) resumeRef.current?.(pending);
      else if (busy) {
        // Drop the turned-away question and follow the answer still being written.
        setMessages(prev => prev.filter(m => m.id !== userMessageId));
        const follow = (earlier: PendingAnswer) => {
          try { localStorage.setItem(pendingAnswerKey(projectId), JSON.stringify(earlier)); } catch { /* ignore */ }
          resumeRef.current?.(earlier);
        };
        if (earlierPending) follow(earlierPending);
        else {
          clearPendingAnswer(projectId);
          // This browser lost track of it (another tab, or a reload at the wrong
          // moment): find the answer the server is still writing for this book.
          void supabase.from('ai_chat_answers').select('id, created_at')
            .eq('project_id', projectId).eq('status', 'running')
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
            .then(({ data }) => {
              if (!data) return;
              const lastUser = [...messages].reverse().find(m => m.role === 'user');
              follow({
                id: data.id,
                sentAt: Date.parse(data.created_at),
                userMessageId: lastUser?.id ?? '',
                isEditorialReview: false,
                reviewLanguage,
              });
            });
        }
      } else clearPendingAnswer(projectId);
    }

  }, [loading, selectedText, messages, projectId, activeChapterId, activeChapterTitle, enqueuePhase, resetPhases, speed, aiLanguage]);

  // Picks up an answer the server kept writing after the page reloaded or the
  // connection dropped: follows the saved copy until it's done.
  const resumeRef = useRef<((pending: PendingAnswer) => void) | null>(null);
  const resumeAnswer = useCallback((pending: PendingAnswer) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setStreamingSections('');
    resetPhases();
    enqueuePhase(i18n.t('story.statusResuming'));
    setStartedAt(pending.sentAt);
    let answerStartedAt: number | null = null;
    let statusCount = 0;
    let lastSealed = '';
    let stopped = false;
    const finish = () => {
      stopped = true;
      window.clearInterval(timer);
      clearPendingAnswer(projectId);
      inFlightRef.current = false;
      setLoading(false);
      setStreamingSections('');
      resetPhases();
      setStartedAt(null);
      notifyCreditsChanged();
    };
    const poll = async () => {
      if (stopped) return;
      const { data } = await supabase.from('ai_chat_answers').select('content, status, credits').eq('id', pending.id).maybeSingle();
      if (stopped) return;
      if (!data) {
        // The server never started saving it (it failed early, or predates resuming).
        if (Date.now() - pending.sentAt > PENDING_ANSWER_GRACE_MS) {
          finish();
          toast({ title: i18n.t('story.resumeLostTitle'), description: i18n.t('story.resumeLostBody') });
        }
        return;
      }
      const raw = data.content || '';
      const { kind, content: visibleRaw } = pending.isEditorialReview
        ? readEditorialMetadata(raw, data.status !== 'running')
        : { kind: undefined, content: raw };
      const { statuses, answer } = readRawAnswer(visibleRaw);
      for (let i = statusCount; i < statuses.length; i++) enqueuePhase(statuses[i]);
      statusCount = statuses.length;
      if (answer !== null) {
        if (answerStartedAt === null) {
          answerStartedAt = Date.now();
          enqueuePhase(i18n.t('story.writingResponse'));
        }
        const sealed = sealedSections(answer);
        if (sealed && sealed !== lastSealed) {
          lastSealed = sealed;
          setStreamingSections(sealed);
        }
      }
      if (data.status === 'running') {
        if (Date.now() - pending.sentAt > PENDING_ANSWER_MAX_MS) finish();
        return;
      }
      finish();
      if (data.status === 'failed' && !answer?.trim()) {
        toast({ title: i18n.t('story.resumeLostTitle'), description: i18n.t('story.resumeLostBody') });
        return;
      }
      const emptyMessage = "The AI didn't return anything this time — try rephrasing or asking again.";
      const finalContent = answer !== null
        ? (answer.trim() || emptyMessage)
        : (visibleRaw.replace(/^\s*(\[status\][^\n]*\n)+/i, '').trim() || emptyMessage);
      setMessages(prev => {
        // A passage review is relabelled with the kind of editor that answered it.
        const relabelled = pending.isEditorialReview && kind
          ? prev.map(m => m.id === pending.userMessageId
            ? { ...m, content: quoteSelection(splitSelection(m.content).selection, editorialReviewRequest(pending.reviewLanguage, kind)) }
            : m)
          : prev;
        return [...relabelled, {
          role: 'assistant',
          content: finalContent,
          thoughtMs: answerStartedAt === null ? undefined : answerStartedAt - pending.sentAt,
          credits: data.credits ?? undefined,
        }];
      });
    };
    const timer = window.setInterval(() => { void poll(); }, 1500);
    void poll();
    return () => { stopped = true; window.clearInterval(timer); };
  }, [projectId, enqueuePhase, resetPhases]);
  const resumeStopRef = useRef<(() => void) | null>(null);
  resumeRef.current = (pending) => { resumeStopRef.current = resumeAnswer(pending) ?? null; };

  // After a reload, pick up an answer that was still being written.
  useEffect(() => {
    const pending = readPendingAnswer(projectId);
    const last = messages[messages.length - 1];
    let cancelled = false;
    if (pending && last?.role !== 'assistant' && messages.some(m => m.id === pending.userMessageId)) {
      resumeRef.current?.(pending);
    } else {
      // Already answered (the page went away just after the answer arrived), or
      // this browser lost track of it: the server may still be writing an
      // answer for this book, so follow that rather than let a new question
      // be turned away as busy.
      clearPendingAnswer(projectId);
      if (last?.role === 'user') void supabase.from('ai_chat_answers').select('id, created_at')
        .eq('project_id', projectId).eq('status', 'running')
        .gt('created_at', new Date(Date.now() - PENDING_ANSWER_MAX_MS).toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data || inFlightRef.current) return;
          const lastUser = [...messages].reverse().find(m => m.role === 'user');
          const found: PendingAnswer = {
            id: data.id, sentAt: Date.parse(data.created_at), userMessageId: lastUser?.id ?? '',
            isEditorialReview: false, reviewLanguage: i18n.language === 'pt-BR' ? 'pt-BR' : 'en',
          };
          try { localStorage.setItem(pendingAnswerKey(projectId), JSON.stringify(found)); } catch { /* ignore */ }
          resumeRef.current?.(found);
        });
    }
    return () => {
      cancelled = true;
      resumeStopRef.current?.();
      resumeStopRef.current = null;
      inFlightRef.current = false;
    };
    // Only when the project opens: `messages` is read once to see whether it was answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const clear = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
    setOpenGroups(new Set());
    try {
      localStorage.removeItem(openStorageKey);
      localStorage.removeItem(scrollStorageKey);
    } catch { /* ignore */ }
  };

  // A review keeps the speed it was marked at.
  useEffect(() => {
    for (const item of reviewQueue || []) {
      if (!queuedSpeedRef.current.has(item.id)) queuedSpeedRef.current.set(item.id, speed);
    }
  }, [reviewQueue, speed]);

  // Passages marked for review become chat questions, one at a time.
  useEffect(() => {
    if (loading || inFlightRef.current) return;
    const item = reviewQueue?.[0];
    if (!item) return;
    const itemSpeed = queuedSpeedRef.current.get(item.id) ?? speed;
    const markedAt = item.createdAt ?? Date.now();
    const quoteKey = reviewKey(item, itemSpeed);
    if (claimedReviewIdsRef.current.has(item.id) || isDoubleMark(claimedReviewQuotesRef.current, quoteKey, markedAt)) {
      claimedReviewIdsRef.current.add(item.id);
      onReviewHandled?.(item.id);
      return;
    }
    claimedReviewIdsRef.current.add(item.id);
    claimedReviewQuotesRef.current.set(quoteKey, markedAt);
    onReviewHandled?.(item.id);
    const prefabs = getPrefabList(aiLanguage);
    const prompt = prefabs.find(p => p.id === 'editorial-review')?.prompt || i18n.t('story.chatReviewRequest');
    void send(prompt, 'editorial-review', item.quote, {
      before: item.contextBefore || '',
      after: item.contextAfter || '',
    }, itemSpeed);
  }, [loading, reviewQueue, onReviewHandled, aiLanguage, send, speed]);

  return (
    // A size container, so the side padding grows and shrinks with the panel (SIDE_PADDING).
    <div className="h-full flex flex-col [container-type:inline-size]">
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 space-y-6 [overflow-wrap:anywhere] [word-break:break-word] font-sans', SIDE_PADDING)}>
        {messages.length === 0 && <ChatEmptyState projectId={projectId} onAsk={(q) => send(q)} disabled={loading} />}
        {messages.map((m, i) => (
          <div key={i} className={cn('text-sm min-w-0', m.role === 'user' ? 'flex justify-end' : '')}>
            {m.role === 'user' ? (
              <UserMessage content={m.content} onQuoteClick={onQuoteClick} />
            ) : (
              <AssistantMessage
                content={m.content}
                meta={<AnswerMeta thoughtMs={m.thoughtMs} credits={m.credits} />}
                messageIndex={i}
                openGroups={openGroups}
                onToggleGroup={toggleGroup}
                onQuoteClick={onQuoteClick}
                onQuoteReplace={onQuoteReplace}
                fallbackQuote={splitSelection(messages[i - 1]?.role === 'user' ? messages[i - 1].content : '').selection || undefined}
                projectId={projectId}
                activeChapterId={activeChapterId}
                onChatAbout={(text) => {
                  setSavedRange(null);
                  setSelectedText(text);
                }}
              />
            )}
          </div>
        ))}

        {loading && streamingSections && (
          <div className="text-sm min-w-0">
            <AssistantMessage
              streaming
              content={streamingSections}
              messageIndex={messages.length}
              openGroups={openGroups}
              onToggleGroup={toggleGroup}
              onQuoteClick={onQuoteClick}
              onQuoteReplace={onQuoteReplace}
              projectId={projectId}
              activeChapterId={activeChapterId}
              onChatAbout={(text) => {
                setSavedRange(null);
                setSelectedText(text);
              }}
            />
          </div>
        )}

        {loading && (
          <ThinkingIndicator status={loadingPhase} startedAt={startedAt} />
        )}

        {(reviewQueue?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 italic">
            <BookmarkSimple weight="duotone" className="w-3.5 h-3.5" />
            {t('story.chatQueued')} · {reviewQueue!.length}
          </div>
        )}
      </div>
      {/* Bottom fade (inner-shadow feel) so cut-off answers ease out above the composer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 z-10"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--notepad-panel-bg, hsl(var(--notepad-bg, var(--background)))))' }}
      />
      {showScrollDown && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
          aria-label={t('story.chatScrollToBottom', 'Go to latest')}
          className="absolute bottom-4 left-[calc(50%-1rem)] z-20 h-8 w-8 rounded-full border border-foreground/10 bg-background/90 backdrop-blur-sm shadow-md flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-background transition-all duration-200 animate-scale-in"
        >
          <ArrowDown weight="bold" className="w-4 h-4" />
        </button>
      )}
      </div>
      <AiTrialCard className="mx-6 mb-2" />
      <Composer
        loading={loading}
        selectedText={selectedText}
        onClearSelection={() => { setSelectedText(''); setSavedRange(null); }}
        onQuoteClick={onQuoteClick}
        onSend={send}
        onClear={clear}
        aiLanguage={aiLanguage}
        speed={speed}
        onSpeedChange={(next) => {
          setSpeed(next);
          try { localStorage.setItem('storymode.chatSpeed', next); } catch { /* ignore */ }
        }}
      />
    </div>
  );
}

export const StoryChat = memo(StoryChatInner);

/** In this browser, for every project: the writer has seen how to ask for a review and hid it. */
const REVIEW_INTRO_HIDDEN_KEY = 'storymode:story:hideReviewIntro';
/** Where it was remembered before, one project at a time. */
const legacyReviewIntroKey = (projectId?: string) => `storymode:story:${projectId ?? 'none'}:hideReviewIntro`;

function ChatEmptyState({ projectId, onAsk, disabled }: { projectId?: string; onAsk: (q: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [introHidden, setIntroHidden] = useState(() => {
    try {
      return localStorage.getItem(REVIEW_INTRO_HIDDEN_KEY) === '1'
        || localStorage.getItem(legacyReviewIntroKey(projectId)) === '1';
    } catch { return false; }
  });
  const hideIntro = () => {
    setIntroHidden(true);
    try { localStorage.setItem(REVIEW_INTRO_HIDDEN_KEY, '1'); } catch { /* storage unavailable: hidden for this visit */ }
  };
  const suggestions = [
    { text: t('story.chatSuggestionSummary'), icon: BookOpen },
    { text: t('story.chatSuggestion1'), icon: MagnifyingGlass },
    { text: t('story.chatSuggestion2'), icon: Compass },
    { text: t('story.chatSuggestion3'), icon: Scissors },
    { text: t('story.chatSuggestion4'), icon: Heart },
  ];
  return (
    <div className="px-[clamp(0px,1.5cqi,8px)] pt-3 pb-6 space-y-4 font-sans">
      {/* The one thing to learn first: select, tap, and it's reviewed here. */}
      {!introHidden && <section className="space-y-2">
        <div className="flex items-center gap-2 text-foreground/85">
          <Sparkle weight="duotone" className="w-4 h-4 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">{t('story.reviewIntroTitle')}</span>
          <button type="button" onClick={hideIntro}
            className="ml-auto rounded px-1 text-[11px] text-foreground/45 transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {t('story.reviewIntroHide')}
          </button>
        </div>
        <ReviewHowTo />
        <p className="px-0.5 pt-1 text-[13px] text-foreground/70">{t('story.reviewIntroBody')}</p>
      </section>}
      <div className={cn('space-y-2', !introHidden && 'pt-5')}>
        <div className="flex items-center gap-2 text-foreground/85">
          <ChatCircleDots weight="duotone" className="w-4 h-4 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            {t('story.chatSuggestionsLabel')}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {suggestions.map(({ text, icon: Icon }) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              onClick={() => onAsk(text)}
              className="flex items-start gap-2.5 text-left rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.10] transition-colors px-3 py-2 text-[13px] text-foreground/80 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon weight="duotone" className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0">{text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type ChatSpeed = 'fast' | 'thoughtful' | 'creative';

interface ComposerProps {
  loading: boolean;
  selectedText: string;
  onClearSelection: () => void;
  onQuoteClick?: (quote: string) => void;
  onSend: (text: string, prefab?: string) => void;
  onClear: () => void;
  aiLanguage?: string;
  speed: ChatSpeed;
  onSpeedChange: (next: ChatSpeed) => void;
}


const PREFABS: { id: string; label: string; prompt: string }[] = [
  { id: 'spelling-grammar', label: 'Spelling & Grammar', prompt: 'Check this passage for spelling, grammar, and punctuation errors. List only actual errors found. For every issue, include a concrete corrected option prefixed with Try: or Could be:. Do not add broader style rewrites.' },
  { id: 'editorial-review', label: 'Editorial Review', prompt: EDITORIAL_REVIEW_REQUEST.en },
  { id: 'reading-flow', label: 'Reading Flow', prompt: 'Analyze how the sentences in this passage flow when read. Comment on rhythm, cadence, sentence length variety, and any moments that feel abrupt or trip up the reader. When a moment trips the reader, include a concrete option for smoother flow, prefixed with Try: or Could be:.' },
];

const PREFABS_PTBR: { id: string; label: string; prompt: string }[] = [
  { id: 'spelling-grammar', label: 'Ortografia & Gramática', prompt: 'Verifique esta passagem em busca de erros de ortografia, gramática e pontuação. Liste apenas os erros reais encontrados. Para cada problema, inclua uma opção corrigida concreta prefixada com Tente: ou Poderia ser:. Não adicione reescritas de estilo mais amplas.' },
  { id: 'editorial-review', label: 'Revisão Editorial', prompt: EDITORIAL_REVIEW_REQUEST['pt-BR'] },
  { id: 'reading-flow', label: 'Fluidez de Leitura', prompt: 'Analise como as frases desta passagem fluem quando lidas. Comente sobre ritmo, cadência, variedade de extensão das frases e momentos que pareçam abruptos ou que dificultem a leitura. Quando um momento travar o leitor, inclua uma opção concreta para melhorar o fluxo, prefixada com Tente: ou Poderia ser:.' },
];

// Prefab prompts follow the INTERFACE language (what the user reads in the
// chat bubble). The AI's answer language is enforced server-side from the
// project's aiLanguage setting.
function getPrefabList(_lang?: string) {
  return i18n.language === 'pt-BR' ? PREFABS_PTBR : PREFABS;
}

const MAX_TEXTAREA_PX = 400;

const Composer = memo(function Composer({ loading, selectedText, onClearSelection, onQuoteClick, onSend, onClear, aiLanguage, speed, onSpeedChange }: ComposerProps) {
  const { t } = useTranslation();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastHeightRef = useRef(0);

  const handleTextareaMouseDown = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!selectedText || document.activeElement === taRef.current) return;
    // Prevent the browser from collapsing the editor selection (which would
    // clear the kept highlight), then focus synchronously so typing works
    // immediately.
    e.preventDefault();
    const el = taRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [selectedText]);

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_PX);
    if (next !== lastHeightRef.current) {
      el.style.height = next + 'px';
      lastHeightRef.current = next;
    } else {
      el.style.height = next + 'px';
    }
  }, []);

  const handleInput = useCallback(() => {
    // Coalesce resize work into a single frame so typing stays snappy.
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      resize();
    });
  }, [resize]);

  const handleSend = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    const t = el.value.trim();
    if (!t || loading) return;
    el.value = '';
    lastHeightRef.current = 0;
    resize();
    onSend(t);
  }, [loading, onSend, resize]);

  const handlePrefab = useCallback((prefab: { id: string; label: string; prompt: string }) => {
    if (loading) return;
    onSend(prefab.prompt, prefab.id);
  }, [loading, onSend]);

  return (
    <div className={cn('py-3', SIDE_PADDING)}>
      <div className="rounded-2xl bg-foreground/[0.05] ring-1 ring-foreground/[0.07] transition-shadow focus-within:ring-foreground/20 p-2 space-y-2">
        {selectedText && (
          <div className="rounded-xl bg-foreground/[0.05] p-1.5 space-y-1.5">
            <div className="flex items-start gap-2 text-xs">
              <div
                role={onQuoteClick ? 'button' : undefined}
                tabIndex={onQuoteClick ? 0 : undefined}
                title={onQuoteClick ? t('story.jumpToQuote') : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onQuoteClick ? () => onQuoteClick(selectedText) : undefined}
                onKeyDown={onQuoteClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onQuoteClick(selectedText); } } : undefined}
                className={cn(
                  'min-w-0 flex-1 leading-snug rounded-md px-1.5 py-1',
                  onQuoteClick && 'cursor-pointer transition-colors hover:bg-foreground/[0.07]',
                )}
              >
                <div className="truncate text-foreground/80 italic">
                  {selectedText.length > 60 ? `${selectedText.slice(0, 30)}…${selectedText.slice(-20)}` : selectedText}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0 -mr-0.5 -mt-0.5" onClick={onClearSelection}>
                <X weight="bold" className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 px-0.5">
              {getPrefabList(aiLanguage).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={loading}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePrefab(p)}
                  className="inline-flex items-center rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] text-foreground/60 transition-colors hover:bg-foreground/[0.11] hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {p.id === 'spelling-grammar'
                    ? t('story.spellingGrammar')
                    : p.id === 'editorial-review'
                      ? t('story.editorialReview')
                      : p.id === 'reading-flow'
                        ? t('story.readingFlow')
                        : p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          ref={taRef}
          onInput={handleInput}
          onMouseDown={handleTextareaMouseDown}
          placeholder={selectedText ? t('story.askAboutSelectedText') : t('story.askAboutBook')}
          rows={1}
          className="w-full min-h-[36px] text-sm font-sans resize-none border-0 bg-transparent px-2 py-1.5 placeholder:text-foreground/35 placeholder:italic focus-visible:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <ActionTooltip label={t('story.chatNew')}>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('story.chatNew')}
              className="h-7 px-1.5 text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.08]"
              onClick={onClear}
            >
              <ArrowClockwise weight="duotone" className="w-3.5 h-3.5" />
            </Button>
            </ActionTooltip>
            <div
              role="group"
              aria-label={t('story.chatSpeedLabel', { defaultValue: 'Response mode' })}
              className="flex items-center gap-0.5 rounded-full bg-foreground/[0.06] p-0.5 min-w-0"
            >
              {([
                { id: 'fast' as const, icon: Lightning, label: t('story.chatSpeedFast', { defaultValue: 'Fast' }), hint: t('story.chatSpeedFastHint', { defaultValue: 'Quicker, cheaper answers' }) },
                { id: 'thoughtful' as const, icon: Brain, label: t('story.chatSpeedThoughtful', { defaultValue: 'Thoughtful' }), hint: t('story.chatSpeedThoughtfulHint', { defaultValue: 'Slower, deeper analysis' }) },
                { id: 'creative' as const, icon: Feather, label: t('story.chatSpeedCreative', { defaultValue: 'Creative' }), hint: t('story.chatSpeedCreativeHint', { defaultValue: 'Strongest model for nuanced prose (uses more credits)' }) },
              ]).map(({ id, icon: Icon, label, hint }) => (
                <ActionTooltip key={id} label={hint}>
                <button
                  type="button"
                  aria-pressed={speed === id}
                  onClick={() => onSpeedChange(id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] transition-colors',
                    speed === id
                      ? 'bg-foreground/[0.11] text-foreground'
                      : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.07]',
                  )}
                >
                  <Icon weight={speed === id ? 'fill' : 'duotone'} className="w-3 h-3" />
                  {label}
                </button>
                </ActionTooltip>
              ))}
            </div>
          </div>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={loading}
            className="h-8 w-8 shrink-0 rounded-full"
          >
            <PaperPlaneRight weight="fill" className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
