import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import i18n, { type LanguageCode } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Seo } from "@/components/seo/Seo";
import { SpinnerGap } from "@/components/ui/icons";
import { ChatPageShell } from "@/components/chat/ChatPageShell";
import { WelcomeChat, type WelcomeChatProps } from "@/components/welcome/WelcomeChat";
import { needsPasswordSetup } from "@/lib/onboarding";

interface OnboardingRow {
  project_type: string | null;
  project_detail: string | null;
  writing_about: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
}

function isInviteLink() {
  try {
    return sessionStorage.getItem("password_setup_flow") === "invite";
  } catch {
    return false;
  }
}

/**
 * First-run welcome chat. Invite links land here directly: the chat sets up
 * the new member's first project and has them choose a password at the end.
 */
export default function Welcome() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [chat, setChat] = useState<WelcomeChatProps | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const userId = user?.id;

  useEffect(() => {
    // An invite link that no longer signs anyone in has expired; the
    // set-password page explains that and points to sign-in.
    if (!loading && !user) navigate(isInviteLink() ? "/set-password" : "/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!userId) return;
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    let cancelled = false;
    (async () => {
      const [{ data: profile }, { data: onboarding }] = await Promise.all([
        supabase.from("profiles").select("display_name, preferred_language").eq("user_id", userId).maybeSingle(),
        supabase
          .from("user_onboarding" as never)
          .select("project_type, project_detail, writing_about, completed_at, dismissed_at")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      const current = userRef.current;
      if (cancelled || !current) return;
      const row = onboarding as OnboardingRow | null;
      const needsPassword = needsPasswordSetup(current);
      const onboardingOver = Boolean(row?.completed_at || row?.dismissed_at);
      if (onboardingOver && !needsPassword) {
        navigate("/dashboard", { replace: true });
        return;
      }
      const lng: LanguageCode = profile?.preferred_language === "pt-BR" ? "pt-BR" : "en";
      if (i18n.language !== lng) i18n.changeLanguage(lng);
      setChat({
        lng,
        userId,
        email: current.email ?? "",
        firstName: (profile?.display_name ?? "").trim().split(/\s+/)[0] ?? "",
        needsPassword,
        mode: onboardingOver ? "password" : "full",
        premise: row?.writing_about ?? null,
        projectType: row?.project_type ?? null,
        projectDetail: row?.project_detail ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  return (
    <ChatPageShell
      logoHref="/dashboard"
      logoLabel="StoryMode"
      onLogoClick={(e) => {
        // Leaving the welcome chat counts as dismissing it, so the dashboard
        // doesn't bounce the member straight back here.
        e.preventDefault();
        Promise.race([
          supabase.functions.invoke("onboarding-setup", { body: { action: "dismiss" } }).catch(() => null),
          new Promise((r) => setTimeout(r, 2500)),
        ]).then(() => navigate("/dashboard", { replace: true }));
      }}
    >
      <Seo title="Welcome — StoryMode" description="Your private StoryMode workspace." path="/welcome" noindex />
      {chat ? (
        <WelcomeChat {...chat} />
      ) : (
        <div className="flex min-h-dvh items-center justify-center">
          <SpinnerGap weight="duotone" className="h-6 w-6 animate-spin text-white/80" />
        </div>
      )}
    </ChatPageShell>
  );
}
