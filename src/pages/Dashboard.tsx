import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";
import { useUserPlan } from "@/hooks/useUserPlan";
import { Header } from "@/components/layout/Header";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { SpinnerGap, Folder, Plus } from "@/components/ui/icons";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableProjectCard } from "@/components/dashboard/SortableProjectCard";
import { UpgradeModal } from "@/components/UpgradeModal";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import { GlassCard } from "@/components/ui/glass-card";
import { useTranslation } from "react-i18next";
import { pickRandomBackground } from "@/lib/backgrounds";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";
import { supabase } from "@/integrations/supabase/client";
import { needsPasswordSetup } from "@/lib/onboarding";
import { SELF_HOSTED } from "@/lib/self-hosted";

const Dashboard = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { projects, loading, reorderProjects } = useProjects();
  const { verifyCanCreate, refetch: refetchPlan } = useUserPlan();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  // Handle checkout success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      // Remove query param
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh plan after a short delay to let Stripe sync
      setTimeout(() => refetchPlan(), 2000);
    }
  }, [refetchPlan]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const welcomeKey = user ? `storymode.welcomeSeen.${user.id}` : null;

  // Invited members who left the welcome chat before choosing a password go back to finish it.
  useEffect(() => {
    if (!user || !needsPasswordSetup(user)) return;
    let cancelled = false;
    supabase
      .from("user_onboarding" as never)
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) navigate("/welcome", { replace: true });
      });
    return () => { cancelled = true; };
  }, [user, navigate]);

  // First-run welcome: shown once per account (persisted on the profile so it
  // does not reappear on another browser/device), after projects have loaded.
  useEffect(() => {
    if (!user || !welcomeKey || loading) return;
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(welcomeKey) === "1") return;
      } catch {
        // ignore
      }
      const [{ data }, { data: onboarding }] = await Promise.all([
        supabase.from("profiles").select("welcome_seen_at").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("user_onboarding" as never)
          .select("completed_at, dismissed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (data?.welcome_seen_at) {
        try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
        return;
      }
      // New members who haven't finished (or declined) the welcome chat go back to it.
      const pending = onboarding as { completed_at: string | null; dismissed_at: string | null } | null;
      if (pending && !pending.completed_at && !pending.dismissed_at) {
        navigate("/welcome", { replace: true });
        return;
      }
      // Self-hosted installs have no waitlist chat before sign-up, so a new
      // writer goes straight into the chat that sets up their first project.
      if (SELF_HOSTED && projects.length === 0) {
        try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
        void supabase.from("profiles").update({ welcome_seen_at: new Date().toISOString() }).eq("user_id", user.id);
        navigate("/new-project", { replace: true });
        return;
      }
      setShowWelcome(true);
    })();
    return () => { cancelled = true; };
  }, [user, welcomeKey, loading, navigate, projects.length]);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    try {
      if (welcomeKey) localStorage.setItem(welcomeKey, "1");
    } catch {
      // ignore
    }
    if (user) {
      supabase
        .from("profiles")
        .update({ welcome_seen_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .then(() => {}, () => {});
    }
  }, [welcomeKey, user]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  const handleCreateProject = async () => {
    dismissWelcome();
    if (!(await verifyCanCreate("project", projects.filter((p) => !p.is_starter).length))) {
      setShowUpgrade(true);
      return;
    }
    // The chat asks what it is, its genre and premise, and can bring in a first chapter.
    navigate("/new-project");
  };

  const openExampleProject = () => {
    dismissWelcome();
    const example = projects.find((p) => p.is_starter) ?? projects[0];
    if (example) navigate(`/project/${example.id}`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = projects.findIndex((p) => p.id === active.id);
      const newIndex = projects.findIndex((p) => p.id === over.id);
      reorderProjects(arrayMove(projects, oldIndex, newIndex));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SpinnerGap weight="duotone" className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const SkeletonGrid = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`aspect-square rounded-xl border-white/15 bg-white/10 backdrop-blur-sm overflow-hidden animate-pulse`}
        >
          <div className="h-full flex flex-col items-center justify-center p-4">
            <div className="w-12 h-12 rounded-full bg-white/20 mb-3" />
            <div className="w-3/4 h-4 rounded bg-white/20" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="min-h-screen flex flex-col bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url("${background.url}")` }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-6">
          <div className="max-w-6xl mx-auto">
            {loading ? (
              <SkeletonGrid />
            ) : projects.length === 0 ? (
              <div className="text-center py-16">
                <Folder weight="duotone" className="w-16 h-16 mx-auto text-white/70 mb-4" />
                <h2 className="text-xl font-medium mb-2 text-white">{t("dashboard.noProjects")}</h2>
                <p className="text-white/70 mb-6">{t("dashboard.createFirst")}</p>
                <GlassCard
                  className="inline-flex items-center justify-center w-32 h-32 cursor-pointer"
                  onClick={handleCreateProject}
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                  <CardHeader className="flex flex-col items-center justify-center p-3 relative z-10">
                    <Plus weight="duotone" className="w-8 h-8 text-white/70 mb-1" />
                    <CardTitle className="text-sm text-white/95 font-mono font-medium">
                      {t("dashboard.newProject")}
                    </CardTitle>
                  </CardHeader>
                </GlassCard>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={projects.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {projects.map((project) => (
                      <SortableProjectCard
                        key={project.id}
                        project={project}
                        onNavigate={(id) => navigate(`/project/${id}`)}
                      />
                    ))}
                    <GlassCard className="cursor-pointer aspect-square" onClick={handleCreateProject}>
                      <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                      <CardHeader className="h-full flex flex-col items-center justify-center p-3 relative z-10">
                        <Plus weight="duotone" className="w-8 h-8 text-white/70 mb-1" />
                        <CardTitle className="text-sm text-white/95 font-mono font-medium">
                          {t("dashboard.newProject")}
                        </CardTitle>
                      </CardHeader>
                    </GlassCard>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </main>
        <BackgroundCredit background={background} />
      </div>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} limitType="project" />
      {showWelcome && (
        <WelcomeModal
          open
          onClose={dismissWelcome}
          onExample={openExampleProject}
          onStart={dismissWelcome}
        />
      )}
    </div>
  );
};

export default Dashboard;
