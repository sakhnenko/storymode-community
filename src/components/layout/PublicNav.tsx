import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Check } from "@/components/ui/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { SELF_HOSTED } from '@/lib/self-hosted';
import "@/styles/storymode.css";

/**
 * Shared top nav used on public marketing surfaces (Home, Plans, etc.).
 * Renders with the "scrolled" visual state so it reads on any background.
 */
export function PublicNav() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const currentLang = i18n.language as string;

  const goSignup = () => {
    if (user) { navigate("/dashboard"); return; }
    navigate(SELF_HOSTED ? "/auth?mode=signup" : "/waitlist");
  };
  const goLogin = () => navigate(user ? "/dashboard" : "/auth?mode=login");
  const navPillLabel = user ? t("home.nav.myProjects") : SELF_HOSTED ? t("auth.createAccount") : t("home.nav.waitlistShort");

  return (
    <div className="sm-root" style={{ "--nav": "rgba(240,231,210,.9)" } as React.CSSProperties}>
      <nav className="sm-nav sm-nav--scrolled" style={{ position: "absolute" }}>
        <div className="sm-nav-left">
          <span className="sm-navmark" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            <img src="/logo.png" alt="StoryMode logo" className="sm-navmark-logo" />
            <span>Story<em>mode</em></span>
          </span>
        </div>
        <div className="sm-nav-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="sm-lang-trigger">
                <Globe weight="duotone" className="sm-lang-icon" />
                <span>{currentLang === "pt-BR" ? "PT" : "EN"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="sm-lang-dropdown">
              <div className="sm-lang-label-header">{t("common.language")}</div>
              {SUPPORTED_LANGUAGES.map((l) => {
                const isCurrent = currentLang === l.code;
                return (
                  <DropdownMenuItem
                    key={l.code}
                    className={`sm-lang-item ${isCurrent ? "sm-lang-item--active" : ""}`}
                    onClick={() => setLanguage(l.code as LanguageCode)}
                  >
                    <span>{l.label}</span>
                    {isCurrent && <Check weight="bold" className="w-3 h-3" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {!SELF_HOSTED && <span className="sm-nav-link" onClick={() => navigate("/plans")}>{t("home.nav.plans")}</span>}
          <span className="sm-nav-link" onClick={() => navigate("/guide")}>{t("home.nav.guide")}</span>
          {!user && <span className="sm-nav-link" onClick={goLogin}>{t("home.nav.login")}</span>}
          <span className="sm-pill" onClick={goSignup}>{navPillLabel}</span>
        </div>
      </nav>
    </div>
  );
}

export default PublicNav;