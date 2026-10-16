import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilSimple, PaintBucket, Square, Circle, Plus, Minus, Hand, Cursor, Notebook, XCircle, Tag, Eyedropper, CornersOut, Sparkle, X as XIcon, PaperPlaneRight, ArrowUUpLeft, ArrowUUpRight, LineSegment, ArrowsClockwise, CaretDown, MagicWand, Question } from '@/components/ui/icons';
import { ViewLoadingOverlay } from '@/components/ui/ViewLoadingOverlay';
import { MapColorPicker } from './MapColorPicker';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserPlan } from '@/hooks/useUserPlan';
import { AiTrialCard } from '@/components/credits/AiTrialCard';
import { MapOnboarding, useMapOnboarding } from '@/components/onboarding/MapOnboarding';
import { pickRandomBackground } from '@/lib/backgrounds';
import { useAiLanguage } from '@/hooks/useAiLanguage';
import { NotebookPicker, type PickedNotebook } from './NotebookPicker';
import { AddLabelModal, type LabelData } from './AddLabelModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getThemeById } from '@/lib/notepad-themes';
import { NotepadCard } from '@/components/notepad/NotepadCard';
import type { Notepad } from '@/hooks/useNotepads';
import { toast } from '@/hooks/use-toast';
import { notifyCreditsChanged } from '@/hooks/useUserCredits';
import { MAP_CELL_SIZE } from '@/lib/map-constants';
import { uploadMapStickerDataUrl } from '@/lib/map-stickers';
import { SELF_HOSTED } from '@/lib/self-hosted';
import type { Json, Tables, TablesUpdate } from '@/integrations/supabase/types';

const CELL_SIZE = MAP_CELL_SIZE;
const EMPTY_COLOR = '#e5e7eb';
const DEFAULT_COLOR = '#4ade80';
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;


type Tool = 'draw' | 'fill' | 'square' | 'circle' | 'line' | 'hand' | 'pointer' | 'notebook' | 'label' | 'delete' | 'eyedropper' | 'ai';
type ShapeTool = 'draw' | 'line' | 'square' | 'circle';
type CellMap = Map<string, string>;
const cellKey = (r: number, c: number) => `${r},${c}`;

/** Darken a hex color by a given ratio (0–1) */
function darkenHex(hex: string, ratio = 0.3): string {
  const clean = hex.replace('#', '');
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) * (1 - ratio));
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) * (1 - ratio));
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) * (1 - ratio));
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface PlacedNotebook {
  id: string;
  notepad_id: string;
  grid_id: string;
  title: string;
  theme: string;
  themeBg: string;
  themeFg: string;
  grid_r: number;
  grid_c: number;
}

export interface PlacedLabel {
  id: string;
  text: string;
  theme: string;
  themeBg: string;
  themeFg: string;
  grid_r: number;
  grid_c: number;
}

export interface PlacedSticker {
  id: string;
  /** Public URL of the uploaded sticker image (preferred). */
  url?: string;
  /** Storage path inside the map-stickers bucket (for cleanup). */
  storage_path?: string;
  /** Legacy: inline base64 for stickers not yet migrated to the bucket. */
  dataUrl?: string;
  /** center position in world pixels */
  grid_r: number;
  grid_c: number;
  /** natural sticker size in world pixels (before zoom) */
  width: number;
  height: number;
  /** rotation in radians, defaults 0 */
  rotation?: number;
}


/** Check if a cell is in the cut corner of a rounded rectangle */
function isRoundedCorner(rr: number, cc: number, minR: number, maxR: number, minC: number, maxC: number): boolean {
  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const radius = Math.max(1, Math.round(Math.min(w, h) * 0.2));
  const corners = [
    [minR, minC], [minR, maxC], [maxR, minC], [maxR, maxC],
  ];
  for (const [cornerR, cornerC] of corners) {
    const distR = Math.abs(rr - cornerR);
    const distC = Math.abs(cc - cornerC);
    if (distR < radius && distC < radius) {
      const dr = radius - distR - 0.5;
      const dc = radius - distC - 0.5;
      if (dr * dr + dc * dc > radius * radius) return true;
    }
  }
  return false;
}

/**
 * Flood fill that works like normal art software:
 * - For painted cells: standard BFS replacing connected same-color cells.
 * - For background cells: BFS within the bounding box of all painted cells.
 *   If the fill escapes the bounding box, the region is unbounded (open area)
 *   and we skip the fill entirely. Only enclosed background regions get filled.
 */
function floodFill(cells: CellMap, bgColor: string, row: number, col: number, fillColor: string): CellMap {
  const key0 = cellKey(row, col);
  const targetColor = cells.get(key0) ?? bgColor;
  if (targetColor === fillColor) return cells;

  const isBackgroundFill = targetColor === bgColor;

  // For background fills, compute bounding box of all painted cells + margin
  let bMinR = row, bMaxR = row, bMinC = col, bMaxC = col;
  if (isBackgroundFill) {
    let hasAny = false;
    cells.forEach((_, key) => {
      const [rs, cs] = key.split(',');
      const r = parseInt(rs), c = parseInt(cs);
      if (!hasAny) { bMinR = r; bMaxR = r; bMinC = c; bMaxC = c; hasAny = true; }
      else { bMinR = Math.min(bMinR, r); bMaxR = Math.max(bMaxR, r); bMinC = Math.min(bMinC, c); bMaxC = Math.max(bMaxC, c); }
    });
    if (!hasAny) return cells; // no painted cells, nothing to enclose
    // Add 1-cell margin around the bounding box
    bMinR--; bMaxR++; bMinC--; bMaxC++;
  }

  const visited = new Set<string>();
  const filled: [number, number][] = [];
  const queue: [number, number][] = [[row, col]];
  let escaped = false;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const key = cellKey(r, c);
    if (visited.has(key)) continue;
    const cellColor = cells.get(key) ?? bgColor;
    if (cellColor !== targetColor) continue;

    // For background fills, check if we escaped the bounding box
    if (isBackgroundFill && (r < bMinR || r > bMaxR || c < bMinC || c > bMaxC)) {
      escaped = true;
      break;
    }

    visited.add(key);
    filled.push([r, c]);

    // Safety cap
    if (visited.size > 50000) break;

    queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }

  // If filling background and the region escaped the bounding box, it's not enclosed — skip
  if (isBackgroundFill && escaped) return cells;

  const newCells = new Map(cells);
  for (const [r, c] of filled) {
    const key = cellKey(r, c);
    if (fillColor === bgColor) {
      newCells.delete(key);
    } else {
      newCells.set(key, fillColor);
    }
  }

  return newCells;
}

interface MapCanvasProps {
  mapId: string | null;
  readOnly?: boolean;
  projectId?: string | null;
}

/** The map row columns the canvas loads. */
type MapRow = Pick<Tables<'map_canvas'>, 'id' | 'user_id' | 'project_id' | 'bg_color' | 'zoom' | 'offset_x' | 'offset_y' | 'cells' | 'placed_notebooks' | 'title'>;

/** A notebook, label or sticker as stored in `placed_notebooks`. */
type StoredOverlay = { _type?: 'notebook' | 'label' | 'sticker' } & Partial<PlacedNotebook & PlacedLabel & PlacedSticker>;

/** What ai-map-draw answers: an error, a sticker, or cells and labels for the selection. */
interface AiDrawResult {
  error?: string;
  sticker?: { dataUrl?: string };
  cells?: Array<{ r: number; c: number; color: string }>;
  labels?: Array<{ r: number; c: number; text: string; color?: string }>;
  rectWidth?: number;
  rectHeight?: number;
}

