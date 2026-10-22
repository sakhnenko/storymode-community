import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import i18n, { type LanguageCode } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Seo } from "@/components/seo/Seo";
import { SpinnerGap } from "@/components/ui/icons";
import { ChatPageShell } from "@/components/chat/ChatPageShell";
import { WelcomeChat, type WelcomeChatProps } from "@/components/welcome/WelcomeChat";

/**
 * Dashboard → New Project: the welcome chat's project setup for any later
 * project (what it is, genre, premise, title, first chapter), without the
 * account steps. The dashboard checks the plan's project limit before coming here.
 */
export default function NewProject() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [chat, setChat] = useState<WelcomeChatProps | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("display_name, preferred_language")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data: profile }) => {
        if (cancelled) return;
        const lng: LanguageCode = profile?.preferred_language === "pt-BR" ? "pt-BR" : "en";
        if (i18n.language !== lng) i18n.changeLanguage(lng);
        setChat({
          lng,
          userId,
          email: "",
          firstName: (profile?.display_name ?? "").trim().split(/\s+/)[0] ?? "",
          needsPassword: false,
          mode: "newProject",
          premise: null,
          projectType: null,
          projectDetail: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <ChatPageShell logoHref="/dashboard" logoLabel="StoryMode">
      <Seo title="New project — StoryMode" description="Set up a new StoryMode project." path="/new-project" noindex />
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
