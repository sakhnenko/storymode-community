import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserPlan } from '@/hooks/useUserPlan';
import { CaretDown, Plus, PencilSimple, Trash, Check, X, MapTrifold, Sparkle } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { UpgradeModal } from '@/components/UpgradeModal';
import { GLASS_SURFACE_CLASS } from '@/components/ui/glass-surface';
import { SceneMapGenerator } from '@/components/story/SceneMapGenerator';
import { BLANK_MAP_BACKGROUND_COLOR } from '@/lib/map-constants';

const SHOW_AI_MAP_CREATION = false;

interface MapItem {
  id: string;
  title: string;
  position: number;
}

interface MapSelectorProps {
  currentMapId: string | null;
  onSelectMap: (mapId: string) => void;
  projectId?: string;
  readOnly?: boolean;
}

export function MapSelector({ currentMapId, onSelectMap: onSelectMapProp, projectId, readOnly }: MapSelectorProps) {
  const { t } = useTranslation();
  const lastMapKey = projectId ? `project_last_map_${projectId}` : 'last_selected_map';
  const onSelectMap = useCallback((mapId: string) => {
    localStorage.setItem(lastMapKey, mapId);
    localStorage.setItem('last_selected_map', mapId);
    onSelectMapProp(mapId);
  }, [lastMapKey, onSelectMapProp]);
  const { verifyCanCreate } = useUserPlan();
  const { user } = useAuth();
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewMapOptions, setShowNewMapOptions] = useState(false);
  const [showAiMap, setShowAiMap] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const newMapInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewMapOptions(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fetchMaps = useCallback(async () => {
    if (!user && !projectId) return;
    let mapQuery = supabase
      .from('map_canvas')
      .select('id, title, position');
    if (user) mapQuery = mapQuery.eq('user_id', user.id);
    if (projectId) mapQuery = mapQuery.eq('project_id', projectId);
    const { data } = await mapQuery.order('position', { ascending: true });
    let mapList = (data as MapItem[]) || [];

    if (mapList.length === 0 && user) {
      // Create default empty World Map only
      const inserts = [
        {
          user_id: user.id,
          title: i18n.t('map.worldMap'),
          position: 0,
          bg_color: BLANK_MAP_BACKGROUND_COLOR,
          ...(projectId ? { project_id: projectId } : {}),
        },
      ];
      const { data: newMaps } = await supabase
        .from('map_canvas')
        .insert(inserts)
        .select('id, title, position')
        .order('position', { ascending: true });
      if (newMaps) {
        mapList = newMaps as MapItem[];
      }
    }

    setMaps(mapList);
    setLoading(false);
  }, [projectId, user]);

  useEffect(() => {
    void fetchMaps();
  }, [fetchMaps]);

  useEffect(() => {
    if (!currentMapId && maps.length > 0) {
      const lastMapId =
        localStorage.getItem(lastMapKey) || localStorage.getItem('last_selected_map');
      const lastMap = lastMapId ? maps.find(m => m.id === lastMapId) : null;
      onSelectMap(lastMap ? lastMap.id : maps[0].id);
    }
  }, [maps, currentMapId, lastMapKey, onSelectMap]);

  const currentMap = maps.find(m => m.id === currentMapId);

  const handleCreate = async () => {
    if (!user || creating || !newMapName.trim()) return;
    setCreating(true);
    const position = maps.length;
    const { data } = await supabase
      .from('map_canvas')
      .insert({
        user_id: user.id,
        title: newMapName.trim(),
        position,
        bg_color: BLANK_MAP_BACKGROUND_COLOR,
        ...(projectId ? { project_id: projectId } : {}),
      })
      .select('id, title, position')
      .single();
    if (data) {
      const newMap = data as MapItem;
      setMaps(prev => [...prev, newMap]);
      onSelectMap(newMap.id);
      setOpen(false);
    }
    setCreating(false);
    setShowCreateModal(false);
    setNewMapName('');
  };

  const handleRename = async (id: string) => {
    const trimmed = editTitle.trim();
    if (!trimmed) { setEditingId(null); return; }
    await supabase.from('map_canvas').update({ title: trimmed }).eq('id', id);
    setMaps(prev => prev.map(m => m.id === id ? { ...m, title: trimmed } : m));
    setEditingId(null);
  };

  const handleDeleteCurrent = async () => {
    if (!currentMapId || maps.length <= 1) return;
    const deletedMap = maps.find(m => m.id === currentMapId);
    await supabase.from('map_canvas').delete().eq('id', currentMapId);
    // Track deleted template titles so they don't get re-created
    if (deletedMap) {
      const dismissed = JSON.parse(localStorage.getItem('dismissed_template_maps') || '[]') as string[];
      if (!dismissed.includes(deletedMap.title)) {
        dismissed.push(deletedMap.title);
        localStorage.setItem('dismissed_template_maps', JSON.stringify(dismissed));
      }
    }
    const remaining = maps.filter(m => m.id !== currentMapId);
    setMaps(remaining);
    onSelectMap(remaining[0].id);
    setShowDeleteConfirm(false);
    setOpen(false);
  };

  const startEditing = (map: MapItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(map.id);
    setEditTitle(map.title);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const beginBlankMap = async () => {
    if (!(await verifyCanCreate('map', maps.length))) {
      setShowUpgrade(true);
      return;
    }
    setShowNewMapOptions(false);
    setShowCreateModal(true);
    setNewMapName('');
    setTimeout(() => newMapInputRef.current?.focus(), 50);
  };

  const beginAiMap = async () => {
    if (!projectId) return;
    if (!(await verifyCanCreate('map', maps.length))) {
      setShowUpgrade(true);
      return;
    }
    setShowNewMapOptions(false);
    setOpen(false);
    setShowAiMap(true);
  };

  const handleAiMapCreated = async (mapId: string) => {
    await fetchMaps();
    onSelectMap(mapId);
    setShowAiMap(false);
  };

  return (
    <div data-toolbar ref={containerRef} className="absolute top-4 right-4 z-50">
      {/* Single container that expands */}
      <div className={`overflow-hidden ${GLASS_SURFACE_CLASS}`}>
        {/* Header / collapsed state */}
        <button
          onClick={() => {
            if (open) setShowNewMapOptions(false);
            setOpen(!open);
            setEditingId(null);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-foreground/5 transition-colors"
        >
          <span className="text-sm font-medium text-foreground truncate max-w-[180px]">
            {currentMap?.title || t('map.worldMap')}
          </span>
          <CaretDown
            weight="bold"
            className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform ml-auto", open && "rotate-180")}
          />
        </button>

        {/* Expanded list */}
        {open && (
          <>
            <div className="border-t border-border/50" />

            {/* Action buttons row - right below header */}
            {!readOnly && (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  onClick={() => setShowNewMapOptions(value => !value)}
                  className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-muted-foreground hover:bg-muted/15 hover:text-foreground transition-colors"
                  title={t('map.newMapTitle')}
                  aria-expanded={showNewMapOptions}
                  aria-label={t('map.newMapTitle')}
                >
                  <Plus weight="bold" className="w-4 h-4" />
                </button>
                {SHOW_AI_MAP_CREATION && projectId && (
                  <button
                    onClick={() => void beginAiMap()}
                    className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-primary hover:bg-muted/15 transition-colors"
                    title={t('map.newAiMap')}
                    aria-label={t('map.newAiMap')}
                  >
                    <Sparkle weight="bold" className="w-4 h-4" />
                  </button>
                )}
                {editingId !== currentMapId && (
                  <button
                    onClick={() => { if (!currentMap) return; setEditingId(currentMap.id); setEditTitle(currentMap.title); setTimeout(() => inputRef.current?.focus(), 0); }}
                    className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-muted-foreground hover:bg-muted/15 hover:text-foreground transition-colors"
                    title={t('common.rename')}
                  >
                    <PencilSimple weight="bold" className="w-4 h-4" />
                  </button>
                )}
                {maps.length > 1 && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-muted-foreground hover:bg-muted/15 hover:text-foreground transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash weight="bold" className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {!readOnly && showNewMapOptions && (
              <div className="border-t border-border/50 p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => void beginBlankMap()}
                  className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/15 transition-colors"
                >
                  <MapTrifold weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{t('map.newBlankMap')}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{t('map.newBlankMapDetail')}</span>
                  </span>
                </button>
                {SHOW_AI_MAP_CREATION && (
                  <button
                    type="button"
                    onClick={() => void beginAiMap()}
                    disabled={!projectId}
                    className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/15 transition-colors disabled:opacity-40"
                  >
                    <Sparkle weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{t('map.newAiMap')}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{t('map.newAiMapDetail')}</span>
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Rename inline */}
            {!loading && editingId === currentMapId && (
              <div className="px-1.5 pb-1.5">
                <form
                  className="flex items-center gap-1 px-3 py-2"
                  onSubmit={(e) => { e.preventDefault(); handleRename(currentMapId!); }}
                >
                  <input
                    ref={inputRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 bg-transparent border-b border-foreground/30 focus:border-foreground/60 focus:outline-none text-sm py-0.5"
                    onBlur={() => handleRename(currentMapId!)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
                  />
                  <button type="submit" className="p-0.5 rounded text-foreground/60 hover:text-foreground">
                    <Check weight="bold" className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* Other maps to switch to */}
            {!loading && maps.filter(m => m.id !== currentMapId).length > 0 && (
              <>
                <div className="border-t border-border/50" />
                <div className="max-h-48 overflow-y-auto p-1.5">
                  {maps.filter(m => m.id !== currentMapId).map(m => (
                    <button
                      key={m.id}
                      onClick={() => { onSelectMap(m.id); setOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted/15 transition-colors text-left truncate"
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Create Map Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => { setShowCreateModal(false); setNewMapName(''); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-background border border-border rounded-xl shadow-xl p-5 w-80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{t('map.newBlankMap')}</h3>
              <button
                onClick={() => { setShowCreateModal(false); setNewMapName(''); }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X weight="bold" className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('map.newBlankMapDetail')}</p>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <input
                ref={newMapInputRef}
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                placeholder={t('map.mapNamePlaceholder')}
                autoFocus
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setNewMapName(''); }}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newMapName.trim()}
                  className="px-3 py-1.5 rounded-lg text-sm bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors"
                >
                  {creating ? t('map.creating') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-background border border-border rounded-xl shadow-xl p-5 w-80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">{t('map.deleteMapTitle')}</h3>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X weight="bold" className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              <>{t('map.deleteMapConfirm').replace('{{name}}', '')} <span className="text-foreground font-medium">{currentMap?.title}</span>? This action cannot be undone.</>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCurrent}
                className="px-3 py-1.5 rounded-lg text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} limitType="map" />
      {projectId && showAiMap && (
        <SceneMapGenerator
          open={showAiMap}
          onOpenChange={setShowAiMap}
          projectId={projectId}
          onMapCreated={handleAiMapCreated}
        />
      )}
    </div>
  );
}
