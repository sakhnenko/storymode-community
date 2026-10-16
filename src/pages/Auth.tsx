import { Seo } from "@/components/seo/Seo";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { supabase } from "@/integrations/supabase/client";
import { INPUT_CLASS, LABEL_CLASS, SUBMIT_CLASS, AUTH_CARD_CONTENT_CLASS } from "@/lib/form-styles";
import { SELF_HOSTED } from "@/lib/self-hosted";
import { StoryModeLogo } from "@/components/brand/StoryModeLogo";

export default function Auth() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const [isLogin, setIsLogin] = useState(mode !== "signup");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  // Set once sign-up worked but the account waits for its confirmation email.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const { signIn, signUp, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Hosted sign-up goes through the waitlist invite flow. Self-hosted installs
  // sign up right here (and their /waitlist points back to this page).
  useEffect(() => {
    if (mode === "signup" && !SELF_HOSTED) navigate("/waitlist", { replace: true });
  }, [mode, navigate]);
  // If a session already existed when this page opened, don't silently redirect:
  // the user came here to sign in, and jumping straight to the dashboard as the
  // previously signed-in account looks like logging into the wrong account.
  const [existingUserEmail, setExistingUserEmail] = useState<string | null>(null);
  const [checkedExisting, setCheckedExisting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setExistingUserEmail(session?.user?.email ?? null);
      setCheckedExisting(true);
    });
  }, []);

  useEffect(() => {
    if (!checkedExisting) return;
    if (user && !existingUserEmail) navigate("/dashboard");
  }, [user, navigate, checkedExisting, existingUserEmail]);

  const validateForm = () => {
    const loginSchema = z.object({
      email: z.string().email(t('auth.validEmail')),
      password: z.string().min(6, t('auth.minPassword')),
    });
    const signupSchema = z.object({
      email: z.string().email(t('auth.validEmail')),
      password: z.string()
        .min(6, t('auth.minPassword'))
        .regex(/[a-zA-Z]/, t('auth.mustContainLetter'))
        .regex(/[0-9]/, t('auth.mustContainNumber'))
        .regex(/[^a-zA-Z0-9]/, t('auth.mustContainSymbol')),
      confirmPassword: z.string(),
    }).refine((data) => data.password === data.confirmPassword, {
      message: t('auth.passwordsNoMatch'),
      path: ["confirmPassword"],
    });

    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
      } else {
        signupSchema.parse({ email, password, confirmPassword });
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string; confirmPassword?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === "email") fieldErrors.email = err.message;
          if (err.path[0] === "password") fieldErrors.password = err.message;
          if (err.path[0] === "confirmPassword") fieldErrors.confirmPassword = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        setExistingUserEmail(null);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast({ title: t('auth.loginFailed'), description: t('auth.invalidCredentials'), variant: "destructive" });
          } else {
            toast({ title: t('auth.loginFailed'), description: error.message, variant: "destructive" });
          }
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          // On a server error (5xx) the auth library has no message to show (it
          // reads "{}"); usually Supabase couldn't send the confirmation email.
          const status = (error as { status?: number }).status ?? 0;
          if (error.message.includes("already registered")) {
            toast({ title: t('auth.accountExists'), description: t('auth.emailAlreadyRegistered'), variant: "destructive" });
          } else if (status >= 500 || error.message === "{}") {
            toast({ title: t('auth.signUpFailed'), description: t('auth.signUpServerError', { status: status || 500 }), variant: "destructive" });
          } else {
            toast({ title: t('auth.signUpFailed'), description: error.message, variant: "destructive" });
          }
        } else {
          // Without a session the account waits for its confirmation email;
          // with one (confirmation turned off), the user effect opens the app.
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) setConfirmEmail(email.trim().toLowerCase());
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrors({ email: t('auth.validEmail') });
      return;
    }
    setResettingPassword(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setResettingPassword(false);
    if (error) {
      toast({ title: t("auth.couldntSendReset"), description: error.message, variant: "destructive" });
    } else {
      toast({
        title: t("auth.checkYourEmail"),
        description: t("auth.resetSent", { email: cleanEmail }),
      });
    }
  };

  const handleResendConfirmation = async () => {
    if (!confirmEmail) return;
    setResendingConfirmation(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: confirmEmail,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setResendingConfirmation(false);
    toast(
      error
        ? { title: t("auth.signUpFailed"), description: error.message, variant: "destructive" }
        : { title: t("auth.checkYourEmail"), description: t("auth.confirmationResent") },
    );
  };

  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${background.url})` }}
    >
      <Seo
        title="Sign in to StoryMode — Write Stories. Create Worlds."
        description="Sign in to StoryMode to keep writing your story: chapter drafts, folios of notes, interactive timelines and illustrated maps of your world."
        path="/auth"
        noindex
      />
      <div className="absolute inset-0 bg-black/40" />
      <BackgroundCredit background={background} />
      <div className="w-full max-w-lg animate-fade-in relative z-10">
        <Card className="shadow-2xl border border-border/30 bg-white/95 backdrop-blur-xl rounded-[2.5rem] overflow-hidden relative before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/40 before:via-white/10 before:to-transparent before:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-tr after:from-transparent after:via-white/10 after:to-white/20 after:pointer-events-none group">
          <CardContent className={`${AUTH_CARD_CONTENT_CLASS} relative z-10`}>
            <div className="text-center mb-8">
              <StoryModeLogo
                className="justify-center"
                markClassName="h-9 w-9"
                wordmarkClassName="text-4xl"
              />
            </div>
            {existingUserEmail && (
              <div className="mb-5 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-center">
                <p className="text-sm text-foreground/80 font-meta">
                  You're already signed in as <span className="font-semibold">{existingUserEmail}</span>.
                </p>
                <div className="mt-2 flex justify-center gap-4 text-sm">
                  <button
                    type="button"
                    onClick={() => navigate("/dashboard")}
                    className="text-primary hover:text-primary/80 underline underline-offset-4"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await signOut(); setExistingUserEmail(null); }}
                    className="text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Use another account
                  </button>
                </div>
              </div>
            )}
            {confirmEmail ? (
              <div className="space-y-5 text-center">
                <h2 className="text-2xl" style={{ fontFamily: "'Boulder Mono', monospace", fontWeight: 500 }}>
                  {t("auth.checkYourEmail")}
                </h2>
                <p className="text-foreground/80">{t("auth.confirmSent", { email: confirmEmail })}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendConfirmation}
                  disabled={resendingConfirmation}
                  className="rounded-full"
                >
                  {resendingConfirmation && <SpinnerGap weight="duotone" className="mr-2 h-4 w-4 animate-spin" />}
                  {t("auth.resendConfirmation")}
                </Button>
                <div>
                  <button
                    type="button"
                    onClick={() => { setConfirmEmail(null); setIsLogin(true); setPassword(""); setConfirmPassword(""); }}
                    className="text-sm font-meta text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
                  >
                    {t("auth.goToSignIn")}
                  </button>
                </div>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="email" className={LABEL_CLASS}>
                  {t('auth.email')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${INPUT_CLASS} ${errors.email ? "border-destructive" : ""}`}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className={LABEL_CLASS}>
                  {t('auth.password')}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${INPUT_CLASS} pr-10 ${errors.password ? "border-destructive" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    {showPassword ? (
                      <EyeClosed weight="duotone" className="w-4 h-4" />
                    ) : (
                      <Eye weight="duotone" className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                {!isLogin && (
                  <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
                )}
                {isLogin && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resettingPassword}
                      className="text-xs font-meta text-primary hover:text-primary/80 underline underline-offset-4 transition-colors disabled:opacity-50"
                    >
                      {resettingPassword ? "Sending…" : "Forgot password?"}
                    </button>
                  </div>
                )}
              </div>
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className={LABEL_CLASS}>
                    {t('auth.confirmPassword')}
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
              )}
              <Button type="submit" className={SUBMIT_CLASS} disabled={loading}>
                {loading && <SpinnerGap weight="duotone" className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? t('auth.signIn') : t('auth.createAccount')}
              </Button>
            </form>


            <div className="mt-6 text-center space-y-3">
              <div className="text-sm font-meta font-normal">
                {isLogin ? (
                  <>
                    <span className="text-foreground/80">{t('auth.noAccount')}</span>{" "}
                    <button
                      type="button"
                      onClick={() => (SELF_HOSTED ? (setIsLogin(false), setErrors({})) : navigate("/waitlist"))}
                      className="text-primary hover:text-primary/80 underline underline-offset-4 hover:decoration-2 transition-colors"
                    >
                      {SELF_HOSTED ? t('auth.createAccount') : t('auth.joinWishlist')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-foreground/80">{t('auth.hasAccount')}</span>{" "}
                    <button
                      type="button"
                      onClick={() => { setIsLogin(true); setErrors({}); }}
                      className="text-primary hover:text-primary/80 underline underline-offset-4 hover:decoration-2 transition-colors"
                    >
                      {t('auth.signIn')}
                    </button>
                  </>
                )}
              </div>
              {!SELF_HOSTED && <div>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-sm font-meta font-normal text-primary hover:text-primary/80 underline underline-offset-4 hover:decoration-2 transition-colors"
                >
                  {t('auth.backToHome')}
                </button>
              </div>}
            </div>
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
