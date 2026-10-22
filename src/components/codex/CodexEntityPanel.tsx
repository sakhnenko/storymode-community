import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BookOpen, Link, MapPin, Note, X } from '@/components/ui/icons';
import { MEMORY_KINDS } from '../../../supabase/functions/_shared/project-memory';
import { consolidateFacts, linksOf, pathOf, type GraphNode, type MemoryGraph } from '../../../supabase/functions/_shared/memory-graph';
import { CodexFact } from './CodexFact';
import { CodexContainer } from './CodexContainer';
import { CodexIdentity, type SetIdentity } from './CodexIdentity';
import { linkLabel } from './codex-meta';

type Tab = 'facts' | 'connections' | 'locations';

// Same tab look as the Story sidebar.
const TRIGGER = [
  'h-7 px-2 gap-1 text-xs',
  'text-[hsl(var(--notepad-fg)/0.5)]',
  'hover:bg-[hsl(var(--notepad-fg)/0.05)] hover:text-[hsl(var(--notepad-fg))]',
  'data-[state=active]:bg-[hsl(var(--notepad-fg)/0.07)] data-[state=active]:text-[hsl(var(--notepad-fg))]',
  'data-[state=active]:shadow-none',
].join(' ');

/** Sidebar for one Codex entry. Mount with `key={node.id}` so each entry opens on its facts. */
export function CodexEntityPanel({ node, graph, container, edit, setIdentity, warning, panelStyle, dividerStyle, onSelectNode, onOpenChapter, onEditingChange, onClose }: {
  node: GraphNode;
  graph: MemoryGraph;
  /** For a place: the place it is inside, and the places it could go inside. */
  container?: { parent: GraphNode | null; options: GraphNode[]; onChange: (parentId: string | null) => void };
  edit: (chapterId: string, key: string, disposition: string, correction?: string) => Promise<void>;
  setIdentity: SetIdentity;
  warning: string;
  panelStyle: React.CSSProperties;
  dividerStyle: React.CSSProperties;
  onSelectNode: (id: string) => void;
  onOpenChapter: (chapterId: string, quote?: string) => void;
  onEditingChange: (key: string, editing: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('facts');
  const groups = useMemo(() => consolidateFacts(node.facts, [node.name, ...node.aliases]), [node]);
  const { connections, places } = useMemo(() => {
    const links = linksOf(graph, node.id).sort((a, b) =>
      MEMORY_KINDS.indexOf(a.other.kind) - MEMORY_KINDS.indexOf(b.other.kind) || b.edge.facts.length - a.edge.facts.length);
    return { connections: links.filter(l => l.other.kind !== 'place'), places: links.filter(l => l.other.kind === 'place') };
  }, [graph, node.id]);
  // A person's route: the chapters where the story places them somewhere.
  const path = useMemo(() => pathOf(graph, node).filter(step => step.places.length), [graph, node]);
  const pathPlaceIds = new Set(path.flatMap(step => step.places.map(p => p.id)));
  const otherPlaces = places.filter(l => !pathPlaceIds.has(l.other.id));
  const placeCount = new Set([...pathPlaceIds, ...places.map(l => l.other.id)]).size;

  const count = (n: number) => n > 0 && (
    <span className="ml-0.5 font-mono text-[10px] opacity-60">{n}</span>
  );
  const linkList = (links: typeof connections, empty: string) => links.length ? (
    <ul className="space-y-0.5">
      {links.map(({ edge, other, outgoing }) => (
        <li key={edge.id}>
          <button type="button" onClick={() => onSelectNode(other.id)}
            className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-[hsl(var(--notepad-fg)/0.05)]">
            <span className="min-w-0">{linkLabel(t, edge.type, outgoing, other.name)}</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] opacity-35">{t(`memory.kind.${other.kind}`)}</span>
          </button>
        </li>
      ))}
    </ul>
  ) : <p className="px-3 py-2 text-xs opacity-50">{empty}</p>;

  return (
    <div className="h-full shrink-0 rounded-md p-px story-panel-border max-md:absolute max-md:inset-3 max-md:z-20 max-md:h-auto">
      <aside aria-label={node.name} className="relative flex h-full w-[420px] flex-col overflow-hidden rounded-[5px] shadow-sm max-md:w-full"
        style={panelStyle}>
        <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-2" style={dividerStyle}>
            <TabsList className="h-8 gap-1 bg-transparent p-0">
              <TabsTrigger value="facts" className={TRIGGER}>
                <Note weight="duotone" className="h-3.5 w-3.5" /> {t('codex.tabs.facts')}{count(groups.length)}
              </TabsTrigger>
              <TabsTrigger value="connections" className={TRIGGER}>
                <Link weight="duotone" className="h-3.5 w-3.5" /> {t('codex.tabs.connections')}{count(connections.length)}
              </TabsTrigger>
              <TabsTrigger value="locations" className={TRIGGER}>
                <MapPin weight="duotone" className="h-3.5 w-3.5" /> {t('codex.tabs.locations')}{count(placeCount)}
              </TabsTrigger>
            </TabsList>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label={t('common.close')}>
              <X weight="bold" className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-4 flex items-start gap-3 px-1 pt-1">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-medium leading-snug">{node.name}</h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] opacity-40">{t(`memory.kind.${node.kind}`)}</p>
              </div>
              <div className="flex max-w-[55%] shrink-0 flex-col items-end gap-1.5">
                <CodexIdentity node={node} graph={graph} setIdentity={setIdentity} onSelectNode={onSelectNode} />
                {container && <CodexContainer {...container} />}
              </div>
            </div>
            <TabsContent value="facts" className="m-0">
              {groups.length ? (
                <ul className="space-y-1.5">
                  {groups.map(group => (
                    <CodexFact key={`${group.fact.chapter.id}-${group.fact.claim.key}`} group={group} edit={edit}
                      onOpenChapter={onOpenChapter} onEditingChange={onEditingChange} />
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg bg-[hsl(var(--notepad-fg)/0.035)] px-3.5 py-3">
                  <p className="text-[13px] leading-relaxed opacity-60">
                    {node.appearances.length ? t('codex.noFactsMentioned') : t('codex.noFacts')}
                  </p>
                  {node.appearances.length > 0 && (
                    <ul className="-mx-2 mt-2 space-y-0.5">
                      {node.appearances.map(appearance => (
                        <li key={appearance.chapterId}>
                          <button type="button" title={t('memory.openChapter')} onClick={() => onOpenChapter(appearance.chapterId)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-[hsl(var(--notepad-fg)/0.05)]">
                            <BookOpen weight="duotone" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-45" />
                            <span className="truncate">{appearance.title || t('story.infoUntitled')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="connections" className="m-0">{linkList(connections, t('codex.noConnections'))}</TabsContent>
            <TabsContent value="locations" className="m-0">
              {path.length > 0 && (
                <section aria-labelledby="codex-path" className={otherPlaces.length ? 'mb-4' : undefined}>
                  <h3 id="codex-path" className="mb-2.5 px-1 font-mono text-[10px] uppercase tracking-[0.18em] opacity-40">{t('codex.path')}</h3>
                  <ol className="ml-2.5 space-y-2.5 border-l border-[hsl(var(--notepad-fg)/0.12)] pl-4">
                    {path.map(({ appearance, places: stops }) => (
                      <li key={appearance.chapterId} className="relative">
                        <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[hsl(var(--notepad-fg)/0.35)]" />
                        <button type="button" title={t('memory.openChapter')} onClick={() => onOpenChapter(appearance.chapterId)}
                          className="text-[11px] opacity-50 underline-offset-2 hover:underline hover:opacity-90">
                          {appearance.title || t('story.infoUntitled')}
                        </button>
                        <p className="text-[13px] leading-relaxed">
                          {stops.map((place, i) => (
                            <span key={place.id}>
                              {i > 0 && <span aria-hidden="true" className="opacity-35"> → </span>}
                              <button type="button" onClick={() => onSelectNode(place.id)} className="underline-offset-2 hover:underline">{place.name}</button>
                            </span>
                          ))}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {(otherPlaces.length > 0 || path.length === 0) && linkList(otherPlaces, t('codex.noLocations'))}
            </TabsContent>
          </div>
          {warning && <p role="alert" className="shrink-0 border-t px-4 py-2.5 text-xs text-destructive" style={dividerStyle}>{warning}</p>}
        </Tabs>
      </aside>
    </div>
  );
}
