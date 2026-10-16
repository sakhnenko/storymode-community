import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { SpinnerGap, Eye, EyeClosed } from "@/components/ui/icons";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { pickRandomBackground } from "@/lib/backgrounds";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";
import { INPUT_CLASS, LABEL_CLASS, SUBMIT_CLASS, AUTH_CARD_CLASS, AUTH_CARD_CONTENT_CLASS } from "@/lib/form-styles";
import { StoryModeLogo } from "@/components/brand/StoryModeLogo";

export default function SetPassword() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; password?: string; confirmPassword?: string }>({});
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  // Recovery links only change the password; invites also collect a name.
  const [isRecovery] = useState(() => {
    try {
      if (window.location.hash.includes("type=recovery")) return true;
      return sessionStorage.getItem("password_setup_flow") === "recovery";
    } catch {
      return false;
    }
  });

  // Wait for supabase-js to process the invite/recovery hash and hydrate the session.
  useEffect(() => {
    const timer = setTimeout(() => setChecking(false), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user && checking) setChecking(false);
  }, [user, checking]);

  // Invited users get their language from the waitlist/profile: apply it to this screen.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("user_id", user.id)
        .maybeSingle();
      const lang = data?.preferred_language;
      if (!cancelled && lang && i18n.language !== lang) {
        i18n.changeLanguage(lang);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const schema = z
      .object({
        name: isRecovery
          ? z.string().optional()
          : z.string().trim().min(1, t("auth.enterYourName", "Please enter your name")).max(80),
        password: z
          .string()
          .min(6, t("auth.minPassword"))
          .regex(/[a-zA-Z]/, t("auth.mustContainLetter"))
          .regex(/[0-9]/, t("auth.mustContainNumber"))
          .regex(/[^a-zA-Z0-9]/, t("auth.mustContainSymbol")),
        confirmPassword: z.string(),
      })
      .refine((d) => d.password === d.confirmPassword, {
        message: t("auth.passwordsNoMatch"),
        path: ["confirmPassword"],
      });

    try {
      schema.parse({ name, password, confirmPassword });
      setErrors({});
    } catch (err) {
      if (err instanceof z.ZodError) {
        const f: { name?: string; password?: string; confirmPassword?: string } = {};
        err.errors.forEach((e) => {
          if (e.path[0] === "name") f.name = e.message;
          if (e.path[0] === "password") f.password = e.message;
          if (e.path[0] === "confirmPassword") f.confirmPassword = e.message;
        });
        setErrors(f);
      }
      return;
    }

    setLoading(true);
    const trimmedName = name.trim();
    const { error } = await supabase.auth.updateUser(
      isRecovery
        ? { password }
        : { password, data: { display_name: trimmedName, full_name: trimmedName, password_set: true } },
    );
    if (error) {
      setLoading(false);
      toast({ title: t("auth.couldntSetPassword"), description: error.message, variant: "destructive" });
      return;
    }
    // Best-effort profile upsert so the name shows up everywhere immediately.
    if (user && !isRecovery) {
      await supabase
        .from("profiles")
        .upsert({ user_id: user.id, display_name: trimmedName }, { onConflict: "user_id" })
        .then(() => {}, () => {});
    }
    setLoading(false);

    toast({
      title: isRecovery ? "Password updated" : "Welcome to StoryMode!",
      description: isRecovery ? "You're signed in with your new password." : "Your password is set.",
    });
    // Strip the invite hash and go to the app.
    try {
      sessionStorage.removeItem("pending_password_setup");
      sessionStorage.removeItem("password_setup_flow");
    } catch { /* storage unavailable: nothing to clean up */ }
    window.history.replaceState(null, "", window.location.pathname);
    navigate(isRecovery ? "/dashboard" : "/welcome", { replace: true });
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SpinnerGap weight="duotone" className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-cover bg-center bg-no-repeat relative"
        style={{ backgroundImage: `url(${background.url})` }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 rounded-3xl bg-white/95 backdrop-blur-xl p-8 max-w-md">
          <StoryModeLogo className="mb-6 justify-center" markClassName="h-8 w-8" wordmarkClassName="text-3xl" />
          <h1 className="text-2xl mb-3" style={{ fontFamily: "'Boulder Mono', monospace", fontWeight: 500 }}>
            {isRecovery ? t("auth.resetExpired") : t("auth.inviteExpired")}
          </h1>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {isRecovery
              ? t("auth.resetExpiredBody")
              : t("auth.inviteExpiredBody")}
          </p>
          <Button onClick={() => navigate("/auth")}>{t("auth.goToSignIn")}</Button>
        </div>
        <BackgroundCredit background={background} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: `url(${background.url})` }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <BackgroundCredit background={background} />
      <div className="w-full max-w-lg animate-fade-in relative z-10">
        <Card className={AUTH_CARD_CLASS}>
          <CardContent className={AUTH_CARD_CONTENT_CLASS}>
            <div className="text-center mb-8">
              <StoryModeLogo
                className="justify-center"
                markClassName="h-9 w-9"
                wordmarkClassName="text-4xl"
              />
              <p className="text-sm font-medium tracking-wide text-muted-foreground mt-2">
                {isRecovery
                  ? t("auth.chooseNewPassword")
                  : t("auth.invitedIntro")}
              </p>
              {user.email && (
                <p className="text-xs text-muted-foreground/70 mt-1.5 font-mono">{user.email}</p>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {!isRecovery && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className={LABEL_CLASS}>
                  {t("auth.yourName")}
                </Label>
                <Input
                  id="name"
                  type="text"
                  autoFocus
                  placeholder={t("auth.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${INPUT_CLASS} ${errors.name ? "border-destructive" : ""}`}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="password" className={LABEL_CLASS}>
                  {t("auth.password")}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoFocus={isRecovery}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${INPUT_CLASS} pr-10 ${errors.password ? "border-destructive" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeClosed weight="duotone" className="w-4 h-4" /> : <Eye weight="duotone" className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                <p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className={LABEL_CLASS}>
                  {t("auth.confirmPassword")}
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${INPUT_CLASS} ${errors.confirmPassword ? "border-destructive" : ""}`}
                />
                {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
              </div>
              <Button type="submit" className={SUBMIT_CLASS} disabled={loading}>
                {loading && <SpinnerGap weight="duotone" className="mr-2 h-4 w-4 animate-spin" />}
                {isRecovery ? t("auth.updatePassword") : t("auth.setPasswordContinue")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}