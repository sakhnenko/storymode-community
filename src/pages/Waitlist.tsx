import { Seo } from "@/components/seo/Seo";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ChatPageShell } from "@/components/chat/ChatPageShell";
import { WaitlistChat } from "@/components/waitlist/WaitlistChat";

export default function Waitlist() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  return (
    <ChatPageShell logoHref="/" logoLabel={t("waitlistChat.backHome")}>
      <Seo
        title="Join the StoryMode Waitlist — Write Stories. Create Worlds."
        description="Request early access to StoryMode, the creative writing studio for novelists and worldbuilders: drafts, notes, timelines, maps and an AI editor."
        path="/waitlist"
      />
      <WaitlistChat />
    </ChatPageShell>
  );
}
