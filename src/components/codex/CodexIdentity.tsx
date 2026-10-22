import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { memoryNameKey, type MemoryKind } from '../../../supabase/functions/_shared/project-memory';
import type { GraphNode, MemoryGraph } from '../../../supabase/functions/_shared/memory-graph';
import { FAINT_BUTTON } from './codex-meta';

export type SetIdentity = (kind: MemoryKind, a: string, b: string, same: boolean | null, keep?: string) => Promise<void>;

const words = (name: string) => name.trim().split(/\s+/).length;

/**
 * Joining two Codex entries that are one entity ("Young Asari woman" is
 * Olive), and undoing joins made by the author or by a chapter's reveal.
 * One pill holds it all: it shows what else the entry is called and opens
 * those names, the joins with their undo, and the search for another entry.
 */
export function CodexIdentity({ node, graph, setIdentity, onSelectNode }: {
  node: GraphNode;
  graph: MemoryGraph;
  setIdentity: SetIdentity;
  onSelectNode: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<GraphNode | null>(null);
  const [keep, setKeep] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const candidates = useMemo(() => graph.nodes.filter(n => n.kind === node.kind && n.id !== node.id)
    .sort((a, b) => a.name.localeCompare(b.name)), [graph, node]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setFailed(false);
    try { await action(); return true; }
    catch { setFailed(true); return false; }
    finally { setBusy(false); }
  };
  const pick = (other: GraphNode) => {
    setTarget(other);
    // A proper name usually beats a description: "Olive" over "Young Asari woman".
    setKeep(words(other.name) < words(node.name) ? other.name : node.name);
  };
  const join = async () => {
    if (!target) return;
    const a = memoryNameKey(node.name), b = memoryNameKey(target.name), kept = memoryNameKey(keep);
    if (await run(() => setIdentity(node.kind, a, b, true, kept))) {
      setOpen(false);
      setTarget(null);
      onSelectNode(`${node.kind}:${kept}`);
    }
  };

  const joinList = node.joins.map(join => (
    <p key={`${join.by}-${join.a}-${join.b}`} className="flex flex-wrap items-baseline gap-x-2">
      <span className="opacity-70">{join.by === 'author'
        ? t('codex.joined', { name: join.name })
        : t('codex.revealed', { name: join.name, chapter: join.chapterTitle || t('story.infoUntitled') })}</span>
      <button type="button" disabled={busy} className="underline underline-offset-2 opacity-70 hover:opacity-100 disabled:opacity-40"
        onClick={() => void run(() => setIdentity(node.kind, join.a, join.b, join.by === 'author' ? null : false))}>
        {t('codex.separate')}
      </button>
    </p>
  ));
  // The pill names what the entry is also called; it opens the names, joins and "same as" search.
  const label = node.aliases.length ? t('codex.aka', { names: node.aliases.join(', ') }) : t('codex.sameAs');

  return (
      <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setTarget(null); }}>
        <PopoverTrigger asChild>
          <button type="button" className={FAINT_BUTTON} title={label}><span className="truncate">{label}</span></button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0 font-sans">
          {target ? (
            <div className="space-y-3 p-3 text-sm">
              <p className="text-xs text-muted-foreground">{t('codex.showAs')}</p>
              <div className="space-y-1.5" role="radiogroup" aria-label={t('codex.showAs')}>
                {[node.name, target.name].map(name => (
                  <label key={name} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="codex-keep" checked={keep === name} onChange={() => setKeep(name)} />
                    {name}
                  </label>
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-7 px-2.5 font-sans text-xs" disabled={busy} onClick={() => void join()}>{t('codex.join')}</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 font-sans text-xs" disabled={busy} onClick={() => setTarget(null)}>{t('common.back')}</Button>
              </div>
            </div>
          ) : (<>
            {(node.aliases.length > 0 || node.joins.length > 0) && (
              <div className="space-y-1.5 border-b p-3 text-xs">
                {node.aliases.length > 0 && (
                  <p><span className="text-muted-foreground">{t('codex.alsoCalled')}</span> {node.aliases.join(', ')}</p>
                )}
                {joinList}
              </div>
            )}
            <Command>
              <CommandInput placeholder={t('codex.sameAsSearch')} />
              <CommandList>
                <CommandEmpty>{t('codex.sameAsNone')}</CommandEmpty>
                {candidates.map(other => (
                  <CommandItem key={other.id} value={[other.name, ...other.aliases].join(' · ')} onSelect={() => pick(other)}>
                    <span className="truncate">{other.name}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </>)}
          {failed && <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">{t('memory.saveFailed')}</p>}
        </PopoverContent>
      </Popover>
  );
}
