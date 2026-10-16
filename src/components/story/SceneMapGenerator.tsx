import { useEffect, useMemo, useState } from 'react';
import { Check, MapTrifold, SpinnerGap, Sparkle, Warning } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UpgradeModal } from '@/components/UpgradeModal';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/function-error';
import { useAuth } from '@/hooks/useAuth';
import { useUserCredits, notifyCreditsChanged } from '@/hooks/useUserCredits';
import { SELF_HOSTED } from '@/lib/self-hosted';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useStoryChapters } from '@/hooks/useStoryChapters';
import {
  MAP_CELL_SIZE,
  SCENE_MAP_HEIGHT,
  SCENE_MAP_WIDTH,
  estimatedSceneMapCredits,
} from '@/lib/map-constants';
import { uploadMapStickerDataUrl } from '@/lib/map-stickers';
import type { Json } from '@/integrations/supabase/types';

type MapStyle = 'painterly' | 'flat' | 'pixelart';

interface LandmarkPlan {
  label: string;
  prompt: string;
  x: number;
  y: number;
  size: number;
}

interface MapLabelPlan {
  text: string;
  x: number;
  y: number;
  kind: 'location' | 'event';
}

interface SceneMapPlan {
  title: string;
  summary: string;
  baseColor: string;
  backgroundPrompt: string;
  landmarks: LandmarkPlan[];
  labels?: MapLabelPlan[];
}

interface SceneMapGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onMapCreated: (mapId: string) => void;
}

interface StickerOverlay {
  id: string;
  url?: string;
  storage_path?: string;
  dataUrl?: string;
  grid_r: number;
  grid_c: number;
  width: number;
  height: number;
  _type: 'sticker';
}

interface LabelOverlay {
  id: string;
  text: string;
  theme: string;
  themeBg: string;
  themeFg: string;
  grid_r: number;
  grid_c: number;
  _type: 'label';
}


interface MapDrawResult {
  error?: string;
  cells?: Array<{ r: number; c: number; color: string }>;
  rectWidth?: number;
  rectHeight?: number;
  sticker?: { dataUrl?: string };
}

interface ScenePlanResponse {
  error?: string;
  plan?: SceneMapPlan;
  places?: DiscoveredMapPlace[];
  plannerVersion?: number;
}

interface DiscoveredMapPlace {
  name: string;
  kind: 'settlement' | 'forest' | 'mountain' | 'water' | 'structure';
  description: string;
}

const REQUIRED_PLANNER_VERSION = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function messageFromUnknown(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function invokeMapDraw(body: Record<string, unknown>): Promise<MapDrawResult> {
  const { data, error } = await supabase.functions.invoke('ai-map-draw', { body });
  if (error) throw new Error(await functionErrorMessage(error, 'AI Draw failed.'));
  const result = (data || {}) as ScenePlanResponse & MapDrawResult;
  if (result.error) throw new Error(result.error);
  return result;
}

function centerTerrainCells(
  cells: Array<{ r: number; c: number; color: string }>,
  returnedWidth: number,
  returnedHeight: number,
) {
  const result: Record<string, string> = {};
  const scaleR = SCENE_MAP_HEIGHT / Math.max(1, returnedHeight);
  const scaleC = SCENE_MAP_WIDTH / Math.max(1, returnedWidth);
  const minR = -Math.floor(SCENE_MAP_HEIGHT / 2);
  const minC = -Math.floor(SCENE_MAP_WIDTH / 2);

  for (const cell of cells) {
    const r0 = Math.floor(cell.r * scaleR);
    const r1 = Math.max(r0 + 1, Math.floor((cell.r + 1) * scaleR));
    const c0 = Math.floor(cell.c * scaleC);
    const c1 = Math.max(c0 + 1, Math.floor((cell.c + 1) * scaleC));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) result[`${minR + r},${minC + c}`] = cell.color;
    }
  }
  return result;
}

