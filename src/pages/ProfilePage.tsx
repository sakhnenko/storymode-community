import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserPlan } from '@/hooks/useUserPlan';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { SpinnerGap, ArrowLeft, Camera, Eye, EyeClosed, Sparkle, CreditCard, Key, Trash } from '@/components/ui/icons';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { CreditsCard } from '@/components/credits/CreditsCard';

/** A thrown value's message, for toasts. */
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
import { SELF_HOSTED } from '@/lib/self-hosted';

const passwordSchema = z.string()
  .min(6, 'Password must be at least 6 characters')
  .regex(/[a-zA-Z]/, 'Must contain at least one letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Must contain at least one symbol');

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading, updateProfile, uploadAvatar, changePassword } = useProfile();
  const { t, i18n } = useTranslation();
  const { plan, loading: planLoading, startCheckout, openPortal, subscriptionEnd } = useUserPlan();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [nameInitialized, setNameInitialized] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [savingPassword, setSavingPassword] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [managingBilling, setManagingBilling] = useState(false);

  // Bring-Your-Own-Key (OpenAI)
  const [byokLast4, setByokLast4] = useState<string | null>(null);
  const [byokLoading, setByokLoading] = useState(true);
  const [byokInput, setByokInput] = useState('');
  const [byokSaving, setByokSaving] = useState(false);
  const [byokShowInput, setByokShowInput] = useState(false);
  const [byokConfirmOpen, setByokConfirmOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_api_keys')
        .select('openai_key_last4')
        .eq('user_id', user.id)
        .maybeSingle();
      setByokLast4(data?.openai_key_last4 ?? null);
      setByokLoading(false);
    })();
  }, [user]);

  const saveByokKey = async () => {
    const trimmed = byokInput.trim();
    if (!trimmed.startsWith('sk-')) {
      toast({ title: 'Invalid key', description: 'OpenAI keys start with sk-', variant: 'destructive' });
      return;
    }
    setByokSaving(true);
    const { data, error } = await supabase.functions.invoke('manage-byok-key', {
      body: { action: 'set', apiKey: trimmed },
    });
    setByokSaving(false);
    const result = data as { error?: string; last4?: string } | null;
    if (error || result?.error) {
      toast({ title: 'Error', description: result?.error || error?.message, variant: 'destructive' });
      return;
    }
    setByokLast4(result?.last4 ?? trimmed.slice(-4));
    setByokInput('');
    setByokShowInput(false);
    toast({ title: 'OpenAI key saved', description: 'AI features now use your OpenAI account.' });
  };

  const deleteByokKey = async () => {
    setByokSaving(true);
    const { error } = await supabase.functions.invoke('manage-byok-key', { body: { action: 'delete' } });
    setByokSaving(false);
    setByokConfirmOpen(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setByokLast4(null);
    setByokInput('');
    setByokShowInput(false);
    toast({
      title: 'OpenAI key removed',
      description: 'AI features will use your built-in plan quotas again.',
    });
  };

  // Initialize display name from profile
  if (profile && !nameInitialized) {
    setDisplayName(profile.display_name || '');
    setNameInitialized(true);
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SpinnerGap weight="duotone" className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  const handleSaveName = async () => {
    setSavingName(true);
    const success = await updateProfile({ display_name: displayName.trim() || null });
    if (success) toast({ title: 'Name updated' });
    setSavingName(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Avatar must be under 2MB.', variant: 'destructive' });
      return;
    }
    setUploadingAvatar(true);
    await uploadAvatar(file);
    setUploadingAvatar(false);
  };

  const handleChangePassword = async () => {
    const result = passwordSchema.safeParse(newPassword);
    if (!result.success) {
      setPasswordErrors(result.error.errors.map(e => e.message));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrors(['Passwords do not match']);
      return;
    }
    setPasswordErrors([]);
    setSavingPassword(true);
    const success = await changePassword(newPassword);
    if (success) {
      setNewPassword('');
      setConfirmPassword('');
    }
    setSavingPassword(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    await signOut();
    navigate('/');
    toast({
      title: 'Account deletion requested',
      description: 'Please contact support to complete the process.',
    });
  };

  const initials = (profile?.display_name || user.email || '?').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft weight="duotone" className="w-4 h-4" />
        </Button>
        <h1 className="font-mono font-normal">My Profile</h1>
      </header>

      <main className="max-w-lg mx-auto p-6 space-y-6">
        {/* Avatar */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono font-normal">Profile Photo</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Avatar className="w-16 h-16">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingAvatar ? (
                  <SpinnerGap weight="duotone" className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera weight="duotone" className="w-5 h-5 text-white" />
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div>
              <p className="text-sm font-medium">{profile?.display_name || user.email}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </CardContent>
        </Card>

        {/* Display Name */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono font-normal">{t('profile.displayName')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.displayNamePlaceholder')}
            />
            <Button onClick={handleSaveName} disabled={savingName} size="sm">
              {savingName && <SpinnerGap weight="duotone" className="w-4 h-4 mr-2 animate-spin" />}
              {t('profile.saveName')}
            </Button>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono font-normal">{t('profile.language')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={(profile?.preferred_language || i18n.language || 'en') as string}
              onValueChange={async (val) => {
                const code = val as LanguageCode;
                setLanguage(code);
                await updateProfile({ preferred_language: code });
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('profile.languageHint')}</p>
          </CardContent>
        </Card>

        {/* No credits or subscriptions on a self-hosted install */}
        {!SELF_HOSTED && (<>
        {/* Credits */}
        <CreditsCard />

        {/* Plan */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono font-normal">Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="mb-2">
              <button
                onClick={() => navigate('/plans')}
                className="text-xs text-primary hover:underline font-mono"
              >
                Compare plans →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                plan === 'draft'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/15 text-primary'
              }`}>
                {plan === 'studio'
                  ? <><Sparkle weight="duotone" className="w-3.5 h-3.5" /> Studio</>
                  : plan === 'manuscript'
                  ? <><Sparkle weight="duotone" className="w-3.5 h-3.5" /> Manuscript</>
                  : 'Draft (Free)'}
              </span>
              {subscriptionEnd && (
                <span className="text-xs text-muted-foreground">
                  Renews {new Date(subscriptionEnd).toLocaleDateString()}
                </span>
              )}
            </div>

            {plan === 'draft' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Manuscript</span> — unlimited projects, folios, and maps, plus AI map drawing, OCR scanning, and chat about your story. $2/month.
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Studio</span> — everything in Manuscript, plus GPT-5–powered "Ask about selection" and chapter review highlights (Sounds wrong / Needs ideas / Mark for review). $10/month.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={async () => {
                      try { await startCheckout('manuscript'); } catch (err: unknown) {
                        toast({ title: 'Error', description: errorText(err), variant: 'destructive' });
                      }
                    }}
                  >
                    <CreditCard weight="duotone" className="w-4 h-4" />
                    Manuscript — $2/mo
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={async () => {
                      try { await startCheckout('studio'); } catch (err: unknown) {
                        toast({ title: 'Error', description: errorText(err), variant: 'destructive' });
                      }
                    }}
                  >
                    <Sparkle weight="duotone" className="w-4 h-4" />
                    Studio — $10/mo
                  </Button>
                </div>
              </div>
            ) : plan === 'manuscript' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Upgrade to <span className="font-medium text-foreground">Studio</span> for GPT-5–powered selected-text Ask AI and chapter review highlights — $10/month.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={async () => {
                      try { await startCheckout('studio'); } catch (err: unknown) {
                        toast({ title: 'Error', description: errorText(err), variant: 'destructive' });
                      }
                    }}
                  >
                    <Sparkle weight="duotone" className="w-4 h-4" />
                    Upgrade to Studio — $10/mo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={managingBilling}
                    onClick={async () => {
                      setManagingBilling(true);
                      try { await openPortal(); } catch (err: unknown) {
                        if (errorText(err).includes('administrator')) setBillingMessage(errorText(err));
                        else toast({ title: 'Error', description: errorText(err), variant: 'destructive' });
                      } finally { setManagingBilling(false); }
                    }}
                  >
                    {managingBilling && <SpinnerGap weight="duotone" className="w-4 h-4 mr-1 animate-spin" />}
                    Manage Subscription
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  You have unlimited access. Manage your billing or cancel anytime.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={managingBilling}
                  onClick={async () => {
                    setManagingBilling(true);
                    try { await openPortal(); } catch (err: unknown) {
                      if (errorText(err).includes('administrator')) {
                        setBillingMessage(errorText(err));
                      } else {
                        toast({ title: 'Error', description: errorText(err), variant: 'destructive' });
                      }
                    } finally {
                      setManagingBilling(false);
                    }
                  }}
                >
                  {managingBilling && <SpinnerGap weight="duotone" className="w-4 h-4 mr-1 animate-spin" />}
                  Manage Subscription
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        </>)}

        {/* Bring Your Own OpenAI Key (Manuscript / Studio). Self-hosted installs use the server's key. */}
        {!SELF_HOSTED && (plan === 'manuscript' || plan === 'studio') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-mono font-normal flex items-center gap-2">
                <Key weight="duotone" className="w-4 h-4" />
                Your OpenAI API Key (optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Provide your own OpenAI API key to power AI features from your account. When set,
                AI usage bypasses monthly quotas — OpenAI charges you directly. Your key is
                encrypted at rest and never sent to the browser.
              </p>
              <p className="text-xs text-muted-foreground">
                Note: AI Map Drawing requires OpenAI image generation. Anthropic Claude keys
                aren't supported because Claude can't generate images.
              </p>
              {byokLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : byokLast4 && !byokShowInput ? (
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 rounded bg-muted text-xs">sk-…{byokLast4}</code>
                  <Button size="sm" variant="outline" onClick={() => setByokShowInput(true)}>Replace</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => setByokConfirmOpen(true)}
                    disabled={byokSaving}
                  >
                    <Trash weight="duotone" className="w-4 h-4" /> Remove my API key
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={byokInput}
                    onChange={(e) => setByokInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveByokKey} disabled={byokSaving || !byokInput.trim()}>
                      {byokSaving && <SpinnerGap weight="duotone" className="w-4 h-4 mr-1 animate-spin" />}
                      Save key
                    </Button>
                    {byokLast4 && (
                      <Button size="sm" variant="ghost" onClick={() => { setByokShowInput(false); setByokInput(''); }}>Cancel</Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <AlertDialog open={byokConfirmOpen} onOpenChange={setByokConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove your OpenAI API key?</AlertDialogTitle>
              <AlertDialogDescription>
                Your key will be deleted from our servers. AI features will stop using your
                OpenAI account and will fall back to the built-in monthly quotas included with
                your plan. You can add a key again anytime.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={byokSaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); deleteByokKey(); }}
                disabled={byokSaving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {byokSaving && <SpinnerGap weight="duotone" className="w-4 h-4 mr-1 animate-spin" />}
                Remove key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Change Password */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-mono font-normal">Change Password</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">New Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeClosed weight="duotone" className="w-4 h-4" /> : <Eye weight="duotone" className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Confirm Password</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {passwordErrors.length > 0 && (
              <div className="space-y-1">
                {passwordErrors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">{err}</p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Must contain at least one letter, one number, and one symbol.
            </p>
            <Button onClick={handleChangePassword} disabled={savingPassword} size="sm">
              {savingPassword && <SpinnerGap weight="duotone" className="w-4 h-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </CardContent>
        </Card>

        {/* Delete Account */}
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-sm font-mono font-normal text-destructive">Danger Zone</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Once you delete your account, all your data will be permanently removed. This action cannot be undone.
            </p>
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all associated data. Type <strong>DELETE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!billingMessage} onOpenChange={() => setBillingMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin-Managed Plan</DialogTitle>
            <DialogDescription>{billingMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setBillingMessage(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
