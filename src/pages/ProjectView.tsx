import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotebookGrids } from "@/hooks/useNotebookGrids";
import { useUserPlan } from "@/hooks/useUserPlan";
import { Header, DashboardView } from "@/components/layout/Header";
import { Project } from "@/hooks/useProjects";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { SpinnerGap, SquaresFour, Plus } from "@/components/ui/icons";
import { ViewLoadingOverlay } from "@/components/ui/ViewLoadingOverlay";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableCanvasCard } from "@/components/dashboard/SortableCanvasCard";
import { GlobalTimelineView } from "@/components/notepad/GlobalTimelineView";
import { MapCanvas } from "@/components/dashboard/MapCanvas";
import { MapSelector } from "@/components/dashboard/MapSelector";
import { StoryView } from "@/components/story/StoryView";
import { CodexView } from "@/components/codex/CodexView";
import { UpgradeModal } from "@/components/UpgradeModal";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";


import { TimelineOnboarding, useTimelineOnboarding } from "@/components/onboarding/TimelineOnboarding";
import { useTranslation } from "react-i18next";
import { pickRandomBackground } from "@/lib/backgrounds";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";

const withClientTimeout = async <T,>(thenable: PromiseLike<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(thenable as any) as Promise<T>, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

const ProjectView = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const mapIdParam = searchParams.get("mapId");
  const dashboardView: DashboardView =
    viewParam === "timeline" || viewParam === "map" || viewParam === "story" || viewParam === "codex" ? viewParam : "notes";
  const currentMapId = mapIdParam;
  const { grids, loading, createGrid, createGridWithNotes, reorderGrids } = useNotebookGrids(projectId, {
    enabled: dashboardView === "notes",
  });
  const { verifyCanCreate } = useUserPlan();
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  useEffect(() => {
    let cancelled = false;
    const fetchProject = async () => {
      if (!projectId || authLoading) return;

      try {
        const { data, error } = await withClientTimeout<any>(
          supabase
            .from("projects" as any)
            .select("id,user_id,title,icon,position,created_at,updated_at,ai_language")
            .eq("id", projectId)
            .maybeSingle(),
          dashboardView === "map" ? 3500 : 8000,
          "Loading project"
        );

        if (cancelled) return;

        if (error || !data) {
          if (!user) {
            navigate("/");
            return;
          }
          navigate("/dashboard");
          return;
        }

        setProject(data as unknown as Project);
        setProjectLoading(false);
      } catch (error) {
        if (cancelled) return;
        // When the backend is slow, don't block the map behind the project
        // shell. The map queries still enforce access at the data layer.
        if (dashboardView === "map" && user) {
          setProject({
            id: projectId,
            user_id: user.id,
            title: "",
            icon: "📁",
            position: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          setProjectLoading(false);
          return;
        }
        console.warn("Project load failed:", error);
      }
    };
    fetchProject();
    return () => { cancelled = true; };
  }, [projectId, user, authLoading, navigate, dashboardView]);

  // Restore last view/map for this project on first load if URL has no params
  useEffect(() => {
    if (!projectId) return;
    if (viewParam || mapIdParam) return;
    const storedView = localStorage.getItem(`project_last_view_${projectId}`);
    const storedMap = localStorage.getItem(`project_last_map_${projectId}`);
    if (!storedView || storedView === "notes") return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", storedView);
        if (storedView === "map" && storedMap) next.set("mapId", storedMap);
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Persist current view and map per project
  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(`project_last_view_${projectId}`, dashboardView);
  }, [projectId, dashboardView]);
  useEffect(() => {
    if (!projectId || !currentMapId) return;
    localStorage.setItem(`project_last_map_${projectId}`, currentMapId);
  }, [projectId, currentMapId]);

  const setDashboardView = useCallback(
    (view: DashboardView) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (view === "notes") {
            next.delete("view");
            next.delete("mapId");
          } else {
            next.set("view", view);
            if (view !== "map") next.delete("mapId");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // A Codex source opens its chapter with the quote highlighted.
  const [jumpToQuote, setJumpToQuote] = useState<{ chapterId: string; quote: string } | null>(null);
  const clearJumpToQuote = useCallback(() => setJumpToQuote(null), []);
  const openChapter = useCallback(
    (chapterId: string, quote?: string) => {
      setJumpToQuote(quote ? { chapterId, quote } : null);
      // StoryView reopens the chapter it last showed for this project.
      try {
        localStorage.setItem(`storymode:story:${projectId}:active`, chapterId);
      } catch {
        // storage unavailable; Story opens its default chapter
      }
      setDashboardView("story");
    },
    [projectId, setDashboardView],
  );

  const handleSelectMap = useCallback(
    (mapId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", "map");
          next.set("mapId", mapId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visibleGrids = grids.filter((g) => g.title !== "__chapter_notes__");

  const isOwner = !!user && !!project && user.id === project.user_id;
  const [timelineEmpty, setTimelineEmpty] = useState(false);
  const timelineOnboarding = useTimelineOnboarding(
    projectId,
    isOwner && dashboardView === "timeline" && timelineEmpty,
  );

  const handleProjectUpdate = (updates: Partial<Project>) => {
    if (project) setProject({ ...project, ...updates });
  };

  const handleCreateGrid = async () => {
    if (!(await verifyCanCreate("folio", visibleGrids.length))) {
      setShowUpgrade(true);
      return;
    }
    setIsCreating(true);
    const grid = await createGrid(t("dashboard.newFolio"));
    setIsCreating(false);
    if (grid) navigate(`/grid/${grid.id}`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = grids.findIndex((g) => g.id === active.id);
      const newIndex = grids.findIndex((g) => g.id === over.id);
      reorderGrids(arrayMove(grids, oldIndex, newIndex));
    }
  };

  if (authLoading || projectLoading) {
    // For timeline/map/story we have themed overlays — render them right away
    // so the user doesn't see a generic white spinner first.
    if (dashboardView === "timeline" || dashboardView === "map" || dashboardView === "story") {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <ViewLoadingOverlay view={dashboardView} />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SpinnerGap weight="duotone" className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) return null;

  const isReadOnly = !user || user.id !== project.user_id;

  const SkeletonGrid = () => (
    <div className="flex flex-wrap gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="w-44 h-44 rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm overflow-hidden animate-pulse"
        >
          <div className="h-full flex flex-col items-center justify-center p-2">
            <div className="w-8 h-8 rounded-full bg-white/20 mb-2" />
            <div className="w-3/4 h-3 rounded bg-white/20" />
          </div>
        </div>
      ))}
    </div>
  );

  if (dashboardView !== "notes") {
    return (
      <>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <Header
            backUrl={isReadOnly ? "/" : "/dashboard"}
            project={project}
            onProjectUpdate={isReadOnly ? undefined : handleProjectUpdate}
            dashboardView={dashboardView}
            onDashboardViewChange={setDashboardView}
            isReadOnly={isReadOnly}
          />
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
            {dashboardView === "timeline" ? (
              <GlobalTimelineView projectId={projectId} readOnly={isReadOnly} onEmptyChange={setTimelineEmpty} />
            ) : dashboardView === "story" ? (
              <StoryView
                projectId={projectId!}
                readOnly={isReadOnly}
                jumpToQuote={jumpToQuote}
                onJumpedToQuote={clearJumpToQuote}
              />
            ) : dashboardView === "codex" ? (
              <CodexView projectId={projectId!} onOpenChapter={openChapter} />
            ) : (
              <>
                <MapCanvas mapId={currentMapId} readOnly={isReadOnly} projectId={projectId ?? null} />
                <MapSelector
                  currentMapId={currentMapId}
                  onSelectMap={handleSelectMap}
                  projectId={projectId}
                  readOnly={isReadOnly}
                />
              </>
            )}
          </main>
        </div>
        {timelineOnboarding.open && dashboardView === "timeline" && (
          <TimelineOnboarding art={background} onClose={timelineOnboarding.close} />
        )}
        <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} limitType="folio" />
      </>
    );
  }

  return (
    <>
      <div
        className="min-h-screen flex flex-col bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${background.url}")` }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header
            backUrl={isReadOnly ? "/" : "/dashboard"}
            project={project}
            onProjectUpdate={isReadOnly ? undefined : handleProjectUpdate}
            dashboardView={dashboardView}
            onDashboardViewChange={setDashboardView}
            isReadOnly={isReadOnly}
          />
          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto">
              {loading ? (
                <SkeletonGrid />
              ) : visibleGrids.length === 0 ? (
                isReadOnly ? (
                  <div className="text-center py-16">
                    <SquaresFour weight="duotone" className="w-16 h-16 mx-auto text-white/70 mb-4" />
                    <h2 className="text-xl font-medium mb-2 text-white">{t("dashboard.noFolios")}</h2>
                    <p className="text-white/70">{t("dashboard.noFoliosReader")}</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    <GlassCard className="cursor-pointer w-44 h-44" onClick={handleCreateGrid}>
                      <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                      <CardHeader className="h-full flex flex-col items-center justify-center p-2 relative z-10">
                        {isCreating ? (
                          <SpinnerGap weight="duotone" className="w-5 h-5 animate-spin text-white" />
                        ) : (
                          <>
                            <Plus weight="duotone" className="w-5 h-5 text-white/70 mb-0.5" />
                            <CardTitle className="text-xs text-white/90 font-mono font-normal">
                              {t("dashboard.newFolio")}
                            </CardTitle>
                          </>
                        )}
                      </CardHeader>
                    </GlassCard>
                  </div>
                )
              ) : (
                <DndContext
                  sensors={isReadOnly ? [] : sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={visibleGrids.map((g) => g.id)} strategy={rectSortingStrategy}>
                    <div className="flex flex-wrap gap-4">
                      {visibleGrids.map((grid) => (
                        <SortableCanvasCard key={grid.id} grid={grid} onNavigate={(id) => navigate(`/grid/${id}`)} />
                      ))}
                      {!isReadOnly && (
                        <GlassCard className="cursor-pointer w-44 h-44" onClick={handleCreateGrid}>
                          <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                          <CardHeader className="h-full flex flex-col items-center justify-center p-2 relative z-10">
                            {isCreating ? (
                              <SpinnerGap weight="duotone" className="w-5 h-5 animate-spin text-white" />
                            ) : (
                              <>
                                <Plus weight="duotone" className="w-5 h-5 text-white/70 mb-0.5" />
                                <CardTitle className="text-xs text-white/90 font-mono font-normal">
                                  {t("dashboard.newFolio")}
                                </CardTitle>
                              </>
                            )}
                          </CardHeader>
                        </GlassCard>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </main>
          <BackgroundCredit background={background} />
        </div>
      </div>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} limitType="folio" />
    </>
  );
};

export default ProjectView;