export function SceneMapGenerator({
  open,
  onOpenChange,
  projectId,
  onMapCreated,
}: SceneMapGeneratorProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { credits } = useUserCredits();
  const { verifyCanCreate } = useUserPlan();
  const { chapters, loading: chaptersLoading } = useStoryChapters(projectId);
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [style, setStyle] = useState<MapStyle>('painterly');
  const [plan, setPlan] = useState<SceneMapPlan | null>(null);
  const [places, setPlaces] = useState<DiscoveredMapPlace[]>([]);
  const [selectedPlaceNames, setSelectedPlaceNames] = useState<string[]>([]);
  const [discoveredChapterId, setDiscoveredChapterId] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [partialMapId, setPartialMapId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const selectedChapter = chapters.find(item => item.id === selectedChapterId) || null;
  const selectedPlaces = useMemo(
    () => places.filter(place => selectedPlaceNames.includes(place.name)),
    [places, selectedPlaceNames],
  );
  const estimatedCredits = useMemo(
    () => estimatedSceneMapCredits(selectedPlaces.length),
    [selectedPlaces.length],
  );

  useEffect(() => {
    if (!open || chapters.length === 0) return;
    if (!chapters.some(item => item.id === selectedChapterId)) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, open, selectedChapterId]);

  useEffect(() => {
    if (!open || !selectedChapterId || discoveredChapterId === selectedChapterId) return;
    let cancelled = false;
    setDiscovering(true);
    setPlaces([]);
    setSelectedPlaceNames([]);
    setPlan(null);
    setError(null);

    void supabase.functions.invoke('ai-scene-map-plan', {
      body: { action: 'discover', projectId, chapterId: selectedChapterId },
    }).then(async ({ data, error: invokeError }) => {
      if (cancelled) return;
      if (invokeError) throw new Error(await functionErrorMessage(invokeError, t('story.sceneMap.discoveryFailed')));
      const result = (data || {}) as ScenePlanResponse;
      if (result.error) throw new Error(result.error);
      if (result.plannerVersion !== REQUIRED_PLANNER_VERSION) throw new Error(t('story.sceneMap.plannerOutdated'));
      const discovered = result.places || [];
      setPlaces(discovered);
      setSelectedPlaceNames(discovered.map(place => place.name));
      setDiscoveredChapterId(selectedChapterId);
      notifyCreditsChanged();
    }).catch((caught: unknown) => {
      if (!cancelled) setError(messageFromUnknown(caught, t('story.sceneMap.discoveryFailed')));
    }).finally(() => {
      if (!cancelled) setDiscovering(false);
    });

    return () => { cancelled = true; };
  }, [discoveredChapterId, open, projectId, selectedChapterId, t]);

  const reset = () => {
    if (generating || discovering || planning) return;
    setPlan(null);
    setProgress('');
    setProgressStep(0);
    setError(null);
    setPartialMapId(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && (generating || discovering || planning)) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const verifyMapCapacity = async () => {
    const { count, error: countError } = await supabase
      .from('map_canvas')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    if (countError) throw countError;
    const allowed = await verifyCanCreate('map', count || 0);
    if (!allowed) setShowUpgrade(true);
    return allowed;
  };

  const generate = async (activePlan: SceneMapPlan) => {
    if (!user || generating) return;
    setGenerating(true);
    setProgress(t('story.sceneMap.preparingMap'));
    setProgressStep(0);
    setError(null);
    setPartialMapId(null);

    let mapId: string | null = null;
    let terrainSaved = false;
    const overlays: Array<StickerOverlay | LabelOverlay> = [];

    try {
      const { data: existingMaps, error: mapsError } = await supabase
        .from('map_canvas')
        .select('id, position')
        .eq('project_id', projectId)
        .order('position', { ascending: true });
      if (mapsError) throw mapsError;
      const maps = (existingMaps as Array<{ id: string; position: number }> | null) || [];
      if (!(await verifyCanCreate('map', maps.length))) {
        setShowUpgrade(true);
        return;
      }

      const nextPosition = maps.reduce((max, item) => Math.max(max, item.position ?? -1), -1) + 1;
      const { data: newMap, error: createError } = await supabase
        .from('map_canvas')
        .insert({
          project_id: projectId,
          user_id: user.id,
          title: activePlan.title,
          position: nextPosition,
          bg_color: activePlan.baseColor,
          zoom: 0.5,
          offset_x: 0,
          offset_y: 0,
          cells: {} as Json,
          placed_notebooks: [] as Json,
        })
        .select('id')
        .single();
      if (createError || !newMap) throw createError || new Error(t('story.sceneMap.createFailed'));
      mapId = newMap.id;

      setProgress(t('story.sceneMap.paintingTerrain'));
      setProgressStep(1);
      const terrain = await invokeMapDraw({
        prompt: `${activePlan.backgroundPrompt}. Paint one coherent top-down overview covering the full selected area. Broad terrain only: no named landmarks, isolated buildings, labels, writing, compass, border, or map key.`,
        width: SCENE_MAP_WIDTH,
        height: SCENE_MAP_HEIGHT,
        bgColor: activePlan.baseColor,
        selectedColor: activePlan.baseColor,
        palette: [activePlan.baseColor],
        edges: {
          top: activePlan.baseColor,
          bottom: activePlan.baseColor,
          left: activePlan.baseColor,
          right: activePlan.baseColor,
        },
        style,
        mode: 'pixels',
      });
      const terrainCells = centerTerrainCells(
        Array.isArray(terrain.cells) ? terrain.cells : [],
        Number(terrain.rectWidth) || SCENE_MAP_WIDTH,
        Number(terrain.rectHeight) || SCENE_MAP_HEIGHT,
      );
      if (Object.keys(terrainCells).length === 0) throw new Error(t('story.sceneMap.terrainFailed'));

      const { error: terrainSaveError } = await supabase
        .from('map_canvas')
        .update({ cells: terrainCells as Json, bg_color: activePlan.baseColor })
        .eq('id', mapId);
      if (terrainSaveError) throw terrainSaveError;
      terrainSaved = true;

      const mapWidth = SCENE_MAP_WIDTH * MAP_CELL_SIZE;
      const mapHeight = SCENE_MAP_HEIGHT * MAP_CELL_SIZE;
      const plannedLabels = activePlan.labels?.length
        ? activePlan.labels
        : activePlan.landmarks.map(landmark => ({
            text: landmark.label,
            x: landmark.x,
            y: clamp(landmark.y + landmark.size / 2 + 0.05, 0.08, 0.92),
            kind: 'location' as const,
          }));
      const labelOverlays: LabelOverlay[] = plannedLabels.map(label => ({
        id: crypto.randomUUID(),
        text: label.text,
        theme: 'clean-white',
        themeBg: label.kind === 'event' ? '#fff7ed' : '#ffffff',
        themeFg: label.kind === 'event' ? '#9a3412' : '#262a32',
        grid_r: (clamp(label.y, 0.08, 0.92) - 0.5) * mapHeight,
        grid_c: (clamp(label.x, 0.08, 0.92) - 0.5) * mapWidth,
        _type: 'label',
      }));
      overlays.push(...labelOverlays);
      const { error: labelSaveError } = await supabase
        .from('map_canvas')
        .update({ placed_notebooks: overlays as unknown as Json })
        .eq('id', mapId);
      if (labelSaveError) throw labelSaveError;

      for (let index = 0; index < activePlan.landmarks.length; index++) {
        const landmark = activePlan.landmarks[index];
        setProgress(t('story.sceneMap.drawingLandmark', {
          current: index + 1,
          total: activePlan.landmarks.length,
          label: landmark.label,
        }));
        setProgressStep(index + 2);

        const widthCells = Math.max(8, Math.round(SCENE_MAP_WIDTH * clamp(landmark.size, 0.14, 0.28)));
        const heightCells = widthCells;
        const otherLandmarks = activePlan.landmarks
          .filter((_, otherIndex) => otherIndex !== index)
          .map(item => item.label)
          .join(', ');
        const stickerResult = await invokeMapDraw({
          prompt: `Create the unique map landmark “${landmark.label}”: ${landmark.prompt}. Show exactly one coherent subject from directly overhead. Do not include people, human figures, characters, crowds, animals, duplicated copies, repeated panels, a collage, a contact sheet, multiple variations, text, letters, signage, labels, border, card, scenery tile, or background plate. This must look visibly different from the other map landmarks: ${otherLandmarks || 'none'}.`,
          width: widthCells,
          height: heightCells,
          bgColor: activePlan.baseColor,
          selectedColor: activePlan.baseColor,
          style,
          mode: 'sticker',
          repeatSubjects: false,
        });
        const dataUrl = String(stickerResult.sticker?.dataUrl || '');
        if (!dataUrl) throw new Error(t('story.sceneMap.landmarkFailed', { label: landmark.label }));

        const uploaded = await uploadMapStickerDataUrl(user.id, dataUrl);
        const stickerWidth = widthCells * MAP_CELL_SIZE;
        const stickerHeight = heightCells * MAP_CELL_SIZE;
        const rawWorldX = (clamp(landmark.x, 0.1, 0.9) - 0.5) * mapWidth;
        const rawWorldY = (clamp(landmark.y, 0.12, 0.82) - 0.5) * mapHeight;
        const worldX = clamp(rawWorldX, -mapWidth / 2 + stickerWidth / 2, mapWidth / 2 - stickerWidth / 2);
        const worldY = clamp(rawWorldY, -mapHeight / 2 + stickerHeight / 2, mapHeight / 2 - stickerHeight / 2 - 42);
        const sticker: StickerOverlay = {
          id: crypto.randomUUID(),
          url: uploaded?.url,
          storage_path: uploaded?.path,
          dataUrl: uploaded ? undefined : dataUrl,
          grid_r: worldY,
          grid_c: worldX,
          width: stickerWidth,
          height: stickerHeight,
          _type: 'sticker',
        };
        overlays.push(sticker);

        // Persist each completed landmark. If a later image call fails, the
        // user retains every image already paid for in a usable partial map.
        const { error: overlaySaveError } = await supabase
          .from('map_canvas')
          .update({ placed_notebooks: overlays as unknown as Json })
          .eq('id', mapId);
        if (overlaySaveError) throw overlaySaveError;
        notifyCreditsChanged();
      }

      notifyCreditsChanged();
      onOpenChange(false);
      onMapCreated(mapId);
    } catch (caught: unknown) {
      const message = messageFromUnknown(caught, t('story.sceneMap.generationFailed'));
      if (mapId && terrainSaved) {
        setPartialMapId(mapId);
        setError(t('story.sceneMap.partialFailure', { message }));
      } else {
        if (mapId) await supabase.from('map_canvas').delete().eq('id', mapId);
        setError(message);
      }
      notifyCreditsChanged();
    } finally {
      setGenerating(false);
      setProgress('');
      setProgressStep(0);
    }
  };

  const planAndGenerate = async () => {
    if (!selectedChapter || selectedPlaces.length === 0 || planning || generating) return;
    setPlanning(true);
    setError(null);
    setPartialMapId(null);
    try {
      if (!(await verifyMapCapacity())) return;
      const { data, error: invokeError } = await supabase.functions.invoke('ai-scene-map-plan', {
        body: {
          action: 'plan',
          projectId,
          chapterId: selectedChapter.id,
          selectedPlaces,
        },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError, t('story.sceneMap.analysisFailed')));
      const result = (data || {}) as ScenePlanResponse;
      if (result.error) throw new Error(result.error);
      if (result.plannerVersion !== REQUIRED_PLANNER_VERSION) throw new Error(t('story.sceneMap.plannerOutdated'));
      if (!result.plan) throw new Error(t('story.sceneMap.analysisFailed'));
      setPlan(result.plan);
      notifyCreditsChanged();
      setPlanning(false);
      await generate(result.plan);
    } catch (caught: unknown) {
      setError(messageFromUnknown(caught, t('story.sceneMap.analysisFailed')));
    } finally {
      setPlanning(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapTrifold weight="duotone" className="h-5 w-5" />
              {t('story.sceneMap.title')}
            </DialogTitle>
            <DialogDescription>
              {selectedChapter
                ? t('story.sceneMap.description', { chapter: selectedChapter.title })
                : t('story.sceneMap.chooseChapterDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <label htmlFor="scene-map-chapter" className="text-xs font-medium mb-2 block">
                {t('story.sceneMap.chapter')}
              </label>
              <select
                id="scene-map-chapter"
                value={selectedChapterId}
                onChange={(event) => {
                  setSelectedChapterId(event.target.value);
                  setDiscoveredChapterId('');
                  setError(null);
                }}
                disabled={discovering || planning || generating || chaptersLoading || chapters.length === 0}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                {chapters.length === 0 && (
                  <option value="">{chaptersLoading ? t('story.sceneMap.loadingChapters') : t('story.sceneMap.noChapters')}</option>
                )}
                {chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              {!chaptersLoading && chapters.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">{t('story.sceneMap.noChaptersDetail')}</p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium">{t('story.sceneMap.namedPlaces')}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('story.sceneMap.namedPlacesDetail')}</p>
                </div>
                {places.length > 0 && !discovering && (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPlaceNames(places.map(place => place.name))} disabled={planning || generating}>
                      {t('story.sceneMap.selectAll')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPlaceNames([])} disabled={planning || generating}>
                      {t('story.sceneMap.clearAll')}
                    </Button>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                {discovering ? (
                  <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
                    <SpinnerGap className="h-4 w-4 animate-spin" /> {t('story.sceneMap.discovering')}
                  </div>
                ) : places.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {places.map(place => {
                      const checked = selectedPlaceNames.includes(place.name);
                      return (
                        <label
                          key={place.name}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${checked ? 'border-primary/60 bg-primary/5' : 'border-border/50 hover:bg-foreground/[0.03]'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedPlaceNames(current => checked
                              ? current.filter(name => name !== place.name)
                              : [...current, place.name])}
                            disabled={planning || generating}
                            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{place.name}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground line-clamp-2">{place.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-5 text-sm text-muted-foreground">{t('story.sceneMap.noNamedPlaces')}</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-2">{t('story.sceneMap.artStyle')}</div>
              <div className="grid grid-cols-3 gap-2">
                {(['painterly', 'flat', 'pixelart'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStyle(option)}
                    disabled={planning || generating}
                    className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                      style === option
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                    }`}
                  >
                    {t(`story.sceneMap.style.${option}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* What it will cost: not on a self-hosted install, which has no credits */}
            {!SELF_HOSTED && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Warning weight="duotone" className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <div className="font-medium">{t('story.sceneMap.confirmCost', {
                    images: selectedPlaces.length + 1,
                    credits: estimatedCredits,
                  })}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t('story.sceneMap.selectionCostDetail', {
                      places: selectedPlaces.length,
                      balance: credits.remaining.toLocaleString(),
                    })}
                  </p>
                </div>
              </div>
            </div>
            )}

            {(planning || generating) && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <SpinnerGap className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{planning ? t('story.sceneMap.positioning') : progress}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{t('story.sceneMap.keepOpen')}</span>
                      {generating && plan && (
                        <span className="shrink-0 font-mono">{t('story.sceneMap.progressCount', { current: progressStep, total: plan.landmarks.length + 1 })}</span>
                      )}
                    </div>
                    {generating && plan && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10">
                        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${(progressStep / (plan.landmarks.length + 1)) * 100}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-destructive flex items-start gap-2"><Warning className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}

            <DialogFooter>
              {partialMapId ? (
                <Button onClick={() => { handleOpenChange(false); onMapCreated(partialMapId); }} className="gap-2">
                  <MapTrifold className="h-4 w-4" /> {t('story.sceneMap.openPartial')}
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={discovering || planning || generating}>{t('common.cancel')}</Button>
                  <Button onClick={() => void planAndGenerate()} disabled={discovering || planning || generating || selectedPlaces.length === 0} className="gap-2">
                    {planning || generating ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" weight="bold" />}
                    {planning ? t('story.sceneMap.positioningShort') : generating ? t('story.sceneMap.generating') : t('story.sceneMap.generateSelected')}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} limitType="map" />
    </>
  );
}
