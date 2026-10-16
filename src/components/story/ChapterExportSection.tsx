import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadSimple, FileText, FileMd, FileDoc, FilePdf, FileArchive, CaretDown } from '@/components/ui/icons';
import { useToast } from '@/hooks/use-toast';
import { exportChapters, type ExportFormat, type ExportChapter } from '@/lib/story-export';

interface Props {
  /** Document title: the chapter's, or the project's for the whole story. */
  docTitle: string;
  /** What to export, as chosen by the Info panel's chapter/story toggle; null while loading. */
  items: ExportChapter[] | null;
}

const FORMATS: { id: ExportFormat; labelKey: string; Icon: React.ElementType }[] = [
  { id: 'txt', labelKey: 'story.export.txt', Icon: FileText },
  { id: 'md', labelKey: 'story.export.md', Icon: FileMd },
  { id: 'rtf', labelKey: 'story.export.rtf', Icon: FileArchive },
  { id: 'doc', labelKey: 'story.export.doc', Icon: FileDoc },
  { id: 'pdf', labelKey: 'story.export.pdf', Icon: FilePdf },
];

export function ChapterExportSection({ docTitle, items }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [expanded, setExpanded] = useState(false);

  const run = useCallback(async (format: ExportFormat) => {
    if (!items) return;
    setBusy(format);
    try {
      if (items.length === 0) {
        toast({ title: t('story.export.nothing'), variant: 'destructive' });
        return;
      }
      const fontId = localStorage.getItem('storymode:story:font') || 'source';
      const ok = await exportChapters(format, docTitle, items, { fontId });
      if (!ok) toast({ title: t('story.export.popupBlocked'), variant: 'destructive' });
    } catch {
      toast({ title: t('story.export.failed'), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }, [items, docTitle, toast, t]);

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls="chapter-export-options"
        className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg border border-[hsl(var(--notepad-fg,var(--foreground))/0.18)] bg-[hsl(var(--notepad-fg,var(--foreground))/0.055)] px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--notepad-fg,var(--foreground))/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2">
          <DownloadSimple weight="duotone" className="h-4 w-4" aria-hidden="true" />
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">{t('story.export.title')}</span>
            <span className="text-[10px] opacity-60">{t('story.export.expandHint')}</span>
          </span>
        </span>
        <CaretDown
          weight="bold"
          className="h-4 w-4 shrink-0 transition-transform duration-200"
          aria-hidden="true"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {expanded && <div id="chapter-export-options">
        <div
          className="rounded-lg p-2"
          style={{ background: 'hsl(var(--notepad-fg, var(--foreground)) / 0.035)' }}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {FORMATS.map(({ id, labelKey, Icon }) => (
              <button
                key={id}
                type="button"
                disabled={busy !== null || !items}
                onClick={() => void run(id)}
                className="flex items-center gap-1.5 h-8 px-2 rounded-md text-xs transition-colors hover:bg-[hsl(var(--notepad-fg,var(--foreground))/0.08)] disabled:opacity-40"
                style={{ background: 'hsl(var(--notepad-fg, var(--foreground)) / 0.045)' }}
              >
                <Icon weight={busy === id ? 'fill' : 'duotone'} className="w-3.5 h-3.5 opacity-70" />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>}
    </div>
  );
}
