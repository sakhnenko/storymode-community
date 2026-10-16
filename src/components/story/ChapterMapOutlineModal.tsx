import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapTrifold, SpinnerGap } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  buildAsciiMap,
  type AsciiMapDirection as MapDirection,
  type AsciiMapDistance as MapDistance,
} from '@/lib/ascii-map';

type MapPlaceKind = 'settlement' | 'region' | 'forest' | 'mountain' | 'water' | 'structure';

export interface MapRelationshipTestResult {
  places: Array<{
    name: string;
    kind: MapPlaceKind;
    mapScaleProbability: number;
    sceneRelevanceProbability?: number;
    kindConfidence: number;
    latitude?: number;
    longitude?: number;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    direction: MapDirection;
    distance: MapDistance;
    directionConfidence: number;
    distanceConfidence: number;
  }>;
  between: Array<{
    place: string;
    from: string;
    to: string;
    confidence: number;
  }>;
  evaluatedCandidates: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: MapRelationshipTestResult | null;
  loading: boolean;
  onRegenerate: () => void;
}

export function ChapterMapOutlineModal({ open, onOpenChange, result, loading, onRegenerate }: Props) {
  const { t } = useTranslation();
  const asciiMap = useMemo(() => result
    ? buildAsciiMap(result.places, result.relationships, result.between || [])
    : '', [result]);

  const relationshipText = (relationship: MapRelationshipTestResult['relationships'][number]) => {
    if (relationship.direction === 'inside') {
      return t('story.mapRelationshipTest.inside', { to: relationship.to, from: relationship.from });
    }
    if (relationship.direction === 'contains') {
      return t('story.mapRelationshipTest.contains', { to: relationship.to, from: relationship.from });
    }
    if (relationship.direction === 'same_area') {
      return t('story.mapRelationshipTest.sameArea', { to: relationship.to, from: relationship.from });
    }
    if (relationship.direction !== 'unknown') {
      return t('story.mapRelationshipTest.directional', {
        to: relationship.to,
        from: relationship.from,
        direction: t(`story.mapRelationshipTest.direction.${relationship.direction}`),
      });
    }
    return t('story.mapRelationshipTest.distanceOnly', {
      to: relationship.to,
      from: relationship.from,
      distance: t(`story.mapRelationshipTest.distance.${relationship.distance}`),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(780px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5 pr-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 font-mono text-base font-normal">
                <MapTrifold className="h-5 w-5" aria-hidden="true" />
                {t('story.mapRelationshipTest.modalTitle')}
              </DialogTitle>
              <DialogDescription className="mt-1.5 max-w-2xl text-xs">
                {t('story.mapRelationshipTest.modalDescription')}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 font-mono text-xs"
              onClick={onRegenerate}
              disabled={loading}
            >
              {loading
                ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <MapTrifold className="h-3.5 w-3.5" aria-hidden="true" />}
              {loading ? t('story.mapRelationshipTest.running') : t('story.mapRelationshipTest.regenerate')}
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]">
          <ScrollArea className="min-h-0 border-b border-border/60 md:border-b-0 md:border-r">
            <div className="space-y-6 p-5">
              <section>
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  {t('story.mapRelationshipTest.landmarks')}
                </h3>
                {result?.places.length ? (
                  <ul className="mt-3 space-y-2.5">
                    {result.places.map(place => (
                      <li key={place.name} className="text-sm leading-relaxed">
                        <span className="font-medium">{place.name}</span>
                        <span className="text-muted-foreground">
                          {' '}· {t(`story.mapRelationshipTest.kind.${place.kind}`)} · {Math.round((place.sceneRelevanceProbability ?? place.mapScaleProbability) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{t('story.mapRelationshipTest.noLandmarks')}</p>
                )}
              </section>

              <section>
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  {t('story.mapRelationshipTest.relationships')}
                </h3>
                {result && (result.between?.length || result.relationships.length) ? (
                  <ul className="mt-3 space-y-3">
                    {(result.between || []).map(item => (
                      <li key={`between-${item.place}-${item.from}-${item.to}`} className="text-sm leading-relaxed">
                        <span>{t('story.mapRelationshipTest.between', item)}</span>
                        <span className="text-muted-foreground">
                          {' '}· {t('story.mapRelationshipTest.confidence', { value: Math.round(item.confidence * 100) })}
                        </span>
                      </li>
                    ))}
                    {result.relationships.map((relationship, index) => {
                      const distance = relationship.distance === 'unknown'
                        ? ''
                        : t(`story.mapRelationshipTest.distance.${relationship.distance}`);
                      const confidence = Math.round(Math.max(
                        relationship.directionConfidence,
                        relationship.distanceConfidence,
                      ) * 100);
                      return (
                        <li key={`${relationship.from}-${relationship.to}-${index}`} className="text-sm leading-relaxed">
                          <span>{relationshipText(relationship)}</span>
                          {relationship.direction !== 'unknown' && distance && (
                            <span className="text-muted-foreground"> · {distance}</span>
                          )}
                          <span className="text-muted-foreground">
                            {' '}· {t('story.mapRelationshipTest.confidence', { value: confidence })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{t('story.mapRelationshipTest.noRelationships')}</p>
                )}
              </section>
            </div>
          </ScrollArea>

          <div className="flex min-h-[320px] min-w-0 flex-col bg-slate-950 text-slate-100">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
                {t('story.mapRelationshipTest.asciiMap')}
              </h3>
              <span className="text-[10px] text-slate-500">{t('story.mapRelationshipTest.asciiHint')}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-5">
              {asciiMap ? (
                <pre className="min-w-max font-mono text-[11px] leading-[1.45] text-emerald-100 selection:bg-emerald-300/30">
                  {asciiMap}
                </pre>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  {t('story.mapRelationshipTest.noLandmarks')}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
