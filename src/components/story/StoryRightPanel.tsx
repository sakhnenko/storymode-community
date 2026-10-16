import { memo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PanelRightClose, BookOpen, Info, Sparkle } from '@/components/ui/icons';
import { FoliosBrowser } from './FoliosBrowser';
import { StoryChat, type ReviewRequest } from './StoryChat';
import { ChapterInfoPanel } from './ChapterInfoPanel';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useTranslation } from 'react-i18next';

interface Props {
  projectId: string;
  activeTab: 'folios' | 'info' | 'editor';
  onTabChange: (t: 'folios' | 'info' | 'editor') => void;
  onClose: () => void;
  panelStyle?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
  activeChapterId?: string;
  activeChapterTitle?: string;
  onSelectChapter?: (id: string) => void;
  activeChapterContent?: string;
  activeChapterUpdatedAt?: string;
  reviewQueue?: ReviewRequest[];
  onReviewHandled?: (id: string) => void;
  onQuoteClick?: (quote: string) => void;
  onQuoteReplace?: (quote: string, replacement: string) => boolean;
}

function StoryRightPanelInner({
  projectId, activeTab, onTabChange, onClose, panelStyle, dividerStyle, width, onResizeStart,
  activeChapterId, activeChapterTitle, onSelectChapter,
  activeChapterContent, activeChapterUpdatedAt,
  reviewQueue, onReviewHandled, onQuoteClick, onQuoteReplace,
}: Props) {
  const { t } = useTranslation();
  const { hasAi } = useUserPlan();
  // Free users see no AI tab at all.
  const showEditor = hasAi;
  const safeTab = activeTab === 'editor' && !showEditor ? 'info' : activeTab;
  const triggerClassName = [
    'h-7 px-2 gap-1 text-xs',
    'text-[hsl(var(--notepad-fg,var(--foreground))/0.5)]',
    'hover:bg-[hsl(var(--notepad-fg,var(--foreground))/0.05)]',
    'hover:text-[hsl(var(--notepad-fg,var(--foreground)))]',
    'data-[state=active]:bg-[hsl(var(--notepad-fg,var(--foreground))/0.07)]',
    'data-[state=active]:text-[hsl(var(--notepad-fg,var(--foreground)))]',
    'data-[state=active]:shadow-none',
  ].join(' ');

  return (
    <div className="shrink-0 h-full rounded-md p-px story-panel-border">
      <aside
        className="h-full rounded-[5px] flex flex-col overflow-hidden relative shadow-sm"
        style={{ ...panelStyle, width: width ?? 360 }}
      >
        {onResizeStart && (
          <div
            onMouseDown={onResizeStart}
            className="absolute left-0 top-0 bottom-0 w-1 -ml-0.5 cursor-col-resize z-20 hover:bg-foreground/20 transition-colors"
          />
        )}
        <Tabs value={safeTab} onValueChange={(v) => onTabChange(v as Props['activeTab'])} className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-2 h-10 border-b" style={dividerStyle}>
            <TabsList className="h-8 bg-transparent gap-1 p-0">
              {/* The AI editor first: it is where a chapter gets worked on; Info last. */}
              {showEditor && <TabsTrigger value="editor" className={triggerClassName}>
                <Sparkle weight="duotone" className="w-3.5 h-3.5" />
                {t('story.tab.editor')}
                {(reviewQueue?.length ?? 0) > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-[hsl(var(--notepad-fg,var(--foreground))/0.09)] text-[hsl(var(--notepad-fg,var(--foreground))/0.6)] text-[10px] font-mono leading-none">
                    {reviewQueue!.length}
                  </span>
                )}
              </TabsTrigger>}
              <TabsTrigger value="folios" className={triggerClassName}>
                <BookOpen weight="duotone" className="w-3.5 h-3.5" /> {t('story.tab.folios')}
              </TabsTrigger>
              <TabsTrigger value="info" className={triggerClassName}>
                <Info weight="duotone" className="w-3.5 h-3.5" /> {t('story.tab.info')}
              </TabsTrigger>
            </TabsList>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label={t('story.hideSidePanel')} title={t('story.hideSidePanel')}>
              <PanelRightClose weight="duotone" className="w-4 h-4" />
            </Button>
          </div>

          <TabsContent value="folios" className="flex-1 min-h-0 m-0 overflow-hidden data-[state=active]:flex flex-col">
            <FoliosBrowser
              projectId={projectId}
              activeChapterId={activeChapterId}
              activeChapterTitle={activeChapterTitle}
              onSelectChapter={onSelectChapter}
            />
          </TabsContent>
          <TabsContent value="info" className="flex-1 min-h-0 m-0 overflow-hidden data-[state=active]:flex flex-col">
            <ChapterInfoPanel
              projectId={projectId}
              chapterId={activeChapterId}
              title={activeChapterTitle || ''}
              content={activeChapterContent || ''}
              updatedAt={activeChapterUpdatedAt}
            />
          </TabsContent>
          <TabsContent
            value="editor"
            forceMount
            className="flex-1 min-h-0 m-0 overflow-hidden flex-col data-[state=active]:flex data-[state=inactive]:hidden"
          >
            <StoryChat
              key={projectId}
              projectId={projectId}
              activeChapterId={activeChapterId}
              activeChapterTitle={activeChapterTitle}
              reviewQueue={reviewQueue}
              onReviewHandled={onReviewHandled}
              onQuoteClick={onQuoteClick}
              onQuoteReplace={onQuoteReplace}
            />
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}

export const StoryRightPanel = memo(StoryRightPanelInner);