async function withClientTimeout<T>(thenable: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(thenable), timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export function MapCanvas({ mapId, readOnly, projectId }: MapCanvasProps) {
  const { t } = useTranslation();
  const aiLanguage = useAiLanguage(projectId ?? null);
  const { user } = useAuth();
  const { hasAi } = useUserPlan();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pillsLayerRef = useRef<HTMLDivElement>(null);

  const cellsRef = useRef<CellMap>(new Map());
  const bgColorRef = useRef(EMPTY_COLOR);
  const [, forceRender] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const lastLoadedMapIdRef = useRef<string | null>(null);
  const mapCellsLoadedRef = useRef(false);
  const mapOverlaysLoadedRef = useRef(false);
  // True only once bg/zoom/offset were successfully read from the DB. Prevents
  // a failed load from persisting the default background over the real one.
  const mapMetaLoadedRef = useRef(false);

  const [selectedColor, setSelectedColor] = useState(() => {
    try {
      const stored = localStorage.getItem('map-last-color');
      return stored || DEFAULT_COLOR;
    } catch { return DEFAULT_COLOR; }
  });
  const [tool, setTool] = useState<Tool>('pointer');
  const [brushSize, setBrushSize] = useState(1);
  const brushSizeRef = useRef(1);
  const preEyedropperToolRef = useRef<Tool | null>(null);
  const [showBrushPicker, setShowBrushPicker] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [zoomDisplay, setZoomDisplay] = useState(100);
  const [showNotebookPicker, setShowNotebookPicker] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const lastLabelClickRef = useRef<{ id: string; time: number } | null>(null);
  const [cursorPill, setCursorPill] = useState<PickedNotebook | null>(null);
  const [cursorLabel, setCursorLabel] = useState<LabelData | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const placedNotebooksRef = useRef<PlacedNotebook[]>([]);
  const [placedNotebooks, setPlacedNotebooks] = useState<PlacedNotebook[]>([]);
  const placedLabelsRef = useRef<PlacedLabel[]>([]);
  const [placedLabels, setPlacedLabels] = useState<PlacedLabel[]>([]);
  const placedStickersRef = useRef<PlacedSticker[]>([]);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [mapIsEmpty, setMapIsEmpty] = useState(false);
  const draggingNotebookRef = useRef<{ id: string; offsetR: number; offsetC: number } | null>(null);
  const draggingLabelRef = useRef<{ id: string; offsetR: number; offsetC: number } | null>(null);
  const draggingStickerRef = useRef<{ id: string; offsetR: number; offsetC: number } | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const rotatingStickerRef = useRef<{ id: string; startAngle: number; startRotation: number } | null>(null);
  const resizingStickerRef = useRef<{ id: string; startWidth: number; startHeight: number; startDist: number } | null>(null);

  // Undo/redo snapshots include AI stickers so removing one can be reversed.
  type Snapshot = { cells: CellMap; bg: string; stickers: PlacedSticker[] };
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const MAX_UNDO = 50;

  const takeSnapshot = useCallback((): Snapshot => ({
    cells: new Map(cellsRef.current),
    bg: bgColorRef.current,
    stickers: placedStickersRef.current.map(sticker => ({ ...sticker })),
  }), []);

  const pushUndo = useCallback(() => {
    undoStack.current.push(takeSnapshot());
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
  }, [takeSnapshot]);

  const applySnapshot = useCallback((snap: Snapshot) => {
    const stickers = snap.stickers.map(sticker => ({ ...sticker }));
    cellsRef.current = new Map(snap.cells);
    bgColorRef.current = snap.bg;
    placedStickersRef.current = stickers;
    setPlacedStickers(stickers);
    setSelectedStickerId(null);
    needsRedraw.current = true;
  }, []);

  const [showShapePicker, setShowShapePicker] = useState(false);
  // Close shape/brush pickers on outside click (color picker handles its own).
  useEffect(() => {
    if (!showShapePicker && !showBrushPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest?.('[data-toolbar-popover]')) return;
      setShowShapePicker(false);
      setShowBrushPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showShapePicker, showBrushPicker]);
  const [lastShapeTool, setLastShapeTool] = useState<ShapeTool>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem('storymode.lastShapeTool') : null;
    return v === 'line' || v === 'square' || v === 'circle' ? v : 'draw';
  });
  const [previewNotepad, setPreviewNotepad] = useState<Notepad | null>(null);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<{ title: string; theme: string } | null>(null);
  const previewNotepadRef = useRef<Notepad | null>(null);
  useEffect(() => { previewNotepadRef.current = previewNotepad; }, [previewNotepad]);
  const notepadCacheRef = useRef<Map<string, Notepad>>(new Map());
  // Open the preview sidebar shell immediately using pill data (title/theme),
  // then fetch the full notepad in the background. NotepadCard only mounts
  // once the real content is loaded to avoid autosave clobbering with empty content.
  const openPreviewForPlacement = useCallback((nb: PlacedNotebook) => {
    setPreviewFocused(true);
    const cached = notepadCacheRef.current.get(nb.notepad_id);
    if (cached) {
      setPreviewLoading(null);
      setPreviewNotepad(cached);
      return;
    }
    setPreviewNotepad(null);
    setPreviewLoading({ title: nb.title, theme: nb.theme });
    supabase.from('notepads').select('*').eq('id', nb.notepad_id).maybeSingle().then(({ data }) => {
      setPreviewLoading(null);
      if (!data) return;
      const np = data as unknown as Notepad;
      notepadCacheRef.current.set(np.id, np);
      setPreviewNotepad(np);
    });
  }, []);
  const draggedRef = useRef(false); // true if pointer moved significantly since pointerDown
  const [explosions, setExplosions] = useState<{ id: string; x: number; y: number; color: string; particles: { angle: number; dist: number; size: number; delay: number }[] }[]>([]);

  // AI Draw state
  const [aiPrompt, setAiPrompt] = useState<{ minR: number; maxR: number; minC: number; maxC: number; centerX: number; centerY: number } | null>(null);
  const [aiPromptText, setAiPromptText] = useState('');
  const [aiStyle, setAiStyle] = useState<'painterly' | 'flat' | 'pixelart'>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem('storymode.aiDrawStyle') : null;
    return v === 'flat' || v === 'pixelart' ? v : 'painterly';
  });
  // AI Draw always produces stickers (pixel-into-map mode has been removed).
  const aiMode = 'sticker' as const;
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDrawing, setAiDrawing] = useState<{ minR: number; maxR: number; minC: number; maxC: number; prompt: string; flavor: string; fading: boolean } | null>(null);
  const aiOverlayRef = useRef<HTMLDivElement | null>(null);
  const recentColorsRef = useRef<string[]>([]);

  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  const isPainting = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const squareStart = useRef<{ r: number; c: number } | null>(null);
  const squareEnd = useRef<{ r: number; c: number } | null>(null);
  const spaceHeld = useRef(false);
  const rafId = useRef(0);
  const needsRedraw = useRef(true);
  const selectedColorRef = useRef(selectedColor);
  const toolRef = useRef(tool);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  selectedColorRef.current = selectedColor;
  useEffect(() => {
    try { localStorage.setItem('map-last-color', selectedColor); } catch { /* storage unavailable: not remembered */ }
  }, [selectedColor]);
  toolRef.current = tool;
  brushSizeRef.current = brushSize;
  useEffect(() => {
    if (tool === 'draw' || tool === 'line' || tool === 'square' || tool === 'circle') {
      setLastShapeTool(tool);
      try { localStorage.setItem('storymode.lastShapeTool', tool); } catch { /* storage unavailable: not remembered */ }
    }
  }, [tool]);

  const mapIdRef = useRef(mapId);
  mapIdRef.current = mapId;

  // -- Persistence: save to DB with debounce --
  const saveToDb = useCallback(() => {
    if (!user || !mapIdRef.current || !loadedRef.current || readOnly) return;
    const cellsObj: Record<string, string> = {};
    cellsRef.current.forEach((v, k) => { cellsObj[k] = v; });

    const payload: TablesUpdate<'map_canvas'> = {
      offset_x: offsetRef.current.x,
      offset_y: offsetRef.current.y,
    };

    if (mapMetaLoadedRef.current) {
      payload.bg_color = bgColorRef.current;
      payload.zoom = zoomRef.current;
    }

    if (mapCellsLoadedRef.current) {
      payload.cells = cellsObj;
    }

    if (mapOverlaysLoadedRef.current) {
      payload.placed_notebooks = [
        ...placedNotebooksRef.current.map(nb => ({ ...nb, _type: 'notebook' })),
        ...placedLabelsRef.current.map(lb => ({ ...lb, _type: 'label' })),
        ...placedStickersRef.current.map(st => {
          // Drop the heavy inline base64 once the sticker has a bucket URL.
          const { dataUrl, ...rest } = st;
          return st.url ? { ...rest, _type: 'sticker' } : { ...st, _type: 'sticker' };
        }),
      ];
    }

    supabase.from('map_canvas').update(payload).eq('id', mapIdRef.current).then(() => {});
  }, [user, readOnly]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveToDb, 1000);
  }, [saveToDb]);

  const bump = useCallback(() => {
    forceRender(n => n + 1);
    scheduleSave();
  }, [scheduleSave]);

  // -- Load from DB when mapId changes --
  useEffect(() => {
    if (!mapId) return;
    // Avoid reloading when the auth hook emits a new user object due to
    // background token refreshes (e.g. after the tab regains focus).
    if (loadedRef.current && lastLoadedMapIdRef.current === mapId) return;
    lastLoadedMapIdRef.current = mapId;
    setLoaded(false);
    loadedRef.current = false;
    setMapIsEmpty(false);
    mapCellsLoadedRef.current = false;
    mapOverlaysLoadedRef.current = false;
    mapMetaLoadedRef.current = false;
    // Reset state for new map
    cellsRef.current = new Map();
    bgColorRef.current = EMPTY_COLOR;
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    placedNotebooksRef.current = [];
    setPlacedNotebooks([]);
    placedLabelsRef.current = [];
    setPlacedLabels([]);
    placedStickersRef.current = [];
    setPlacedStickers([]);
    undoStack.current = [];
    redoStack.current = [];

    let cancelled = false;

    const loadMap = async () => {
      try {
        // Direct REST query first (no edge-function cold start). Falls back
        // to the load-map-canvas function only if REST fails or times out.
        let mapData: MapRow | null = null;
        try {
          const { data, error } = await withClientTimeout(
            supabase
              .from('map_canvas')
              .select('id,user_id,project_id,bg_color,zoom,offset_x,offset_y,cells,placed_notebooks,title')
              .eq('id', mapId)
              .maybeSingle(),
            4000,
            'Loading map'
          );
          if (error) throw error;
          mapData = data;
        } catch (restErr) {
          console.warn('REST map load failed, falling back to edge function:', restErr);
          const { data: functionData, error: functionError } = await withClientTimeout(
            supabase.functions.invoke('load-map-canvas', { body: { mapId } }),
            10000,
            'Loading map (fallback)'
          );
          if (functionError) throw functionError;
          mapData = (functionData as { map?: MapRow } | null)?.map ?? null;
        }
        if (cancelled) return;
        if (!mapData) throw new Error('Map not found');

        bgColorRef.current = mapData.bg_color ?? EMPTY_COLOR;
        zoomRef.current = mapData.zoom ?? 1;
        offsetRef.current = { x: mapData.offset_x ?? 0, y: mapData.offset_y ?? 0 };
        mapMetaLoadedRef.current = true;
        setZoomDisplay(Math.round(zoomRef.current * 100));

        const cellsObj = mapData.cells as Record<string, string> | null;
        if (cellsObj && typeof cellsObj === 'object') {
          const cellMap = new Map<string, string>();
          Object.entries(cellsObj).forEach(([k, v]) => cellMap.set(k, v));
          cellsRef.current = cellMap;
        }
        mapCellsLoadedRef.current = true;
        loadedRef.current = true;
        setLoaded(true);
        needsRedraw.current = true;

        // Notebooks, labels and stickers share one JSON column, told apart by `_type`.
        const pn = mapData.placed_notebooks as unknown as StoredOverlay[] | null;
        if (Array.isArray(pn) && pn.length > 0) {
          const notebooks = pn.filter((n): n is StoredOverlay & PlacedNotebook => n._type !== 'label' && n._type !== 'sticker');
          const labels = pn.filter((n): n is StoredOverlay & PlacedLabel => n._type === 'label');
          const stickers = pn.filter((n): n is StoredOverlay & PlacedSticker => n._type === 'sticker');
          
          const notepadIds = notebooks.map((n) => n.notepad_id);
          if (notepadIds.length > 0) {
            const { data: freshNotepads } = await withClientTimeout(
              supabase
                .from('notepads')
                .select('id, title')
                .in('id', notepadIds),
              3000,
              'Loading map notebook titles'
            ).catch(() => ({ data: null }));
            const titleMap = new Map<string, string>((freshNotepads || []).map((n) => [n.id, n.title]));
            const synced = notebooks.map((nb) => ({
              ...nb,
              title: titleMap.get(nb.notepad_id) ?? nb.title,
            }));
            placedNotebooksRef.current = synced;
            setPlacedNotebooks(synced);
          }
          
          if (labels.length > 0) {
            placedLabelsRef.current = labels;
            setPlacedLabels(labels);
          }

          if (stickers.length > 0) {
            placedStickersRef.current = stickers;
            setPlacedStickers(stickers);
            // Lazy migration: upload any inline-base64 stickers to the bucket
            // and swap their dataUrl for a public URL. Runs in the background.
            const legacy = stickers.filter((s) => s.dataUrl && !s.url);
            if (legacy.length > 0) {
              (async () => {
                let mutated = false;
                for (const st of legacy) {
                  if (cancelled) return;
                  const uploaded = await uploadStickerDataUrl(st.dataUrl);
                  if (!uploaded) continue;
                  placedStickersRef.current = placedStickersRef.current.map(s =>
                    s.id === st.id
                      ? { ...s, url: uploaded.url, storage_path: uploaded.path, dataUrl: undefined }
                      : s
                  );
                  mutated = true;
                }
                if (mutated && !cancelled) {
                  setPlacedStickers(placedStickersRef.current);
                  scheduleSave();
                }
              })();
            }
          }
        }
        mapOverlaysLoadedRef.current = true;
        needsRedraw.current = true;
        setMapIsEmpty(
          cellsRef.current.size === 0 &&
            (!Array.isArray(mapData.placed_notebooks) || mapData.placed_notebooks.length === 0),
        );
      } catch (error) {
        console.warn('Map load fell back to partial state:', error);
        loadedRef.current = true;
        setLoaded(true);
        needsRedraw.current = true;
      }
    };

    void loadMap();
    return () => { cancelled = true; };
  }, [mapId, readOnly, user?.id]);

  // Subscribe to notepad title changes to keep pills in sync
  useEffect(() => {
    const channel = supabase
      .channel('notepad-title-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notepads' }, (payload) => {
        const updated = payload.new as { id: string; title: string };
        if (!updated) return;
        const current = placedNotebooksRef.current;
        const match = current.find(nb => nb.notepad_id === updated.id);
        if (match && match.title !== updated.title) {
          const next = current.map(nb => nb.notepad_id === updated.id ? { ...nb, title: updated.title } : nb);
          placedNotebooksRef.current = next;
          setPlacedNotebooks(next);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const screenToGrid = useCallback((sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { r: 0, c: 0 };
    const zoom = zoomRef.current;
    const off = offsetRef.current;
    const wx = (sx - rect.left - rect.width / 2) / zoom - off.x;
    const wy = (sy - rect.top - rect.height / 2) / zoom - off.y;
    return { r: Math.floor(wy / CELL_SIZE), c: Math.floor(wx / CELL_SIZE) };
  }, []);

  // Returns world-space pixel coordinates (no snapping)
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { wx: 0, wy: 0 };
    const zoom = zoomRef.current;
    const off = offsetRef.current;
    const wx = (sx - rect.left - rect.width / 2) / zoom - off.x;
    const wy = (sy - rect.top - rect.height / 2) / zoom - off.y;
    return { wx, wy };
  }, []);

  // ---- Canvas rendering ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const zoom = zoomRef.current;
    const off = offsetRef.current;
    const cells = cellsRef.current;
    const bg = bgColorRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Fill entire canvas with background color
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply camera
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(off.x, off.y);

    // Visible range
    const halfW = w / 2 / zoom;
    const halfH = h / 2 / zoom;
    const minR = Math.floor((-halfH - off.y) / CELL_SIZE) - 1;
    const maxR = Math.ceil((halfH - off.y) / CELL_SIZE) + 1;
    const minC = Math.floor((-halfW - off.x) / CELL_SIZE) - 1;
    const maxC = Math.ceil((halfW - off.x) / CELL_SIZE) + 1;

    // Draw colored cells (only non-background)
    const colorBuckets = new Map<string, [number, number][]>();
    cells.forEach((color, key) => {
      const [rs, cs] = key.split(',');
      const r = parseInt(rs), c = parseInt(cs);
      if (r < minR || r > maxR || c < minC || c > maxC) return;
      let bucket = colorBuckets.get(color);
      if (!bucket) { bucket = []; colorBuckets.set(color, bucket); }
      bucket.push([r, c]);
    });
    colorBuckets.forEach((positions, color) => {
      ctx.fillStyle = color;
      for (const [r, c] of positions) {
        ctx.fillRect(c * CELL_SIZE + 0.5, r * CELL_SIZE + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
      }
    });

    // Grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let r = minR; r <= maxR + 1; r++) {
      ctx.moveTo(minC * CELL_SIZE, r * CELL_SIZE);
      ctx.lineTo((maxC + 1) * CELL_SIZE, r * CELL_SIZE);
    }
    for (let c = minC; c <= maxC + 1; c++) {
      ctx.moveTo(c * CELL_SIZE, minR * CELL_SIZE);
      ctx.lineTo(c * CELL_SIZE, (maxR + 1) * CELL_SIZE);
    }
    ctx.stroke();

    // Shape preview overlay
    const ss = squareStart.current;
    const se = squareEnd.current;
    const currentTool = toolRef.current;
    if (ss && se && (currentTool === 'square' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'ai') && isPainting.current) {
      const sr = Math.min(ss.r, se.r), er = Math.max(ss.r, se.r);
      const sc = Math.min(ss.c, se.c), ec = Math.max(ss.c, se.c);
      const color = selectedColorRef.current;
      if (currentTool === 'ai') {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'hsl(263 70% 60%)';
        ctx.lineWidth = 2 / zoomRef.current;
        ctx.setLineDash([6 / zoomRef.current, 4 / zoomRef.current]);
        ctx.strokeRect(sc * CELL_SIZE, sr * CELL_SIZE, (ec - sc + 1) * CELL_SIZE, (er - sr + 1) * CELL_SIZE);
        ctx.restore();
      } else if (currentTool === 'line') {
        ctx.save();
        ctx.strokeStyle = color === EMPTY_COLOR ? '#999' : color;
        ctx.lineWidth = Math.max(2 / zoomRef.current, CELL_SIZE * brushSizeRef.current);
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(ss.c * CELL_SIZE + CELL_SIZE / 2, ss.r * CELL_SIZE + CELL_SIZE / 2);
        ctx.lineTo(se.c * CELL_SIZE + CELL_SIZE / 2, se.r * CELL_SIZE + CELL_SIZE / 2);
        ctx.stroke();
        ctx.restore();
      } else {
      ctx.fillStyle = color === EMPTY_COLOR ? 'rgba(200,200,200,0.5)' : color;
      ctx.globalAlpha = 0.45;

      if (currentTool === 'square') {
        // Render cell-by-cell to show rounded corners
        for (let rr = sr; rr <= er; rr++) {
          for (let cc = sc; cc <= ec; cc++) {
            if (isRoundedCorner(rr, cc, sr, er, sc, ec)) continue;
            ctx.fillRect(cc * CELL_SIZE + 0.5, rr * CELL_SIZE + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
          }
        }
      } else {
        const cx = (sc + ec + 1) / 2 * CELL_SIZE;
        const cy = (sr + er + 1) / 2 * CELL_SIZE;
        const rx = (ec - sc + 1) / 2 * CELL_SIZE;
        const ry = (er - sr + 1) / 2 * CELL_SIZE;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.strokeStyle = color === EMPTY_COLOR ? '#999' : color;
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);

      if (currentTool === 'square') {
        // Outline: just use a rounded rect path approximation
        for (let rr = sr; rr <= er; rr++) {
          for (let cc = sc; cc <= ec; cc++) {
            if (isRoundedCorner(rr, cc, sr, er, sc, ec)) continue;
            ctx.strokeRect(cc * CELL_SIZE + 0.5, rr * CELL_SIZE + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
          }
        }
      } else {
        const cx = (sc + ec + 1) / 2 * CELL_SIZE;
        const cy = (sr + er + 1) / 2 * CELL_SIZE;
        const rx = (ec - sc + 1) / 2 * CELL_SIZE;
        const ry = (er - sr + 1) / 2 * CELL_SIZE;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      }
    }
  }, []);

  // RAF loop
  useEffect(() => {
    const loop = () => {
      if (needsRedraw.current) { draw(); needsRedraw.current = false; }
      // Sync pills overlay with camera
      if (pillsLayerRef.current && containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const z = zoomRef.current;
        const o = offsetRef.current;
        pillsLayerRef.current.style.transform = `translate(${w / 2}px, ${h / 2}px) scale(${z}) translate(${o.x}px, ${o.y}px)`;
      }
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [draw]);

  useEffect(() => { needsRedraw.current = true; });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => { needsRedraw.current = true; });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const setCellValue = useCallback((r: number, c: number, color: string) => {
    const key = cellKey(r, c);
    const bg = bgColorRef.current;
    const existing = cellsRef.current.get(key) ?? bg;
    if (existing === color) return;
    // If painting with the background color, just remove the cell entry
    if (color === bg) {
      cellsRef.current.delete(key);
    } else {
      cellsRef.current.set(key, color);
    }
    needsRedraw.current = true;
  }, []);

  const paintBrush = useCallback((centerR: number, centerC: number, color: string) => {
    const size = brushSizeRef.current;
    if (size <= 1) { setCellValue(centerR, centerC, color); return; }
    const radius = size / 2;
    const offset = Math.floor(radius);
    for (let dr = -offset; dr <= offset; dr++) {
      for (let dc = -offset; dc <= offset; dc++) {
        if (dr * dr + dc * dc <= radius * radius) {
          setCellValue(centerR + dr, centerC + dc, color);
        }
      }
    }
  }, [setCellValue]);

  // ---- Helper: update placed notebooks ----
  const updatePlacedNotebooks = useCallback((updater: (prev: PlacedNotebook[]) => PlacedNotebook[]) => {
    const next = updater(placedNotebooksRef.current);
    placedNotebooksRef.current = next;
    setPlacedNotebooks(next);
  }, []);

  // ---- Helper: update placed labels ----
  const updatePlacedLabels = useCallback((updater: (prev: PlacedLabel[]) => PlacedLabel[]) => {
    const next = updater(placedLabelsRef.current);
    placedLabelsRef.current = next;
    setPlacedLabels(next);
  }, []);

  const updatePlacedStickers = useCallback((updater: (prev: PlacedSticker[]) => PlacedSticker[]) => {
    const next = updater(placedStickersRef.current);
    placedStickersRef.current = next;
    setPlacedStickers(next);
  }, []);

  // Upload a base64 sticker PNG to the map-stickers bucket and return its
  // public URL + storage path. Falls back to null on any failure so the
  // caller can keep the inline dataUrl.
  const uploadStickerDataUrl = useCallback(async (dataUrl: string): Promise<{ url: string; path: string } | null> => {
    if (!user?.id) return null;
    return uploadMapStickerDataUrl(user.id, dataUrl);
  }, [user?.id]);

  // ---- Notebook pick handler ----
  const handleNotebookPick = useCallback((picked: PickedNotebook) => {
    setCursorPill(picked);
    setShowNotebookPicker(false);
  }, []);

  const spawnExplosion = useCallback((screenX: number, screenY: number, color: string) => {
    const id = crypto.randomUUID();
    const particles = Array.from({ length: 12 }, () => ({
      angle: Math.random() * 360,
      dist: 30 + Math.random() * 60,
      size: 4 + Math.random() * 6,
      delay: Math.random() * 0.05,
    }));
    setExplosions(prev => [...prev, { id, x: screenX, y: screenY, color, particles }]);
    setTimeout(() => setExplosions(prev => prev.filter(e => e.id !== id)), 600);
  }, []);


  const handleLabelAdd = useCallback((label: LabelData) => {
    if (editingLabelId) {
      // Update existing label
      updatePlacedLabels(prev => prev.map(lb => lb.id === editingLabelId
        ? { ...lb, text: label.text, theme: label.theme, themeBg: label.themeBg, themeFg: label.themeFg }
        : lb
      ));
      setEditingLabelId(null);
      setShowLabelModal(false);
      bump();
    } else {
      setCursorLabel(label);
      setShowLabelModal(false);
    }
  }, [editingLabelId, updatePlacedLabels, bump]);

  // ---- Pointer handlers ----
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-toolbar]')) return;
    // If a notepad preview is open, a click anywhere on the map (outside the
    // sidebar itself) should close it — and still be processed as a normal
    // click so hitting another pill opens it in one gesture.
    if (previewNotepadRef.current && !(e.target as HTMLElement).closest?.('[data-map-sidebar]')) {
      setPreviewFocused(false);
      setPreviewNotepad(null); setPreviewLoading(null);
    }

    // In read-only mode, only allow panning and clicking notebook pills to preview
    if (readOnly) {
      if (e.button === 1 || spaceHeld.current || toolRef.current === 'hand') {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
        e.preventDefault();
        return;
      }
      // Allow clicking notebook pills to open read-only preview
      if (e.button === 0) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const zoom = zoomRef.current;
          const off = offsetRef.current;
          const hit = placedNotebooksRef.current.find(nb => {
            const px = (nb.grid_c + off.x) * zoom + rect.width / 2;
            const py = (nb.grid_r + off.y) * zoom + rect.height / 2;
            const scale = Math.max(0.75, Math.min(40 / 28, zoom));
            const pillW = 130 * scale;
            const pillH = 28 * scale;
            return mx >= px - pillW / 2 && mx <= px + pillW / 2 && my >= py - pillH / 2 && my <= py + pillH / 2;
          });
          if (hit) {
            openPreviewForPlacement(hit);
            e.preventDefault();
            return;
          }
        }
        // Allow panning with left click too in read-only
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
      }
      return;
    }
    // Notebook placement mode – click to place
    if (cursorPill && toolRef.current === 'notebook') {
      const { wx, wy } = screenToWorld(e.clientX, e.clientY);
      const newPlacement: PlacedNotebook = {
        id: crypto.randomUUID(),
        notepad_id: cursorPill.notepad_id,
        grid_id: cursorPill.grid_id,
        title: cursorPill.title,
        theme: cursorPill.theme,
        themeBg: cursorPill.themeBg,
        themeFg: cursorPill.themeFg,
        grid_r: wy,
        grid_c: wx,
      };
      updatePlacedNotebooks(prev => [...prev, newPlacement]);
      setCursorPill(null);
      setTool('pointer');
      bump();
      return;
    }

    // Label placement mode – click to place
    if (cursorLabel && toolRef.current === 'label') {
      const { wx, wy } = screenToWorld(e.clientX, e.clientY);
      const newLabel: PlacedLabel = {
        id: crypto.randomUUID(),
        text: cursorLabel.text,
        theme: cursorLabel.theme,
        themeBg: cursorLabel.themeBg,
        themeFg: cursorLabel.themeFg,
        grid_r: wy,
        grid_c: wx,
      };
      updatePlacedLabels(prev => [...prev, newLabel]);
      setCursorLabel(null);
      setTool('pointer');
      bump();
      return;
    }

    if (e.button === 1 || spaceHeld.current || toolRef.current === 'hand') {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
      e.preventDefault();
      return;
    }

    // Pointer tool: check if clicking on a placed notebook or label using screen-space hit test
    if ((toolRef.current === 'pointer' || toolRef.current === 'delete') && e.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const zoom = zoomRef.current;
        const off = offsetRef.current;

        // Hit test labels FIRST (labels/pills always sit above stickers for interaction)
        const hitLabel = placedLabelsRef.current.find(lb => {
          const px = (lb.grid_c + off.x) * zoom + rect.width / 2;
          const py = (lb.grid_r + off.y) * zoom + rect.height / 2;
          const scale = Math.max(0.75, Math.min(40 / 28, zoom));
          const pillW = 130 * scale;
          const pillH = 28 * scale;
          return mx >= px - pillW / 2 && mx <= px + pillW / 2 && my >= py - pillH / 2 && my <= py + pillH / 2;
        });
        if (hitLabel) {
          if (toolRef.current === 'delete') {
            spawnExplosion(e.clientX, e.clientY, hitLabel.themeBg);
            updatePlacedLabels(prev => prev.filter(lb => lb.id !== hitLabel.id));
            bump();
            e.preventDefault();
            return;
          }
          // Double-click detection for editing
          const now = Date.now();
          const last = lastLabelClickRef.current;
          if (last && last.id === hitLabel.id && now - last.time < 400) {
            // Double click — open edit modal
            setEditingLabelId(hitLabel.id);
            setShowLabelModal(true);
            lastLabelClickRef.current = null;
            draggingLabelRef.current = null;
            isPainting.current = false;
            e.preventDefault();
            return;
          }
          lastLabelClickRef.current = { id: hitLabel.id, time: now };

          const { wx, wy } = screenToWorld(e.clientX, e.clientY);
          draggingLabelRef.current = { id: hitLabel.id, offsetR: wy - hitLabel.grid_r, offsetC: wx - hitLabel.grid_c };
          pointerDownPos.current = { x: e.clientX, y: e.clientY };
          draggedRef.current = false;
          isPainting.current = true;
          e.preventDefault();
          return;
        }

        // Hit test notebooks
        const hit = placedNotebooksRef.current.find(nb => {
          const px = (nb.grid_c + off.x) * zoom + rect.width / 2;
          const py = (nb.grid_r + off.y) * zoom + rect.height / 2;
          const scale = Math.max(0.75, Math.min(40 / 28, zoom));
          const pillW = 130 * scale;
          const pillH = 28 * scale;
          return mx >= px - pillW / 2 && mx <= px + pillW / 2 && my >= py - pillH / 2 && my <= py + pillH / 2;
        });
        if (hit) {
          if (toolRef.current === 'delete') {
            spawnExplosion(e.clientX, e.clientY, hit.themeBg);
            updatePlacedNotebooks(prev => prev.filter(nb => nb.id !== hit.id));
            bump();
            e.preventDefault();
            return;
          }
          const { wx, wy } = screenToWorld(e.clientX, e.clientY);
          draggingNotebookRef.current = { id: hit.id, offsetR: wy - hit.grid_r, offsetC: wx - hit.grid_c };
          pointerDownPos.current = { x: e.clientX, y: e.clientY };
          draggedRef.current = false;
          isPainting.current = true;
          e.preventDefault();
          return;
        }

        // Hit test stickers last (pills/labels take priority when overlapping)
        const hitSticker = [...placedStickersRef.current].reverse().find(st => {
          const px = (st.grid_c + off.x) * zoom + rect.width / 2;
          const py = (st.grid_r + off.y) * zoom + rect.height / 2;
          const halfW = (st.width * zoom) / 2;
          const halfH = (st.height * zoom) / 2;
          return mx >= px - halfW && mx <= px + halfW && my >= py - halfH && my <= py + halfH;
        });
        if (hitSticker) {
          if (toolRef.current === 'delete') {
            pushUndo();
            spawnExplosion(e.clientX, e.clientY, '#a3a3a3');
            updatePlacedStickers(prev => prev.filter(st => st.id !== hitSticker.id));
            setSelectedStickerId(prev => prev === hitSticker.id ? null : prev);
            bump();
            e.preventDefault();
            return;
          }
          const { wx, wy } = screenToWorld(e.clientX, e.clientY);
          draggingStickerRef.current = { id: hitSticker.id, offsetR: wy - hitSticker.grid_r, offsetC: wx - hitSticker.grid_c };
          pointerDownPos.current = { x: e.clientX, y: e.clientY };
          draggedRef.current = false;
          isPainting.current = true;
          setSelectedStickerId(hitSticker.id);
          e.preventDefault();
          return;
        }
        // Clicked empty canvas with pointer → deselect any selected sticker
        if (toolRef.current === 'pointer') setSelectedStickerId(null);
      }
    }

    if (e.button !== 0) return;

    const { r, c } = screenToGrid(e.clientX, e.clientY);
    const currentTool = toolRef.current;
    const color = selectedColorRef.current;

    if (currentTool === 'draw') {
      pushUndo();
      isPainting.current = true;
      paintBrush(r, c, color);
      bump();
    } else if (currentTool === 'fill') {
      pushUndo();
      const clickedColor = cellsRef.current.get(cellKey(r, c)) ?? bgColorRef.current;
      // If clicking on background and no painted cells exist, change the bg color
      if (clickedColor === bgColorRef.current && cellsRef.current.size === 0) {
        bgColorRef.current = color;
        mapMetaLoadedRef.current = true;
        needsRedraw.current = true;
        bump();
      } else {
        const result = floodFill(cellsRef.current, bgColorRef.current, r, c, color);
        if (result !== cellsRef.current) {
          cellsRef.current = result;
          needsRedraw.current = true;
          bump();
        } else if (clickedColor === bgColorRef.current) {
          // Unbounded background region — change the background color
          bgColorRef.current = color;
          mapMetaLoadedRef.current = true;
          needsRedraw.current = true;
          bump();
        }
      }
    } else if (currentTool === 'eyedropper') {
      const pickedColor = cellsRef.current.get(cellKey(r, c)) || bgColorRef.current;
      setSelectedColor(pickedColor);
      const prev = preEyedropperToolRef.current;
      preEyedropperToolRef.current = null;
      setTool(prev && prev !== 'eyedropper' ? prev : 'draw');
    } else if (currentTool === 'square' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'ai') {
      squareStart.current = { r, c };
      squareEnd.current = { r, c };
      isPainting.current = true;
      needsRedraw.current = true;
    }
  }, [screenToGrid, setCellValue, paintBrush, bump, cursorPill, cursorLabel, updatePlacedNotebooks, updatePlacedLabels, updatePlacedStickers, pushUndo]);

  const [cursorOnCanvas, setCursorOnCanvas] = useState(false);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Track if cursor is over UI elements (toolbar, pickers, etc.)
    const overUI = !!(e.target as HTMLElement)?.closest?.('[data-toolbar], [data-picker]');
    setCursorOnCanvas(!overUI);
    // Always track cursor for pill/label ghost so position is ready when placement starts
    setCursorPos({ x: e.clientX, y: e.clientY });

    if (isPanning.current) {
      const dx = (e.clientX - panStart.current.x) / zoomRef.current;
      const dy = (e.clientY - panStart.current.y) / zoomRef.current;
      offsetRef.current = { x: panStart.current.ox + dx, y: panStart.current.oy + dy };
      needsRedraw.current = true;
      return;
    }

    // Pointer dragging sticker
    if (toolRef.current === 'pointer' && draggingStickerRef.current && isPainting.current) {
      if (pointerDownPos.current) {
        const dx = Math.abs(e.clientX - pointerDownPos.current.x);
        const dy = Math.abs(e.clientY - pointerDownPos.current.y);
        if (dx > 3 || dy > 3) {
          draggedRef.current = true;
          containerRef.current!.style.cursor = 'grabbing';
        }
      }
      if (draggedRef.current) {
        const { wx, wy } = screenToWorld(e.clientX, e.clientY);
        const drag = draggingStickerRef.current;
        updatePlacedStickers(prev =>
          prev.map(st => st.id === drag.id ? { ...st, grid_r: wy - drag.offsetR, grid_c: wx - drag.offsetC } : st)
        );
        needsRedraw.current = true;
      }
      return;
    }

    // Pointer dragging label
    if (toolRef.current === 'pointer' && draggingLabelRef.current && isPainting.current) {
      if (pointerDownPos.current) {
        const dx = Math.abs(e.clientX - pointerDownPos.current.x);
        const dy = Math.abs(e.clientY - pointerDownPos.current.y);
        if (dx > 3 || dy > 3) {
          draggedRef.current = true;
          containerRef.current!.style.cursor = 'grabbing';
        }
      }
      if (draggedRef.current) {
        const { wx, wy } = screenToWorld(e.clientX, e.clientY);
        const drag = draggingLabelRef.current;
        updatePlacedLabels(prev =>
          prev.map(lb => lb.id === drag.id ? { ...lb, grid_r: wy - drag.offsetR, grid_c: wx - drag.offsetC } : lb)
        );
        needsRedraw.current = true;
      }
      return;
    }

    // Pointer dragging notebook
    if (toolRef.current === 'pointer' && draggingNotebookRef.current && isPainting.current) {
      // Detect if we've actually dragged (not just clicked)
      if (pointerDownPos.current) {
        const dx = Math.abs(e.clientX - pointerDownPos.current.x);
        const dy = Math.abs(e.clientY - pointerDownPos.current.y);
        if (dx > 3 || dy > 3) {
          draggedRef.current = true;
          containerRef.current!.style.cursor = 'grabbing';
        }
      }
      if (draggedRef.current) {
        const { wx, wy } = screenToWorld(e.clientX, e.clientY);
        const drag = draggingNotebookRef.current;
        updatePlacedNotebooks(prev =>
          prev.map(nb => nb.id === drag.id ? { ...nb, grid_r: wy - drag.offsetR, grid_c: wx - drag.offsetC } : nb)
        );
        needsRedraw.current = true;
      }
      return;
    }

    if (toolRef.current === 'draw' && isPainting.current) {
      const { r, c } = screenToGrid(e.clientX, e.clientY);
      paintBrush(r, c, selectedColorRef.current);
    }
    if ((toolRef.current === 'square' || toolRef.current === 'circle' || toolRef.current === 'line' || toolRef.current === 'ai') && isPainting.current) {
      const { r, c } = screenToGrid(e.clientX, e.clientY);
      squareEnd.current = { r, c };
      needsRedraw.current = true;
    }
  }, [screenToGrid, setCellValue, paintBrush, cursorPill, cursorLabel, updatePlacedNotebooks, updatePlacedLabels]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) { isPanning.current = false; scheduleSave(); return; }

    // Pointer release for sticker drag
    if (toolRef.current === 'pointer' && draggingStickerRef.current) {
      draggingStickerRef.current = null;
      pointerDownPos.current = null;
      isPainting.current = false;
      containerRef.current!.style.cursor = '';
      if (draggedRef.current) bump();
      return;
    }

    // Pointer release for label drag
    if (toolRef.current === 'pointer' && draggingLabelRef.current) {
      draggingLabelRef.current = null;
      pointerDownPos.current = null;
      isPainting.current = false;
      containerRef.current!.style.cursor = '';
      if (draggedRef.current) bump();
      return;
    }

    // Pointer release: if dragged → reposition, if clicked → open preview
    if (toolRef.current === 'pointer' && draggingNotebookRef.current) {
      const hitId = draggingNotebookRef.current.id;
      const wasDragged = draggedRef.current;
      draggingNotebookRef.current = null;
      pointerDownPos.current = null;
      isPainting.current = false;
      containerRef.current!.style.cursor = '';
      if (wasDragged) {
        bump();
      } else {
        // It was a click — open notebook preview
        const nb = placedNotebooksRef.current.find(n => n.id === hitId);
        if (nb) {
          openPreviewForPlacement(nb);
        }
      }
      return;
    }

    if (toolRef.current === 'ai' && squareStart.current && isPainting.current) {
      const { r, c } = screenToGrid(e.clientX, e.clientY);
      const s = squareStart.current;
      const minR = Math.min(s.r, r), maxR = Math.max(s.r, r);
      const minC = Math.min(s.c, c), maxC = Math.max(s.c, c);
      squareStart.current = null;
      squareEnd.current = null;
      isPainting.current = false;
      needsRedraw.current = true;
      // Require at least a 2x2 selection
      if (maxR - minR >= 1 && maxC - minC >= 1) {
        // Place the prompt popover at the center of the highlighted area
        const rect = containerRef.current!.getBoundingClientRect();
        const zoom = zoomRef.current;
        const off = offsetRef.current;
        const centerCol = (minC + maxC + 1) / 2;
        const centerRow = (minR + maxR + 1) / 2;
        const centerX = (centerCol * CELL_SIZE + off.x) * zoom + rect.width / 2 + rect.left;
        const centerY = (centerRow * CELL_SIZE + off.y) * zoom + rect.height / 2 + rect.top;
        setAiPrompt({ minR, maxR, minC, maxC, centerX, centerY });
        setAiPromptText('');
        setAiError(null);
      }
      return;
    }

    if ((toolRef.current === 'square' || toolRef.current === 'circle') && squareStart.current && isPainting.current) {
      pushUndo();
      const { r, c } = screenToGrid(e.clientX, e.clientY);
      const s = squareStart.current;
      const color = selectedColorRef.current;
      const bg = bgColorRef.current;

      if (toolRef.current === 'square') {
        const minR = Math.min(s.r, r), maxR = Math.max(s.r, r);
        const minC = Math.min(s.c, c), maxC = Math.max(s.c, c);
        for (let rr = minR; rr <= maxR; rr++) {
          for (let cc = minC; cc <= maxC; cc++) {
            if (isRoundedCorner(rr, cc, minR, maxR, minC, maxC)) continue;
            const key = cellKey(rr, cc);
            if (color === bg) cellsRef.current.delete(key); else cellsRef.current.set(key, color);
          }
        }
      } else {
        // Circle: fill cells within the ellipse defined by the bounding box
        const minR = Math.min(s.r, r), maxR = Math.max(s.r, r);
        const minC = Math.min(s.c, c), maxC = Math.max(s.c, c);
        const cx = (minC + maxC) / 2;
        const cy = (minR + maxR) / 2;
        const rx = (maxC - minC + 1) / 2;
        const ry = (maxR - minR + 1) / 2;
        if (rx > 0 && ry > 0) {
          for (let rr = minR; rr <= maxR; rr++) {
            for (let cc = minC; cc <= maxC; cc++) {
              const dx = (cc + 0.5 - cx) / rx;
              const dy = (rr + 0.5 - cy) / ry;
              if (dx * dx + dy * dy <= 1) {
                const key = cellKey(rr, cc);
                if (color === bg) cellsRef.current.delete(key); else cellsRef.current.set(key, color);
              }
            }
          }
        }
      }

      squareStart.current = null;
      squareEnd.current = null;
      needsRedraw.current = true;
      bump();
    }

    if (toolRef.current === 'line' && squareStart.current && isPainting.current) {
      pushUndo();
      const { r, c } = screenToGrid(e.clientX, e.clientY);
      const s = squareStart.current;
      const color = selectedColorRef.current;
      // Bresenham line rasterization
      let x0 = s.c, y0 = s.r;
      const x1 = c, y1 = r;
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      // Safety cap to avoid runaway loops
      let guard = 0;
      while (guard++ < 100000) {
        paintBrush(y0, x0, color);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      squareStart.current = null;
      squareEnd.current = null;
      needsRedraw.current = true;
      bump();
    }

    isPainting.current = false;
  }, [screenToGrid, bump, scheduleSave]);

  // ---- Wheel: two-finger pan + pinch zoom ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Panels over the map (the AI Draw prompt, lists, editors) scroll themselves
    // when there's somewhere to scroll; otherwise two fingers pan the map.
    const scrollsNatively = (target: Element, e: WheelEvent) => {
      for (let el: Element | null = target; el && el !== container; el = el.parentElement) {
        const { overflowY, overflowX } = getComputedStyle(el);
        const canY = /(auto|scroll)/.test(overflowY) && el.scrollHeight > el.clientHeight
          && (e.deltaY < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1);
        const canX = /(auto|scroll)/.test(overflowX) && el.scrollWidth > el.clientWidth
          && (e.deltaX < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
        if ((e.deltaY !== 0 && canY) || (e.deltaX !== 0 && canX)) return true;
      }
      return false;
    };
    const onWheel = (e: WheelEvent) => {
      // Don't hijack wheel events that target the floating notebook sidebar —
      // it has its own scroll area.
      const target = e.target as Element | null;
      if (target?.closest?.('[data-map-sidebar]')) {
        return;
      }
      if (target && !e.ctrlKey && !e.metaKey && scrollsNatively(target, e)) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = container.getBoundingClientRect();
        const oldZoom = zoomRef.current;
        const off = offsetRef.current;
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const wx = mx / oldZoom - off.x;
        const wy = my / oldZoom - off.y;
        const factor = Math.pow(0.99, e.deltaY);
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
        zoomRef.current = newZoom;
        offsetRef.current = {
          x: mx / newZoom - wx,
          y: my / newZoom - wy,
        };
        setZoomDisplay(Math.round(newZoom * 100));
      } else {
        offsetRef.current = {
          x: offsetRef.current.x - e.deltaX / zoomRef.current,
          y: offsetRef.current.y - e.deltaY / zoomRef.current,
        };
      }
      needsRedraw.current = true;
      scheduleSave();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [scheduleSave]);

  // Space key
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(takeSnapshot());
    const snap = undoStack.current.pop()!;
    applySnapshot(snap);
    bump();
  }, [takeSnapshot, applySnapshot, bump]);


  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(takeSnapshot());
    applySnapshot(redoStack.current.pop()!);
    bump();
  }, [takeSnapshot, applySnapshot, bump]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (readOnly) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      if (e.code === 'Escape') { setCursorPill(null); setCursorLabel(null); setShowNotebookPicker(false); setShowLabelModal(false); setEditingLabelId(null); setPreviewNotepad(null); setPreviewLoading(null); setPreviewFocused(false); setAiPrompt(null); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }

      // Copy / paste stickers across maps and projects (clipboard in localStorage).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !isTyping && selectedStickerId) {
        const st = placedStickersRef.current.find(s => s.id === selectedStickerId);
        if (st) {
          e.preventDefault();
          try {
            localStorage.setItem('storymode.stickerClipboard', JSON.stringify({
              url: st.url,
              dataUrl: st.dataUrl,
              width: st.width,
              height: st.height,
              rotation: st.rotation ?? 0,
            }));
            toast({ title: t('map.stickerCopied', { defaultValue: 'Sticker copied' }) });
          } catch { /* ignore */ }
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !isTyping) {
        let payload: Partial<PlacedSticker> | null = null;
        try { payload = JSON.parse(localStorage.getItem('storymode.stickerClipboard') || 'null'); } catch { /* ignore */ }
        if (payload && (payload.url || payload.dataUrl)) {
          e.preventDefault();
          const off = offsetRef.current;
          const newSticker: PlacedSticker = {
            id: crypto.randomUUID(),
            url: payload.url,
            dataUrl: payload.url ? undefined : payload.dataUrl,
            grid_r: -off.y,
            grid_c: -off.x,
            width: payload.width || 300,
            height: payload.height || 300,
            rotation: payload.rotation || 0,
          };
          updatePlacedStickers(prev => [...prev, newSticker]);
          setSelectedStickerId(newSticker.id);
          setTool('pointer');
          needsRedraw.current = true;
          bump();
        }
        return;
      }

      if (isTyping || e.metaKey || e.ctrlKey) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStickerId && toolRef.current === 'pointer') {
        e.preventDefault();
        const id = selectedStickerId;
        pushUndo();
        updatePlacedStickers(prev => prev.filter(st => st.id !== id));
        setSelectedStickerId(null);
        bump();
        return;
      }


      switch (e.key.toLowerCase()) {
        case 'v': setTool('pointer'); setCursorPill(null); setCursorLabel(null); break;
        case 'd': setTool('draw'); setCursorPill(null); setCursorLabel(null); break;
        case 'r': setTool('square'); setCursorPill(null); setCursorLabel(null); break;
        case 'c': setTool('circle'); setCursorPill(null); setCursorLabel(null); break;
        case 'g': setTool('line'); setCursorPill(null); setCursorLabel(null); break;
        case 'f': setTool('fill'); setCursorPill(null); setCursorLabel(null); break;
        case 'i': preEyedropperToolRef.current = toolRef.current; setTool('eyedropper'); setCursorPill(null); setCursorLabel(null); break;
        case 'n': setTool('notebook'); setCursorLabel(null); setShowLabelModal(false); setShowPalette(false); setShowBrushPicker(false); setShowNotebookPicker(true); break;
        case 'l': setTool('label'); setCursorPill(null); setShowNotebookPicker(false); setShowPalette(false); setShowBrushPicker(false); setShowLabelModal(true); break;
        case 'x': setTool('delete'); setCursorPill(null); setCursorLabel(null); break;
        case 'a': setTool('ai'); setCursorPill(null); setCursorLabel(null); break;
      }
    };
    const up = () => {};
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [undo, redo, selectedStickerId, updatePlacedStickers, pushUndo, bump, t, readOnly]);

  const applyZoom = useCallback((factor: number) => {
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor));
    zoomRef.current = newZoom;
    setZoomDisplay(Math.round(newZoom * 100));
    needsRedraw.current = true;
    scheduleSave();
  }, [scheduleSave]);

  const fitAll = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Gather bounding box in world-pixel coordinates
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // Cells are at (col * CELL_SIZE, row * CELL_SIZE) in world space
    cellsRef.current.forEach((_, key) => {
      const [rs, cs] = key.split(',');
      const r = parseInt(rs), c = parseInt(cs);
      const px = c * CELL_SIZE;
      const py = r * CELL_SIZE;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px + CELL_SIZE);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py + CELL_SIZE);
    });

    // Notebooks/labels use pixel coordinates directly (grid_c, grid_r)
    placedNotebooksRef.current.forEach(nb => {
      minX = Math.min(minX, nb.grid_c); maxX = Math.max(maxX, nb.grid_c + 120);
      minY = Math.min(minY, nb.grid_r); maxY = Math.max(maxY, nb.grid_r + 30);
    });
    placedLabelsRef.current.forEach(lb => {
      minX = Math.min(minX, lb.grid_c); maxX = Math.max(maxX, lb.grid_c + 80);
      minY = Math.min(minY, lb.grid_r); maxY = Math.max(maxY, lb.grid_r + 30);
    });

    if (minX === Infinity) {
      zoomRef.current = 1;
      offsetRef.current = { x: 0, y: 0 };
      setZoomDisplay(100);
      needsRedraw.current = true;
      scheduleSave();
      return;
    }

    // Add padding in world pixels
    const padPx = CELL_SIZE * 3;
    minX -= padPx; maxX += padPx;
    minY -= padPx; maxY += padPx;

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / contentW, rect.height / contentH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    zoomRef.current = zoom;
    offsetRef.current = { x: -centerX, y: -centerY };
    setZoomDisplay(Math.round(zoom * 100));
    needsRedraw.current = true;
    scheduleSave();
  }, [scheduleSave]);

  // Helper: compute screen position from grid coordinates
  const gridToScreen = useCallback((gr: number, gc: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const zoom = zoomRef.current;
    const off = offsetRef.current;
    const x = (gc * CELL_SIZE + off.x) * zoom + rect.width / 2;
    const y = (gr * CELL_SIZE + off.y) * zoom + rect.height / 2;
    return { x, y };
  }, []);

  const getCursor = () => {
    if (spaceHeld.current || isPanning.current || tool === 'hand') return 'grab';
    if (tool === 'pointer' || tool === 'delete') return 'default';
    if (tool === 'notebook' && cursorPill) return 'none';
    if (tool === 'label' && cursorLabel) return 'none';
    if (tool === 'draw' && brushSize > 1) return 'none';
    return 'crosshair';
  };

  // Track recently-used colors for AI palette hint
  useEffect(() => {
    recentColorsRef.current = [selectedColor, ...recentColorsRef.current.filter(c => c !== selectedColor)].slice(0, 12);
  }, [selectedColor]);

  const submitAiDraw = useCallback(async () => {
    if (!aiPrompt || !aiPromptText.trim() || aiLoading) return;
    const promptText = aiPromptText.trim();
    // Guard: extreme aspect ratios don't work — image models generate square-
    // ish canvases (Gemini) or capped 3:2 (gpt-image-1). Anything narrower
    // than ~1:4 gets squished into an unreadable smear, or the request fails
    // upstream with a confusing error. Tell the user up-front.
    const wCells = aiPrompt.maxC - aiPrompt.minC + 1;
    const hCells = aiPrompt.maxR - aiPrompt.minR + 1;
    const ratio = Math.max(wCells, hCells) / Math.max(1, Math.min(wCells, hCells));
    if (ratio > 4) {
      setAiError('AI Draw needs a more square-ish area — this selection is too narrow. Try a wider or taller region.');
      return;
    }
    // Switch to iridescent overlay over the selected area, hide the prompt box
    setAiDrawing({
      minR: aiPrompt.minR,
      maxR: aiPrompt.maxR,
      minC: aiPrompt.minC,
      maxC: aiPrompt.maxC,
      prompt: promptText,
      flavor: '',
      fading: false,
    });
    setAiPrompt(null);
    setAiLoading(true);
    setAiError(null);
    // Fetch the short progress copy first. Paid AI calls are serialized per
    // user, so this lightweight request must release its reservation before
    // the image-generation request starts.
    try {
      const { data } = await supabase.functions.invoke('ai-draw-flavor', { body: { prompt: promptText, aiLanguage } });
      const flavor = ((data as { flavor?: string } | null)?.flavor || '').trim();
      if (flavor) setAiDrawing(prev => prev ? { ...prev, flavor } : prev);
    } catch {/* The progress copy is optional; continue drawing. */}
    const drawingBounds = { minR: aiPrompt.minR, maxR: aiPrompt.maxR, minC: aiPrompt.minC, maxC: aiPrompt.maxC };
    try {
      const W = drawingBounds.maxC - drawingBounds.minC + 1;
      const H = drawingBounds.maxR - drawingBounds.minR + 1;
      // Sample dominant neighbor color along each edge (just outside the selection)
      // so the AI knows what terrain to blend into on top/bottom/left/right.
      const bgC = bgColorRef.current;
      const sampleEdge = (cells: Array<[number, number]>): string => {
        const counts = new Map<string, number>();
        for (const [r, c] of cells) {
          const col = cellsRef.current.get(cellKey(r, c)) || bgC;
          counts.set(col, (counts.get(col) || 0) + 1);
        }
        let best = bgC, bestN = -1;
        counts.forEach((n, col) => { if (n > bestN) { bestN = n; best = col; } });
        return best;
      };
      const topCells: Array<[number, number]> = [];
      const bottomCells: Array<[number, number]> = [];
      const leftCells: Array<[number, number]> = [];
      const rightCells: Array<[number, number]> = [];
      for (let c = drawingBounds.minC; c <= drawingBounds.maxC; c++) {
        topCells.push([drawingBounds.minR - 1, c]);
        bottomCells.push([drawingBounds.maxR + 1, c]);
      }
      for (let r = drawingBounds.minR; r <= drawingBounds.maxR; r++) {
        leftCells.push([r, drawingBounds.minC - 1]);
        rightCells.push([r, drawingBounds.maxC + 1]);
      }
      const edges = {
        top: sampleEdge(topCells),
        bottom: sampleEdge(bottomCells),
        left: sampleEdge(leftCells),
        right: sampleEdge(rightCells),
      };
      // Determine the LOCAL background — the dominant color actually under the
      // drag region (plus its immediate neighbors). Without this, the AI thinks
      // the surrounding terrain is the map's global bg (e.g. grass) when the
      // user actually dragged over water, and renders the wrong context.
      const localCounts = new Map<string, number>();
      for (let r = drawingBounds.minR; r <= drawingBounds.maxR; r++) {
        for (let c = drawingBounds.minC; c <= drawingBounds.maxC; c++) {
          const col = cellsRef.current.get(cellKey(r, c)) || bgC;
          localCounts.set(col, (localCounts.get(col) || 0) + 1);
        }
      }
      let localBg = bgC, localBest = -1;
      localCounts.forEach((n, col) => { if (n > localBest) { localBest = n; localBg = col; } });
      const { data, error } = await supabase.functions.invoke('ai-map-draw', {
        body: {
          prompt: promptText,
          width: W,
          height: H,
          bgColor: localBg,
          selectedColor: selectedColorRef.current,
          palette: recentColorsRef.current,
          edges,
          style: aiStyle,
          mode: aiMode,
        },
      });
      if (error) {
        // functions.invoke swallows the response body on non-2xx; read it so
        // the user sees the real reason (moderation, quota, etc).
        let detail = '';
        try {
          const ctx = (error as { context?: Response })?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.clone().json();
            detail = body?.error || '';
          }
        } catch { /* ignore */ }
        throw new Error(detail || error.message || 'AI draw failed');
      }
      const result = (data ?? {}) as AiDrawResult;
      if (result.error) throw new Error(result.error);
      // Sticker mode: place a movable sticker centered on the selection, sized

      // to the selection's world-pixel footprint. Skip the pixel/label path.
      const stickerPayload = result.sticker;
      if (stickerPayload?.dataUrl) {
        const worldW = (drawingBounds.maxC - drawingBounds.minC + 1) * CELL_SIZE;
        const worldH = (drawingBounds.maxR - drawingBounds.minR + 1) * CELL_SIZE;
        const worldCx = (drawingBounds.minC * CELL_SIZE + drawingBounds.maxC * CELL_SIZE + CELL_SIZE) / 2;
        const worldCy = (drawingBounds.minR * CELL_SIZE + drawingBounds.maxR * CELL_SIZE + CELL_SIZE) / 2;
        // Upload the sticker to storage; fall back to inline dataUrl on failure.
        const uploaded = await uploadStickerDataUrl(stickerPayload.dataUrl);
        const newSticker: PlacedSticker = {
          id: crypto.randomUUID(),
          url: uploaded?.url,
          storage_path: uploaded?.path,
          dataUrl: uploaded ? undefined : stickerPayload.dataUrl,
          grid_r: worldCy,
          grid_c: worldCx,
          width: worldW,
          height: worldH,
        };

        updatePlacedStickers(prev => [...prev, newSticker]);
        setAiPromptText('');
        needsRedraw.current = true;
        bump();
        return;
      }
      const cells = result.cells || [];
      const labels = result.labels || [];
      const rW = result.rectWidth || W;
      const rH = result.rectHeight || H;
      // Map sub-grid (rW×rH) onto target rect (W×H) — scale up if model downsampled.
      const scaleR = H / rH;
      const scaleC = W / rW;
      pushUndo();
      for (const cell of cells) {
        const r0 = Math.floor(cell.r * scaleR);
        const r1 = Math.max(r0 + 1, Math.floor((cell.r + 1) * scaleR));
        const c0 = Math.floor(cell.c * scaleC);
        const c1 = Math.max(c0 + 1, Math.floor((cell.c + 1) * scaleC));
        for (let rr = r0; rr < r1; rr++) {
          for (let cc = c0; cc < c1; cc++) {
            const absR = drawingBounds.minR + rr;
            const absC = drawingBounds.minC + cc;
            if (cell.color === bgColorRef.current) cellsRef.current.delete(cellKey(absR, absC));
            else cellsRef.current.set(cellKey(absR, absC), cell.color);
          }
        }
      }
      if (labels.length) {
        const newLabels: PlacedLabel[] = labels.map(lb => {
          const absR = drawingBounds.minR + Math.floor(lb.r * scaleR);
          const absC = drawingBounds.minC + Math.floor(lb.c * scaleC);
          const color = lb.color || '#1f2937';
          return {
            id: crypto.randomUUID(),
            text: lb.text,
            theme: 'clean-white',
            themeBg: '#ffffff',
            themeFg: color,
            grid_r: absR * CELL_SIZE + CELL_SIZE / 2,
            grid_c: absC * CELL_SIZE + CELL_SIZE / 2,
          };
        });
        updatePlacedLabels(prev => [...prev, ...newLabels]);
      }
      needsRedraw.current = true;
      bump();
      setAiPromptText('');
    } catch (e) {
      console.error(e);
      const msg = (e instanceof Error && e.message) || 'AI draw failed';
      setAiError(msg);
      // The prompt popover can be dismissed while the request is in flight, so
      // always surface the failure as a toast too.
      toast({ title: 'AI Draw failed', description: msg, variant: 'destructive' });
    } finally {
      setAiLoading(false);
      notifyCreditsChanged();
      // Fade the iridescent overlay out, then remove
      setAiDrawing(prev => prev ? { ...prev, fading: true } : prev);
      setTimeout(() => setAiDrawing(null), 650);
    }
  }, [aiPrompt, aiPromptText, aiLoading, pushUndo, bump, updatePlacedLabels, updatePlacedStickers, uploadStickerDataUrl, aiStyle, aiMode, aiLanguage]);

  // Live-position the iridescent AI Draw overlay over the selected area (follows zoom/pan)
  useEffect(() => {
    if (!aiDrawing) return;
    let raf = 0;
    const tick = () => {
      const el = aiOverlayRef.current;
      const container = containerRef.current;
      if (el && container) {
        const rect = container.getBoundingClientRect();
        const zoom = zoomRef.current;
        const off = offsetRef.current;
        const x1 = (aiDrawing.minC * CELL_SIZE + off.x) * zoom + rect.width / 2 + rect.left;
        const y1 = (aiDrawing.minR * CELL_SIZE + off.y) * zoom + rect.height / 2 + rect.top;
        const x2 = ((aiDrawing.maxC + 1) * CELL_SIZE + off.x) * zoom + rect.width / 2 + rect.left;
        const y2 = ((aiDrawing.maxR + 1) * CELL_SIZE + off.y) * zoom + rect.height / 2 + rect.top;
        el.style.left = `${x1}px`;
        el.style.top = `${y1}px`;
        el.style.width = `${Math.max(0, x2 - x1)}px`;
        el.style.height = `${Math.max(0, y2 - y1)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [aiDrawing]);

  // Brush size in pixels for the cursor indicator
  const brushCursorSize = brushSize * CELL_SIZE * (zoomDisplay / 100);

  const mapGuide = useMapOnboarding(mapId, !readOnly && loaded && mapIsEmpty);
  const [guideArt] = useState(() => pickRandomBackground());
  const handleGuideClose = useCallback((dontShowAgain: boolean, choice: 'hand' | 'ai' | null) => {
    mapGuide.close(dontShowAgain);
    if (choice === 'hand') { setTool('draw'); setCursorPill(null); setCursorLabel(null); }
    if (choice === 'ai') { setTool('ai'); setCursorPill(null); setCursorLabel(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  return (
    <div
      ref={containerRef}
      className="flex-1 relative select-none overflow-clip"
      style={{ cursor: getCursor(), touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { isPainting.current = false; isPanning.current = false; draggingNotebookRef.current = null; draggingLabelRef.current = null; draggingStickerRef.current = null; squareStart.current = null; squareEnd.current = null; needsRedraw.current = true; setCursorPos(null); }}
      onContextMenu={e => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {!loaded && <div className="absolute inset-0 z-50 flex"><ViewLoadingOverlay view="map" /></div>}
      {mapGuide.open && loaded && <MapOnboarding art={guideArt} onClose={handleGuideClose} />}

      {/* Pills layer: positioned by RAF loop to match canvas camera */}
      <div ref={pillsLayerRef} className="absolute top-0 left-0" style={{ transformOrigin: '0 0', pointerEvents: 'none' }}>
        {/* Stickers — world-scaled, rendered under pills so labels sit on top */}
        {placedStickers.map(st => {
          const rot = st.rotation ?? 0;
          const selected = selectedStickerId === st.id && tool === 'pointer';
          const zoom = zoomRef.current;
          // Counter-scale the selection chrome so it stays a constant screen size
          const cornerSize = 10 / zoom;      // small dot handles
          const rotateSize = 22 / zoom;      // rotate puck
          const rotateGap = 26 / zoom;       // distance above sticker
          const ringWidth = 1.5 / zoom;
          return (
            <div
              key={st.id}
              data-sticker={st.id}
              className="absolute"
              style={{
                left: st.grid_c,
                top: st.grid_r,
                width: st.width,
                height: st.height,
                transform: `translate(-50%, -50%) rotate(${rot}rad)`,
                pointerEvents: (tool === 'pointer' || tool === 'delete') ? 'auto' : 'none',
                cursor: tool === 'delete' ? 'pointer' : tool === 'pointer' ? 'grab' : 'default',
              }}
            >
              <img
                src={st.url || st.dataUrl}
                alt=""
                draggable={false}
                className={`w-full h-full select-none ${tool === 'delete' ? 'hover:animate-[wiggle_0.3s_ease-in-out_infinite]' : ''}`}
                style={{ imageRendering: 'auto', objectFit: 'contain', pointerEvents: 'none' }}
              />
              {selected && (
                <>
                  {/* Selection ring — crisp primary outline with a soft halo so it reads on any background */}
                  <div
                    className="absolute inset-0 pointer-events-none rounded-md"
                    style={{
                      boxShadow: `0 0 0 ${ringWidth}px hsl(var(--primary)), 0 0 0 ${ringWidth * 2}px hsl(var(--background) / 0.9)`,
                    }}
                  />
                  {/* Thin tether line from sticker top to rotate handle */}
                  <div
                    className="absolute left-1/2 pointer-events-none"
                    style={{
                      top: -rotateGap,
                      height: rotateGap,
                      width: ringWidth,
                      background: 'hsl(var(--primary))',
                      transform: 'translateX(-50%)',
                    }}
                  />
                  {/* Rotate handle above the sticker */}
                  <div
                    className="group absolute left-1/2 flex items-center justify-center rounded-full bg-background text-primary shadow-md cursor-grab hover:scale-110 hover:bg-primary hover:text-primary-foreground active:cursor-grabbing transition-all duration-150"
                    style={{
                      top: -rotateGap - rotateSize,
                      width: rotateSize,
                      height: rotateSize,
                      transform: 'translateX(-50%)',
                      boxShadow: `0 0 0 ${ringWidth}px hsl(var(--primary))`,
                      pointerEvents: 'auto',
                    }}
                    title="Drag to rotate"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const cz = zoomRef.current;
                      const off = offsetRef.current;
                      const centerX = (st.grid_c + off.x) * cz + rect.width / 2 + rect.left;
                      const centerY = (st.grid_r + off.y) * cz + rect.height / 2 + rect.top;
                      const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                      rotatingStickerRef.current = { id: st.id, startAngle, startRotation: rot };
                      const move = (ev: PointerEvent) => {
                        const r = rotatingStickerRef.current;
                        if (!r) return;
                        const a = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
                        const next = r.startRotation + (a - r.startAngle);
                        updatePlacedStickers(prev => prev.map(x => x.id === r.id ? { ...x, rotation: next } : x));
                      };
                      const up = () => {
                        rotatingStickerRef.current = null;
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                        bump();
                      };
                      window.addEventListener('pointermove', move);
                      window.addEventListener('pointerup', up);
                    }}
                  >
                    <ArrowsClockwise
                      weight="bold"
                      className="transition-transform duration-300 group-hover:rotate-90"
                      style={{ width: rotateSize * 0.55, height: rotateSize * 0.55 }}
                    />
                  </div>
                  {/* Corner resize handles (aspect-ratio locked) */}
                  {(['tl', 'tr', 'bl', 'br'] as const).map(corner => {
                    const isTop = corner === 'tl' || corner === 'tr';
                    const isLeft = corner === 'tl' || corner === 'bl';
                    const cursorMap = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize' } as const;
                    return (
                      <div
                        key={corner}
                        className="absolute rounded-full bg-background hover:bg-primary hover:scale-125 transition-all duration-150"
                        style={{
                          width: cornerSize,
                          height: cornerSize,
                          [isTop ? 'top' : 'bottom']: -cornerSize / 2,
                          [isLeft ? 'left' : 'right']: -cornerSize / 2,
                          cursor: cursorMap[corner],
                          pointerEvents: 'auto',
                          boxShadow: `0 0 0 ${ringWidth}px hsl(var(--primary)), 0 1px 3px hsl(0 0% 0% / 0.25)`,
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const cz = zoomRef.current;
                          const off = offsetRef.current;
                          const centerX = (st.grid_c + off.x) * cz + rect.width / 2 + rect.left;
                          const centerY = (st.grid_r + off.y) * cz + rect.height / 2 + rect.top;
                          const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
                          resizingStickerRef.current = {
                            id: st.id,
                            startWidth: st.width,
                            startHeight: st.height,
                            startDist: Math.max(1, startDist),
                          };
                          const move = (ev: PointerEvent) => {
                            const r = resizingStickerRef.current;
                            if (!r) return;
                            const d = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
                            const ratio = Math.max(0.1, d / r.startDist);
                            updatePlacedStickers(prev => prev.map(x =>
                              x.id === r.id ? { ...x, width: r.startWidth * ratio, height: r.startHeight * ratio } : x
                            ));
                          };
                          const up = () => {
                            resizingStickerRef.current = null;
                            window.removeEventListener('pointermove', move);
                            window.removeEventListener('pointerup', up);
                            bump();
                          };
                          window.addEventListener('pointermove', move);
                          window.addEventListener('pointerup', up);
                        }}
                      />
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
        {placedNotebooks.map(nb => {
          const zoom = zoomRef.current;
          const pillScale = Math.max(0.75, Math.min(40 / 28, zoom));
          const counterScale = pillScale / zoom;
          return (
            <div
              key={nb.id}
              data-notebook-pill={nb.id}
              className="absolute"
              style={{
                left: nb.grid_c,
                top: nb.grid_r,
                transform: `translate(-50%, -50%) scale(${counterScale})`,
                transformOrigin: 'center center',
                pointerEvents: (tool === 'pointer' || tool === 'delete') ? 'auto' : 'none',
              }}
            >
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-md border border-border/50 whitespace-nowrap transition-all duration-200 ${tool === 'pointer' ? 'hover:-translate-y-0.5 hover:shadow-lg' : ''} ${tool === 'delete' ? 'hover:!bg-destructive/80 hover:!text-destructive-foreground hover:!border-destructive hover:animate-[wiggle_0.3s_ease-in-out_infinite]' : ''}`}
                style={{
                  backgroundColor: nb.themeBg,
                  color: nb.themeFg,
                  fontSize: 12,
                  cursor: tool === 'delete' ? 'pointer' : tool === 'pointer' ? 'pointer' : 'default',
                }}
              >
                <span className="font-medium truncate max-w-[120px]">{nb.title}</span>
              </div>
            </div>
          );
        })}
        {/* Placed labels */}
        {placedLabels.map(lb => {
          const zoom = zoomRef.current;
          const pillScale = Math.max(0.75, Math.min(40 / 28, zoom));
          const counterScale = pillScale / zoom;
          return (
            <div
              key={lb.id}
              className="absolute"
              style={{
                left: lb.grid_c,
                top: lb.grid_r,
                transform: `translate(-50%, -50%) scale(${counterScale})`,
                transformOrigin: 'center center',
                pointerEvents: (tool === 'pointer' || tool === 'delete') ? 'auto' : 'none',
              }}
            >
              <div
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 whitespace-nowrap transition-all duration-200 border-2 border-dashed ${tool === 'pointer' ? 'hover:-translate-y-0.5 hover:shadow-md' : ''} ${tool === 'delete' ? 'hover:!bg-destructive/80 hover:!text-destructive-foreground hover:!border-destructive hover:animate-[wiggle_0.3s_ease-in-out_infinite]' : ''}`}
                style={{
                  backgroundColor: lb.themeBg,
                  color: lb.themeFg,
                  borderColor: tool !== 'delete' ? lb.themeFg + '60' : undefined,
                  fontSize: 12,
                  cursor: tool === 'delete' ? 'pointer' : tool === 'pointer' ? 'pointer' : 'default',
                }}
              >
                <span className="font-medium truncate max-w-[120px]">{lb.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cursor pill ghost while placing notebook */}
      {cursorPill && tool === 'notebook' && cursorPos && (
        <div
          className="fixed pointer-events-none flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-lg border border-border/50 whitespace-nowrap opacity-80 z-[100]"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: 'translate(-50%, -50%)',
            backgroundColor: cursorPill.themeBg,
            color: cursorPill.themeFg,
            fontSize: 12,
          }}
        >
          <span className="font-medium">{cursorPill.title}</span>
        </div>
      )}

      {/* Cursor label ghost while placing label */}
      {cursorLabel && tool === 'label' && cursorPos && (
        <div
          className="fixed pointer-events-none flex items-center gap-1.5 rounded-lg px-3 py-1.5 border-2 border-dashed whitespace-nowrap opacity-80 z-[100]"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: 'translate(-50%, -50%)',
            backgroundColor: cursorLabel.themeBg,
            color: cursorLabel.themeFg,
            borderColor: cursorLabel.themeFg + '60',
            fontSize: 12,
          }}
        >
          <span className="font-medium">{cursorLabel.text}</span>
        </div>
      )}

      {/* Brush size cursor indicator */}
      {tool === 'draw' && brushSize > 1 && cursorPos && cursorOnCanvas && (
        <div
          className="fixed pointer-events-none z-[100] rounded-full border-2 border-foreground/40"
          style={{
            width: brushCursorSize,
            height: brushCursorSize,
            left: cursorPos.x - brushCursorSize / 2,
            top: cursorPos.y - brushCursorSize / 2,
          }}
        />
      )}

      {/* Explosion particles */}
      {explosions.map(exp => (
        <div key={exp.id} className="fixed pointer-events-none z-[200]" style={{ left: exp.x, top: exp.y }}>
          {exp.particles.map((p, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: exp.color,
                boxShadow: `0 0 6px ${exp.color}`,
                animationName: 'explode-particle',
                animationDuration: '0.5s',
                animationTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                animationFillMode: 'forwards',
                animationDelay: `${p.delay}s`,
                ['--ex-x' as string]: `${Math.cos(p.angle * Math.PI / 180) * p.dist}px`,
                ['--ex-y' as string]: `${Math.sin(p.angle * Math.PI / 180) * p.dist}px`,
              }}
            />
          ))}
        </div>
      ))}

      <NotebookPicker
        open={showNotebookPicker}
        onClose={() => setShowNotebookPicker(false)}
        onPick={handleNotebookPick}
        projectId={projectId ?? null}
      />

      {/* AI Draw prompt popover */}
      {aiPrompt && (
        <div
          data-toolbar
          className="fixed z-[150] w-[26rem] bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-2xl p-3.5"
          style={{
            left: Math.min(window.innerWidth - 30, Math.max(30, aiPrompt.centerX)),
            top: Math.min(window.innerHeight - 30, Math.max(30, aiPrompt.centerY)),
            transform: 'translate(-50%, -50%)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkle weight="fill" className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">{t('map.aiDraw')}</span>
            <span className="text-[10px] text-muted-foreground font-mono ml-auto">
              {aiPrompt.maxC - aiPrompt.minC + 1} × {aiPrompt.maxR - aiPrompt.minR + 1}
            </span>
            <button
              className="p-0.5 rounded hover:bg-muted/60"
              onClick={() => { setAiPrompt(null); setAiPromptText(''); setAiError(null); }}
              aria-label={t('common.cancel')}
            >
              <XIcon weight="bold" className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <AiTrialCard compact className="mb-2" />
          <textarea
            autoFocus
            value={aiPromptText}
            onChange={(e) => setAiPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitAiDraw(); }
              if (e.key === 'Escape') { setAiPrompt(null); setAiPromptText(''); }
            }}
            placeholder={t('map.aiDrawPlaceholder')}
            rows={4}
            className="w-full text-sm leading-relaxed bg-foreground/5 border border-border rounded-md px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[6rem]"
            disabled={aiLoading}
          />
          {aiError && <div className="mt-2 text-[11px] text-destructive">{aiError}</div>}
          <div className="mt-2 flex items-center gap-1 p-0.5 rounded-md bg-foreground/5 border border-border">
            {([
              { id: 'painterly', label: t('map.stylePainterly') },
              { id: 'flat', label: t('map.styleFlat') },
              { id: 'pixelart', label: t('map.stylePixel') },
            ] as const).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setAiStyle(opt.id);
                  try { window.localStorage.setItem('storymode.aiDrawStyle', opt.id); } catch { /* storage unavailable: not remembered */ }
                }}
                disabled={aiLoading}
                className={`flex-1 px-2 py-1 text-[11px] rounded transition-colors ${
                  aiStyle === opt.id
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
              {t('map.aiDrawHint')}
              {!SELF_HOSTED && <>
                <span className="mx-1.5 opacity-40">·</span>
                <span className="opacity-80">{t('credits.costMapDraw', { defaultValue: 'About 16 credits per sticker' })}</span>
              </>}
            </span>

            <button
              onClick={() => void submitAiDraw()}
              disabled={aiLoading || !aiPromptText.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading ? (
                <>
                  <span className="w-1 h-1 rounded-full bg-current animate-[dot-fade_1.2s_ease-in-out_infinite]" />
                  <span className="w-1 h-1 rounded-full bg-current animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.3s' }} />
                  <span className="w-1 h-1 rounded-full bg-current animate-[dot-fade_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.6s' }} />
                  <span className="ml-1">{t('map.drawing')}</span>
                </>
              ) : (
                <>
                  <PaperPlaneRight weight="fill" className="w-3 h-3" />
                  Draw
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* AI Draw iridescent overlay (while drawing + fade out) */}
      {aiDrawing && (
        <div
          ref={aiOverlayRef}
          className={`fixed pointer-events-none z-[140] rounded-md iridescent-overlay${aiDrawing.fading ? ' fading' : ''}`}
          style={{ left: 0, top: 0, width: 0, height: 0 }}
        >
          {/* Glittering sparkles */}
          {!aiDrawing.fading && (
            <>
              {/* Dot sparkles */}
              {[
                { top: '8%', left: '12%', d: '1.8s', del: '0s', s: '2px' },
                { top: '18%', left: '85%', d: '2.2s', del: '0.4s', s: '3px' },
                { top: '35%', left: '6%', d: '1.6s', del: '0.8s', s: '2px' },
                { top: '42%', left: '92%', d: '2.4s', del: '1.2s', s: '3px' },
                { top: '55%', left: '18%', d: '1.9s', del: '0.2s', s: '2px' },
                { top: '62%', left: '78%', d: '2.1s', del: '0.6s', s: '3px' },
                { top: '75%', left: '10%', d: '1.7s', del: '1.0s', s: '2px' },
                { top: '82%', left: '88%', d: '2.3s', del: '1.4s', s: '3px' },
                { top: '28%', left: '45%', d: '2.0s', del: '0.3s', s: '2px' },
                { top: '68%', left: '52%', d: '1.8s', del: '0.9s', s: '3px' },
                { top: '15%', left: '55%', d: '2.5s', del: '0.5s', s: '2px' },
                { top: '48%', left: '30%', d: '2.2s', del: '1.1s', s: '3px' },
                { top: '88%', left: '42%', d: '1.9s', del: '0.7s', s: '2px' },
                { top: '5%', left: '70%', d: '2.3s', del: '1.3s', s: '3px' },
                { top: '38%', left: '75%', d: '1.6s', del: '0.1s', s: '2px' },
                { top: '58%', left: '65%', d: '2.1s', del: '0.8s', s: '3px' },
              ].map((sp, i) => (
                <div
                  key={`dot-${i}`}
                  className="sparkle-particle"
                  style={{
                    top: sp.top,
                    left: sp.left,
                    width: sp.s,
                    height: sp.s,
                    ['--sparkle-duration' as string]: sp.d,
                    ['--sparkle-delay' as string]: sp.del,
                  }}
                />
              ))}
              {/* Star sparkles */}
              {[
                { top: '12%', left: '25%', d: '2.6s', del: '0s' },
                { top: '30%', left: '65%', d: '2.8s', del: '0.7s' },
                { top: '50%', left: '15%', d: '2.4s', del: '1.3s' },
                { top: '70%', left: '80%', d: '3.0s', del: '0.4s' },
                { top: '85%', left: '35%', d: '2.7s', del: '1.0s' },
                { top: '22%', left: '50%', d: '2.5s', del: '0.6s' },
                { top: '45%', left: '40%', d: '2.9s', del: '1.5s' },
                { top: '65%', left: '60%', d: '2.3s', del: '0.2s' },
              ].map((sp, i) => (
                <div
                  key={`star-${i}`}
                  className="sparkle-star"
                  style={{
                    top: sp.top,
                    left: sp.left,
                    ['--sparkle-duration' as string]: sp.d,
                    ['--sparkle-delay' as string]: sp.del,
                  }}
                />
              ))}
            </>
          )}
          {!aiDrawing.fading && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2.5 rounded-2xl bg-background border border-border shadow-lg text-foreground flex items-start gap-2.5 w-[320px] max-w-[calc(100vw-2rem)] shrink-0 z-[141]">
              <Sparkle weight="fill" className="w-3.5 h-3.5 text-primary animate-pulse mt-[3px] shrink-0" />
              {aiDrawing.flavor ? (
                <span className="text-xs leading-relaxed font-medium whitespace-pre-line">
                  {aiDrawing.flavor}
                </span>
              ) : (
                <span className="text-xs font-medium leading-relaxed">
                  Drawing "{aiDrawing.prompt.length > 60 ? aiDrawing.prompt.slice(0, 60) + '…' : aiDrawing.prompt}"
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add label modal */}
      <AddLabelModal
        open={showLabelModal}
        onClose={() => { setShowLabelModal(false); setEditingLabelId(null); }}
        onAdd={handleLabelAdd}
        editData={editingLabelId ? (() => {
          const lb = placedLabels.find(l => l.id === editingLabelId);
          return lb ? { text: lb.text, theme: lb.theme } : null;
        })() : null}
      />

      {/* Floating toolbar - hidden in read-only mode */}
      {!readOnly && (
      <div data-toolbar className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-b from-white/90 via-white/80 to-white/75 dark:from-white/15 dark:via-white/10 dark:to-white/5 backdrop-blur-xl border border-white/60 dark:border-white/15 rounded-full px-3 py-1.5 flex gap-1 items-center shadow-2xl z-50">
        <TooltipProvider delayDuration={400}>
          <Tooltip><TooltipTrigger asChild>
            <button
              className={`p-1.5 rounded-full transition-colors ${tool === 'pointer' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
              onClick={() => { setTool('pointer'); setCursorPill(null); }}
            >
              <Cursor weight={tool === 'pointer' ? 'fill' : 'duotone'} className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.pointerTip')}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <button
              className={`p-1.5 rounded-full transition-colors ${tool === 'hand' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
              onClick={() => { setTool('hand'); setCursorPill(null); }}
            >
              <Hand weight={tool === 'hand' ? 'fill' : 'duotone'} className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.panTip')}</TooltipContent></Tooltip>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <Tooltip><TooltipTrigger asChild>
            <button
              disabled={undoStack.current.length === 0}
              className="p-1.5 rounded-full transition-colors text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
              onClick={undo}
            >
              <ArrowUUpLeft weight="duotone" className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.undoTip')}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <button
              disabled={redoStack.current.length === 0}
              className="p-1.5 rounded-full transition-colors text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
              onClick={redo}
            >
              <ArrowUUpRight weight="duotone" className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.redoTip')}</TooltipContent></Tooltip>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <button
            data-color-trigger
            className="w-5 h-5 rounded-full border cursor-pointer hover:scale-110 transition-transform relative"
            style={{ backgroundColor: selectedColor, borderColor: darkenHex(selectedColor, 0.35) }}
            onClick={() => { setShowPalette(p => !p); setShowBrushPicker(false); }}
            title={t('map.pickColor')}
          />

          <MapColorPicker
            selectedColor={selectedColor}
            onSelectColor={setSelectedColor}
            open={showPalette}
            onClose={() => setShowPalette(false)}
            emptyColor={bgColorRef.current}
            onEyedropper={() => { preEyedropperToolRef.current = toolRef.current; setTool('eyedropper'); setCursorPill(null); setCursorLabel(null); }}
          />

          {/* Shape dropdown: pencil / line / rectangle / circle */}
          {(() => {
            const shapeIsActive = tool === 'draw' || tool === 'line' || tool === 'square' || tool === 'circle';
            const displayShape: ShapeTool = shapeIsActive ? (tool as ShapeTool) : lastShapeTool;
            const ShapeIcon = displayShape === 'draw' ? PencilSimple
              : displayShape === 'line' ? LineSegment
              : displayShape === 'square' ? Square
              : Circle;
            const shapes: { id: ShapeTool; icon: typeof PencilSimple; label: string }[] = [
              { id: 'draw',   icon: PencilSimple, label: t('map.drawTip') },
              { id: 'line',   icon: LineSegment,  label: t('map.lineTip') },
              { id: 'square', icon: Square,       label: t('map.rectangleTip') },
              { id: 'circle', icon: Circle,       label: t('map.circleTip') },
            ];
            return (
              <div className="relative" data-toolbar-popover>
                <Tooltip><TooltipTrigger asChild>
                  <button
                    className={`p-1.5 rounded-full transition-colors flex items-center gap-0.5 ${shapeIsActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
                    onClick={() => {
                      // If already on this shape, toggle picker; otherwise select the last-used shape.
                      if (shapeIsActive) {
                        setShowShapePicker(p => !p);
                      } else {
                        setTool(displayShape); setCursorPill(null);
                        setShowShapePicker(true);
                      }
                      setShowPalette(false);
                      setShowBrushPicker(false);
                    }}
                  >
                    <ShapeIcon weight={shapeIsActive ? 'fill' : 'duotone'} className="w-4 h-4" />
                    <CaretDown weight="bold" className="w-2.5 h-2.5 opacity-60" />
                  </button>
                </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.shapeTip')}</TooltipContent></Tooltip>

                {showShapePicker && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-gradient-to-b from-white/90 via-white/80 to-white/75 dark:from-white/15 dark:via-white/10 dark:to-white/5 backdrop-blur-xl border border-white/60 dark:border-white/15 rounded-full shadow-2xl z-50 p-1.5 flex gap-1">
                    {shapes.map(s => {
                      const Icon = s.icon;
                      const active = tool === s.id;
                      return (
                        <button
                          key={s.id}
                          title={s.label}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${active ? 'bg-primary/20 text-primary ring-1 ring-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
                          onClick={() => {
                            setTool(s.id); setCursorPill(null);
                            setShowShapePicker(false);
                          }}
                        >
                          <Icon weight={active ? 'fill' : 'duotone'} className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                )}

              </div>
            );
          })()}

          {/* Line/brush size — separate selector, visible for pencil & line tools */}
          {(tool === 'draw' || tool === 'line') && (
            <div className="relative" data-toolbar-popover>
              <Tooltip><TooltipTrigger asChild>
                <button
                  className={`p-1.5 rounded-full transition-colors flex items-center justify-center ${showBrushPicker ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
                  onClick={() => { setShowBrushPicker(p => !p); setShowShapePicker(false); setShowPalette(false); }}
                  aria-label={t('map.lineSizeTip')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-current" aria-hidden="true">
                    <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity={brushSize <= 2 ? 1 : 0.35} />
                    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" opacity={brushSize >= 3 && brushSize <= 5 ? 1 : 0.35} />
                    <line x1="2" y1="12.5" x2="14" y2="12.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity={brushSize >= 6 ? 1 : 0.35} />
                  </svg>
                </button>
              </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.lineSizeTip')}</TooltipContent></Tooltip>

              {showBrushPicker && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-gradient-to-b from-white/90 via-white/80 to-white/75 dark:from-white/15 dark:via-white/10 dark:to-white/5 backdrop-blur-xl border border-white/60 dark:border-white/15 rounded-full shadow-2xl z-50 p-1.5 flex gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map(size => (
                    <button
                      key={size}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${brushSize === size ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-white/10'}`}
                      onClick={() => { setBrushSize(size); setShowBrushPicker(false); }}
                      title={`${size}`}
                    >
                      <div
                        className="rounded-full bg-foreground"
                        style={{ width: Math.max(4, size * 2.5), height: Math.max(4, size * 2.5) }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Tooltip><TooltipTrigger asChild>
            <button
              className={`p-1.5 rounded-full transition-colors ${tool === 'fill' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
              onClick={() => { setTool('fill'); setCursorPill(null); }}
            >
              <PaintBucket weight={tool === 'fill' ? 'fill' : 'duotone'} className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.fillTip')}</TooltipContent></Tooltip>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <Tooltip><TooltipTrigger asChild>
            <button
              className={`p-1.5 rounded-full transition-colors ${tool === 'notebook' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
              onClick={() => { setTool('notebook'); setCursorLabel(null); setShowLabelModal(false); setShowPalette(false); setShowBrushPicker(false); setShowNotebookPicker(true); }}
            >
              <Notebook weight={tool === 'notebook' ? 'fill' : 'duotone'} className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.addNotebookTip')}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <button
              className={`p-1.5 rounded-full transition-colors ${tool === 'label' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
              onClick={() => { setTool('label'); setCursorPill(null); setShowNotebookPicker(false); setShowPalette(false); setShowBrushPicker(false); setShowLabelModal(true); }}
            >
              <Tag weight={tool === 'label' ? 'fill' : 'duotone'} className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.addLabelTip')}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <button
              className={`p-1.5 rounded-full transition-colors ${tool === 'delete' ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
              onClick={() => { setTool('delete'); setCursorPill(null); setCursorLabel(null); }}
            >
              <XCircle weight={tool === 'delete' ? 'fill' : 'duotone'} className="w-4 h-4" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.removeItem')}</TooltipContent></Tooltip>

          {hasAi && <>
            <div className="w-px h-4 bg-border/50 mx-0.5" />
            <Tooltip><TooltipTrigger asChild>
              <button
                className={`p-1.5 rounded-full transition-colors ${tool === 'ai' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}
                onClick={() => { setTool('ai'); setCursorPill(null); setCursorLabel(null); }}
              >
                <MagicWand weight={tool === 'ai' ? 'fill' : 'duotone'} className="w-4 h-4" />
              </button>
            </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.aiDrawTip')}</TooltipContent></Tooltip>
          </>}

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <Tooltip><TooltipTrigger asChild>
            <button className="p-1.5 rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors" onClick={() => applyZoom(1.25)}>
              <Plus weight="duotone" className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.zoomIn')}</TooltipContent></Tooltip>

          <span className="text-[10px] text-muted-foreground font-mono w-8 text-center">{zoomDisplay}%</span>

          <Tooltip><TooltipTrigger asChild>
            <button className="p-1.5 rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors" onClick={() => applyZoom(0.8)}>
              <Minus weight="duotone" className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.zoomOut')}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <button className="p-1.5 rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors" onClick={fitAll}>
              <CornersOut weight="duotone" className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('map.viewAll')}</TooltipContent></Tooltip>

          <Tooltip><TooltipTrigger asChild>
            <button
              aria-label={t('onboarding.mapModal.heading')}
              className="p-1.5 rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              onClick={() => mapGuide.show()}
            >
              <Question weight="duotone" className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger><TooltipContent side="top" className="text-xs">{t('onboarding.mapModal.heading')}</TooltipContent></Tooltip>

        </TooltipProvider>
      </div>
      )}

      {/* Notebook Preview Overlay */}
      {(previewNotepad || previewLoading) && (
        <>
          {(() => {
            const activeTheme = previewNotepad ? previewNotepad.theme : previewLoading!.theme;
            const theme = getThemeById(activeTheme);
            const darkThemes = ['midnight', 'charcoal', 'navy', 'forest', 'plum', 'slate', 'obsidian', 'mocha'];
            const surface = darkThemes.includes(activeTheme) ? 'dark' : 'light';
            return (
              <div
                data-surface={surface}
                data-map-sidebar
                className="absolute top-4 right-4 bottom-4 w-[360px] z-[60] flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden rounded-lg"
                style={{
                  boxShadow: '0 8px 60px -12px rgba(0,0,0,0.12), 0 4px 24px -8px rgba(0,0,0,0.08)',
                  border: `2px solid ${theme.preview.fg}40`,
                  background: theme.preview.bg,
                  color: theme.preview.fg,
                }}
              >
                {previewNotepad ? (
                  <div className="h-full overflow-auto">
                    <NotepadCard
                    notepad={previewNotepad}
                    isFocused={true}
                    compact
                    onFocus={() => setPreviewFocused(true)}
                    onBlur={() => {
                      setPreviewFocused(false);
                      setPreviewNotepad(null); setPreviewLoading(null);
                    }}
                    isReadOnly={readOnly}
                    onUpdate={readOnly ? undefined : async (updates) => {
                      setPreviewNotepad(prev => {
                        const next = prev ? { ...prev, ...updates } : null;
                        if (next) notepadCacheRef.current.set(next.id, next);
                        return next;
                      });
                      const { data, error } = await supabase
                        .from('notepads')
                        .update(updates)
                        .eq('id', previewNotepad.id)
                        .select('id')
                        .maybeSingle();
                      if (error || !data) return false;
                      // Sync pill on map when title or theme changes
                      if (updates.title !== undefined || updates.theme !== undefined) {
                        updatePlacedNotebooks(prev => prev.map(nb => {
                          if (nb.notepad_id !== previewNotepad.id) return nb;
                          const merged = { ...nb };
                          if (updates.title !== undefined) merged.title = updates.title;
                          if (updates.theme !== undefined) {
                            const t = getThemeById(updates.theme);
                            merged.theme = updates.theme;
                            merged.themeBg = t.preview.bg;
                            merged.themeFg = t.preview.fg;
                          }
                          return merged;
                        }));
                        bump();
                      }
                      return true;
                    }}
                    onClose={() => { setPreviewNotepad(null); setPreviewLoading(null); }}
                    />
                  </div>
                ) : (
                  <div className="h-full flex flex-col p-4 gap-3">
                    <div className="h-5 w-1/2 rounded animate-pulse" style={{ background: `${theme.preview.fg}20` }} />
                    <div className="h-3 w-full rounded animate-pulse" style={{ background: `${theme.preview.fg}15` }} />
                    <div className="h-3 w-11/12 rounded animate-pulse" style={{ background: `${theme.preview.fg}15` }} />
                    <div className="h-3 w-10/12 rounded animate-pulse" style={{ background: `${theme.preview.fg}15` }} />
                    <div className="h-3 w-9/12 rounded animate-pulse" style={{ background: `${theme.preview.fg}15` }} />
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
