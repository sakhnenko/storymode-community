import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { SELF_HOSTED } from "@/lib/self-hosted";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useLanguageSync } from "@/hooks/useLanguageSync";
import HomePage from "./pages/HomePage";
import Dashboard from "./pages/Dashboard";
import GridView from "./pages/GridView";
import ProjectView from "./pages/ProjectView";
import Auth from "./pages/Auth";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";
import SetPassword from "./pages/SetPassword";
import Waitlist from "./pages/Waitlist";
import Welcome from "./pages/Welcome";
import NewProject from "./pages/NewProject";
import Plans from "./pages/Plans";
import Guide from "./pages/Guide";
import { LowCreditsBanner } from "./components/credits/LowCreditsBanner";
import Seo from "@/components/seo/Seo";
import { StoryModeLogo } from "@/components/brand/StoryModeLogo";
import { ConnectivityBanner } from "@/components/connectivity/ConnectivityBanner";

const queryClient = new QueryClient();

// Signed-in app screens: keep the browser tab title accurate (and out of
// search results) instead of inheriting the last public page's title.
function AppPage({ title, path, children }: { title: string; path: string; children: React.ReactNode }) {
  return (
    <>
      <Seo
        title={`${title} — StoryMode`}
        description="Your private StoryMode workspace."
        path={path}
        noindex
      />
      {children}
    </>
  );
}

const OAUTH_STATUS_MESSAGES = [
  "Connecting to Google…",
  "Verifying your account…",
  "Setting up your session…",
  "Almost there…",
];

function hasOAuthSignals(): boolean {
  const hash = window.location.hash;
  // Invite and recovery flows have their own pages, not the OAuth loading screen.
  if (hash.includes("type=invite") || hash.includes("type=recovery")) return false;
  if (hash.includes("access_token") || hash.includes("id_token")) return true;

  try {
    return sessionStorage.getItem("oauth_pending") === "1";
  } catch {
    return false;
  }
}

function OAuthLoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "hsl(220, 20%, 8%)" }}>
      <StoryModeLogo
        className="mb-8"
        markClassName="h-8 w-8"
        wordmarkClassName="text-3xl text-primary-foreground"
      />

      <div className="relative w-10 h-10 mb-6">
        <div
          className="absolute inset-0 rounded-full border-2 animate-spin"
          style={{
            borderColor: "hsl(220, 15%, 20%)",
            borderTopColor: "hsl(172, 25%, 55%)",
          }}
        />
      </div>

      <p
        className="text-sm transition-opacity duration-500"
        style={{ fontFamily: "'Boulder Mono', monospace", fontWeight: 300, color: "hsl(220, 15%, 55%)" }}
      >
        {message}
      </p>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  useLanguageSync();
  const navigate = useNavigate();
  const [showOAuth, setShowOAuth] = useState(() => hasOAuthSignals());
  const [msgIndex, setMsgIndex] = useState(0);

  // Invite links open the welcome chat and recovery links the set-password page,
  // preserving the hash so supabase-js can hydrate the session there.
  useEffect(() => {
    const hash = window.location.hash;
    const target = hash.includes("type=invite") ? "/welcome" : hash.includes("type=recovery") ? "/set-password" : null;
    if (target && window.location.pathname !== target) {
      navigate(target + window.location.search + hash, { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!hasOAuthSignals()) return;
    setShowOAuth(true);
  }, []);

  useEffect(() => {
    if (!showOAuth) return;

    const interval = setInterval(() => {
      setMsgIndex((prev) => Math.min(prev + 1, OAUTH_STATUS_MESSAGES.length - 1));
    }, 2500);

    const timeout = setTimeout(() => {
      try {
        sessionStorage.removeItem("oauth_pending");
      } catch {
        // noop
      }
      setShowOAuth(false);
      setMsgIndex(0);
    }, 25000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [showOAuth]);

  useEffect(() => {
    if (!user || !showOAuth) return;

    try {
      sessionStorage.removeItem("oauth_pending");
    } catch {
      // noop
    }

    setShowOAuth(false);
    setMsgIndex(0);

    if (window.location.pathname === "/") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, showOAuth, navigate]);

  if (showOAuth) {
    return <OAuthLoadingScreen message={OAUTH_STATUS_MESSAGES[msgIndex]} />;
  }

  return (
    <Routes>
      {/* A self-hosted install opens straight into the app: no marketing home, waitlist or plans. */}
      <Route path="/" element={SELF_HOSTED ? <Navigate to={user ? "/dashboard" : "/auth"} replace /> : <HomePage />} />
      <Route path="/home-1" element={<HomePage variant="sections" />} />
      <Route path="/home-2" element={<HomePage variant="showcase" />} />
      <Route path="/dashboard" element={<AppPage title="Your projects" path="/dashboard"><Dashboard /></AppPage>} />
      <Route path="/grid/:gridId" element={<AppPage title="Folio" path="/grid"><GridView /></AppPage>} />
      <Route path="/project/:projectId" element={<AppPage title="Workspace" path="/project"><ProjectView /></AppPage>} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/profile" element={<AppPage title="Your account" path="/profile"><ProfilePage /></AppPage>} />
      <Route path="/admin" element={<AppPage title="Admin" path="/admin"><AdminPage /></AppPage>} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/waitlist" element={SELF_HOSTED ? <Navigate to="/auth?mode=signup" replace /> : <Waitlist />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/new-project" element={<NewProject />} />
      <Route path="/plans" element={SELF_HOSTED ? <Navigate to="/dashboard" replace /> : <Plans />} />
      <Route path="/guide" element={<Guide />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider delayDuration={150} skipDelayDuration={0}>
        <Toaster />
        <BrowserRouter>
          <LowCreditsBanner />
          <ConnectivityBanner />
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
