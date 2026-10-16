import { memo, useMemo, useState } from 'react';
import { CaretDown, Plus, Check, Eye, Trash, PencilSimple } from '@/components/ui/icons';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChapterDraft } from '@/hooks/useChapterDrafts';
import { useTranslation } from 'react-i18next';

interface Props {
  drafts: ChapterDraft[];
  activeDraftId: string | null | undefined;
  viewingDraftId: string | null;     // null = viewing live/active draft
  onView: (draftId: string | null) => void;
  onCreateNew: () => void;
  onDelete?: (draftId: string) => void;
  onRename?: (draftId: string, name: string | null) => void;
  readOnly?: boolean;
}

function fmt(d: string) {
  try {
    const dt = new Date(d);
    const now = new Date();
    const sameYear = dt.getFullYear() === now.getFullYear();
    return dt.toLocaleDateString(undefined, sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function ChapterDraftPickerInner({ drafts, activeDraftId, viewingDraftId, onView, onCreateNew, onDelete, onRename, readOnly }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChapterDraft | null>(null);
  const [renamingDraft, setRenamingDraft] = useState<ChapterDraft | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const sorted = useMemo(() => [...drafts].sort((a, b) => a.draft_number - b.draft_number), [drafts]);
  const current = viewingDraftId
    ? sorted.find(d => d.id === viewingDraftId)
    : sorted.find(d => d.id === activeDraftId) ?? sorted[sorted.length - 1];

  // Display drafts by their position in the list, not their stored draft_number,
  // so deleting a draft doesn't leave gaps (e.g. "Draft 5" with only 3 drafts).
  const ordinalFor = (d: ChapterDraft) => sorted.findIndex(x => x.id === d.id) + 1 || d.draft_number;
  const labelFor = (d: ChapterDraft) => (d.name && d.name.trim().length > 0) ? d.name : t('story.draftN', { number: ordinalFor(d) });
  const label = current ? labelFor(current) : t('story.draftN', { number: 1 });
  const isViewingOld = !!(viewingDraftId && viewingDraftId !== activeDraftId);

  const commitRename = () => {
    const d = renamingDraft;
    if (!d) return;
    const next = renameValue.trim();
    const prev = (d.name || '').trim();
    if (next !== prev) onRename?.(d.id, next.length ? next : null);
    setRenamingDraft(null);
    setRenameValue('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-foreground/15 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/85 hover:bg-foreground/5 transition-colors"
          {...{"aria-label": t('story.draftSelector')}}
        >
          {isViewingOld && <Eye weight="duotone" className="w-3 h-3 text-primary" />}
          <span>{label}</span>
          <CaretDown weight="bold" className="w-2.5 h-2.5 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" surface="dark" className="w-64">
        {sorted.length === 0 && (
          <div className="px-3 py-3 text-xs text-muted-foreground">{t('story.noDraftsYet')}</div>
        )}
        {sorted.map(d => {
          const isActive = d.id === activeDraftId;
          const isViewing = viewingDraftId ? d.id === viewingDraftId : isActive;
          const canDelete = !readOnly && !!onDelete && sorted.length > 1;
          const canRename = !readOnly && !!onRename;
          return (
            <DropdownMenuItem
              key={d.id}
              onSelect={(e) => {
                e.preventDefault();
                onView(isActive ? null : d.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 py-2 px-3 cursor-pointer group/draft-item focus-within:bg-foreground/10"
            >
              <Check weight="bold" className={`w-3.5 h-3.5 shrink-0 ${isViewing ? '' : 'opacity-0'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 leading-tight">
                  <span className="text-sm font-medium truncate">{labelFor(d)}</span>
                  {isActive && (
                    <span className="text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                      {t('story.draftLive')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] opacity-60 mt-0.5 whitespace-nowrap">
                  {fmt(d.created_at)}
                  {d.updated_at !== d.created_at && ` · ${t('story.draftEdited', { date: fmt(d.updated_at) })}`}
                </div>
              </div>
              {canRename && (
                <button
                  type="button"
                  {...{"aria-label": t('story.renameDraft'), "title": t('story.renameDraft')}}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRenamingDraft(d);
                    setRenameValue(d.name || '');
                    setOpen(false);
                  }}
                  className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded transition-colors opacity-0 group-hover/draft-item:opacity-100 hover:bg-current/10"
                >
                  <PencilSimple weight="duotone" className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  {...{"aria-label": t('story.deleteDraft'), "title": t('story.deleteDraft')}}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingDelete(d);
                    setOpen(false);
                  }}
                  className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded transition-colors opacity-0 group-hover/draft-item:opacity-100 hover:bg-current/10 hover:text-destructive"
                >
                  <Trash weight="duotone" className="w-3.5 h-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          );
        })}
        {!readOnly && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); onCreateNew(); setOpen(false); }}
              className="cursor-pointer py-2 px-3"
            >
              <Plus weight="bold" className="w-3.5 h-3.5 mr-2" />
              <span className="text-sm">{t('story.newDraft')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('story.deleteDraftTitle', { number: pendingDelete ? ordinalFor(pendingDelete) : 1 })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('story.deleteDraftDescription', { number: pendingDelete ? ordinalFor(pendingDelete) : 1 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete?.(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              {t('story.deletePermanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!renamingDraft} onOpenChange={(o) => { if (!o) { setRenamingDraft(null); setRenameValue(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('story.renameDraft')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            }}
            placeholder={renamingDraft ? t('story.draftN', { number: ordinalFor(renamingDraft) }) : ''}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRenamingDraft(null); setRenameValue(''); }}>Cancel</Button>
            <Button onClick={commitRename}>{t('story.renameDraft')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}

export const ChapterDraftPicker = memo(ChapterDraftPickerInner);