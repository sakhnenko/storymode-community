import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/layout/Header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash, PaperPlaneTilt, Plus, CaretUp, CaretDown, Info, Key, Coins } from '@/components/ui/icons';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { UserStatsSheet } from '@/components/admin/UserStatsSheet';
import { FeatureFlagsSection } from '@/components/admin/FeatureFlagsSection';
import { AiModelsSection } from '@/components/admin/AiModelsSection';
import { SignupsSection } from '@/components/admin/SignupsSection';
import { SELF_HOSTED } from '@/lib/self-hosted';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ADMIN_SCOPE, LABEL, PILL, TAB, TABLE, TABS_LIST, TITLE } from '@/components/admin/admin-ui';
import { cn } from '@/lib/utils';

// Only admins who open the tab download the benchmark and its test book.
const EditorBenchmarkSection = lazy(() => import('@/components/admin/EditorBenchmarkSection'));
// AI model choices only apply to a self-hosted install on OpenRouter.
// Self-hosted installs pick their AI models here, and skip the AI editor tab:
// its usage numbers and benchmark are for tuning the hosted app.
const TABS = (SELF_HOSTED ? ['users', 'models', 'flags'] : ['users', 'flags', 'editor']) as readonly ('users' | 'models' | 'flags' | 'editor')[];

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  invited_at: string | null;
  invited_plan: string | null;
  created_at: string;
  name: string | null;
  writing_about: string | null;
  writing_language: string | null;
  has_own_openai_key: boolean | null;
  source: string | null;
  ui_language: string | null;
  project_type: string | null;
  project_detail: string | null;
}

type Plan = 'draft' | 'manuscript' | 'studio';
type SortDir = 'asc' | 'desc';

function useSort<T>(initialKey: keyof T, initialDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<keyof T>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  const toggle = (key: keyof T) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const sortRows = (rows: T[]): T[] => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey] as unknown;
      const bv = b[sortKey] as unknown;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = (av === bv ? 0 : av ? 1 : -1);
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  };
  return { sortKey, sortDir, toggle, sortRows };
}

function SortableHead<T>({
  label, k, sort,
}: { label: string; k: keyof T; sort: ReturnType<typeof useSort<T>>; className?: string }) {
  const active = sort.sortKey === k;
  return (
    <button
      type="button"
      onClick={() => sort.toggle(k)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      {active ? (
        sort.sortDir === 'asc'
          ? <CaretUp weight="bold" className="w-3 h-3" />
          : <CaretDown weight="bold" className="w-3 h-3" />
      ) : (
        <CaretDown weight="regular" className="w-3 h-3 opacity-30" />
      )}
    </button>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.find(name => name === searchParams.get('tab')) ?? 'users';
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsUser, setStatsUser] = useState<AdminUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePlan, setInvitePlan] = useState<Plan>('draft');
  const [inviting, setInviting] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [grantTarget, setGrantTarget] = useState<AdminUser | null>(null);
  const [grantAmount, setGrantAmount] = useState<string>('100');
  const [grantNote, setGrantNote] = useState<string>('');
  const [granting, setGranting] = useState(false);

  const handleGrant = async () => {
    if (!grantTarget) return;
    const amt = parseInt(grantAmount, 10);
    if (!Number.isFinite(amt) || amt === 0) {
      toast({ title: 'Enter a non-zero amount', variant: 'destructive' });
      return;
    }
    setGranting(true);
    try {
      const { error } = await supabase.functions.invoke('admin-grant-credits', {
        body: { user_id: grantTarget.id, amount: amt, note: grantNote || null },
      });
      if (error) throw error;
      toast({ title: `Granted ${amt} credits to ${grantTarget.display_name || grantTarget.email}` });
      setGrantTarget(null);
      setGrantAmount('100');
      setGrantNote('');
    } catch (e) {
      toast({ title: 'Grant failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGranting(false);
    }
  };

  const usersSort = useSort<AdminUser>('created_at', 'desc');
  const waitlistSort = useSort<WaitlistEntry>('created_at', 'desc');

  const fetchWaitlist = async () => {
    const { data, error } = await supabase.functions.invoke('admin-users?action=waitlist-list', { body: {} });
    if (!error) setWaitlist(data?.entries || []);
    setWaitlistLoading(false);
  };

  const inviteWaitlistEntry = async (entry: WaitlistEntry, plan: string) => {
    setInvitingId(entry.id);
    const { error } = await supabase.functions.invoke('admin-users?action=invite', {
      body: { email: entry.email, plan },
    });
    if (error) {
      toast({ title: t('admin.errorSendingInvite'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('admin.invitationSent'), description: t('admin.invitedDescription', { email: entry.email, plan }) });
      fetchWaitlist();
      fetchUsers();
    }
    setInvitingId(null);
  };

  const removeWaitlistEntry = async (id: string) => {
    const { error } = await supabase.functions.invoke('admin-users?action=waitlist-delete', { body: { id } });
    if (!error) {
      setWaitlist(prev => prev.filter(e => e.id !== id));
      toast({ title: t('admin.removedFromWaitlist') });
    }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: null, method: 'GET' });
    if (error) {
      toast({ title: t('admin.errorLoadingUsers'), description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setUsers(data.users || []);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    const checkAdminAndFetch = async () => {
      const { data: roleData } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) { navigate('/dashboard'); return; }
      setIsAdmin(true);
      fetchUsers();
      fetchWaitlist();
    };
    checkAdminAndFetch();
  }, [user, authLoading, navigate]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.functions.invoke('admin-users?action=delete', { body: { userId: deleteTarget.id } });
    if (error) {
      toast({ title: t('admin.errorDeletingUser'), description: error.message, variant: 'destructive' });
    } else {
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      toast({ title: t('admin.userDeleted') });
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleResendInvite = async (u: AdminUser) => {
    setResendingId(u.id);
    const { error } = await supabase.functions.invoke('admin-users?action=reinvite', {
      body: { userId: u.id },
    });
    if (error) {
      toast({ title: t('admin.errorSendingInvite'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('admin.invitationResent'), description: u.email });
    }
    setResendingId(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const { error } = await supabase.functions.invoke('admin-users?action=invite', {
      body: { email: inviteEmail.trim(), plan: invitePlan },
    });
    if (error) {
      toast({ title: t('admin.errorSendingInvite'), description: error.message, variant: 'destructive' });
    } else {
      toast({ title: t('admin.invitationSent'), description: t('admin.invitedDescription', { email: inviteEmail, plan: invitePlan }) });
      setInviteEmail('');
      setInvitePlan('draft');
      setShowInvite(false);
      fetchUsers();
    }
    setInviting(false);
  };

  if (authLoading || (!isAdmin && loading)) {
    return (
      <div className="h-screen flex flex-col">
        <Header backUrl="/dashboard" />
        <div className="flex-1 p-6 space-y-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-screen flex flex-col bg-background', ADMIN_SCOPE)}>
      <Header backUrl="/dashboard" />
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-8 lg:px-8">
          <Tabs value={tab} onValueChange={value => setSearchParams(value === 'users' ? {} : { tab: value }, { replace: true })}>
            <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-2xl font-normal tracking-tight">{t('admin.pageTitle')}</h1>
              <TabsList className={TABS_LIST}>
                {TABS.map(name => <TabsTrigger key={name} value={name} className={TAB}>{t(`admin.tabs.${name}`)}</TabsTrigger>)}
              </TabsList>
            </div>
            <TabsContent value="users" className="mt-0">
              {SELF_HOSTED && <SignupsSection />}
              {/* Waitlist Section */}
              <div className="mb-12">
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className={TITLE}>{t('admin.waitlist')}</h2>
                  <span className="text-sm tabular-nums text-foreground/40">{waitlist.length}</span>
                </div>
                <div className={TABLE}>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead><SortableHead<WaitlistEntry> label="Name" k="name" sort={waitlistSort} /></TableHead>
                        <TableHead><SortableHead<WaitlistEntry> label={t('admin.tableEmail')} k="email" sort={waitlistSort} /></TableHead>
                        <TableHead><SortableHead<WaitlistEntry> label="Language" k="writing_language" sort={waitlistSort} /></TableHead>
                        <TableHead className="w-[80px] text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex"><SortableHead<WaitlistEntry> label="Key" k="has_own_openai_key" sort={waitlistSort} /></span>
                            </TooltipTrigger>
                            <TooltipContent>Has own OpenAI API key</TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead><SortableHead<WaitlistEntry> label={t('admin.joined')} k="created_at" sort={waitlistSort} /></TableHead>
                        <TableHead><SortableHead<WaitlistEntry> label={t('admin.status')} k="status" sort={waitlistSort} /></TableHead>
                        <TableHead className="w-[70px] text-center">Details</TableHead>
                        <TableHead className="text-right">{t('admin.inviteAs')}</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waitlistLoading ? (
                        [...Array(3)].map((_, i) => (
                          <TableRow key={i}>
                            {[...Array(9)].map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : waitlist.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            {t('admin.noWaitlist')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        waitlistSort.sortRows(waitlist).map(w => (
                          <TableRow key={w.id} className="hover:bg-muted/15">
                            <TableCell className="whitespace-nowrap font-medium">{w.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-muted-foreground">{w.email}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {w.writing_language || <span className="text-muted-foreground/60">—</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {w.has_own_openai_key ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Key weight="fill" className="w-4 h-4 text-primary inline" />
                                  </TooltipTrigger>
                                  <TooltipContent>Has own OpenAI API key</TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground/60 text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(w.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {w.status === 'invited' ? (
                                <span className="text-xs text-primary">
                                  {w.invited_plan ? t('admin.invitedAs', { plan: w.invited_plan }) : t('admin.invited')}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">{t('admin.pending')}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <Info weight="duotone" className="w-4 h-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80" align="end">
                                  <div className="space-y-3 text-sm">
                                    {(w.project_type || w.project_detail) && (
                                      <div>
                                        <div className={cn(LABEL, 'mb-1')}>Project</div>
                                        <div className="text-foreground/90">
                                          {[w.project_type, w.project_detail].filter(Boolean).join(' — ')}
                                        </div>
                                      </div>
                                    )}
                                    <div>
                                      <div className={cn(LABEL, 'mb-1')}>Writing about</div>
                                      <div className="whitespace-pre-wrap text-foreground/90">
                                        {w.writing_about || <span className="text-muted-foreground">—</span>}
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                                      <div>
                                        <div className={LABEL}>Language</div>
                                        <div>{w.writing_language || '—'}</div>
                                      </div>
                                      <div>
                                        <div className={LABEL}>App language</div>
                                        <div>{w.ui_language || '—'}</div>
                                      </div>
                                      <div>
                                        <div className={LABEL}>Own OpenAI key</div>
                                        <div>{w.has_own_openai_key ? 'Yes' : 'No'}</div>
                                      </div>
                                      <div>
                                        <div className={LABEL}>Source</div>
                                        <div>{w.source || '—'}</div>
                                      </div>
                                      <div>
                                        <div className={LABEL}>Joined</div>
                                        <div>{new Date(w.created_at).toLocaleDateString()}</div>
                                      </div>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1.5">
                                {(['draft', 'manuscript', 'studio'] as const).map(plan => (
                                  <Button
                                    key={plan}
                                    size="sm"
                                    variant="ghost"
                                    disabled={invitingId === w.id}
                                    onClick={() => inviteWaitlistEntry(w, plan)}
                                    className={cn(PILL, 'h-7 px-2.5 capitalize')}
                                  >
                                    {plan}
                                  </Button>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeWaitlistEntry(w.id)}
                                  >
                                    <Trash weight="duotone" className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('admin.removeFromWaitlist')}</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <h2 className={TITLE}>{t('admin.users')}</h2>
                  <span className="text-sm tabular-nums text-foreground/40">{users.length}</span>
                </div>
                <Button variant="ghost" size="sm" className={cn(PILL, 'gap-1.5')} onClick={() => setShowInvite(true)}>
                  <Plus weight="bold" className="w-3.5 h-3.5" />
                  {t('admin.inviteUser')}
                </Button>
              </div>

              <div className={TABLE}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead><SortableHead<AdminUser> label={t('admin.tableUser')} k="display_name" sort={usersSort} /></TableHead>
                      <TableHead><SortableHead<AdminUser> label={t('admin.tableEmail')} k="email" sort={usersSort} /></TableHead>
                      <TableHead><SortableHead<AdminUser> label={t('admin.tablePlan')} k="plan" sort={usersSort} /></TableHead>
                      <TableHead><SortableHead<AdminUser> label={t('admin.tableSignedUp')} k="created_at" sort={usersSort} /></TableHead>
                      <TableHead><SortableHead<AdminUser> label={t('admin.tableLastSignIn')} k="last_sign_in_at" sort={usersSort} /></TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      [...Array(6)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(6)].map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('admin.noUsers')}</TableCell>
                      </TableRow>
                    ) : (
                      usersSort.sortRows(users).map(u => (
                        <TableRow
                          key={u.id}
                          className="hover:bg-muted/15 cursor-pointer"
                          onClick={() => setStatsUser(u)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {u.avatar_url ? (
                                <img src={u.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-foreground/[0.06] flex items-center justify-center text-xs text-foreground/55">
                                  {(u.display_name || u.email)?.[0]?.toUpperCase()}
                                </div>
                              )}
                              {u.display_name || '—'}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <div className="inline-flex gap-0.5 rounded-full bg-foreground/[0.05] p-0.5 text-xs">
                              {(['draft', 'manuscript', 'studio'] as const).map(plan => (
                                <button
                                  key={plan}
                                  onClick={async () => {
                                    if (u.plan === plan) return;
                                    const { error } = await supabase.functions.invoke('admin-users?action=update-plan', {
                                      body: { userId: u.id, plan },
                                    });
                                    if (!error) {
                                      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, plan } : x));
                                      toast({ title: t('admin.planUpdated', { plan }) });
                                    }
                                  }}
                                  className={cn('whitespace-nowrap rounded-full px-2.5 py-1 transition-colors',
                                    u.plan === plan ? 'bg-background text-foreground shadow-sm' : 'cursor-pointer text-foreground/55 hover:text-foreground')}
                                >
                                  {plan === 'draft' ? t('admin.draft') : plan === 'manuscript' ? t('admin.manuscript') : t('admin.studio')}
                                </button>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(u.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            {u.id !== user?.id && (
                              <div className="flex items-center gap-1">
                              {/* No credits on a self-hosted install. */}
                              {!SELF_HOSTED && <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setGrantTarget(u)}
                                  >
                                    <Coins weight="duotone" className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Grant credits</TooltipContent>
                              </Tooltip>}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={resendingId === u.id}
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => handleResendInvite(u)}
                                  >
                                    <PaperPlaneTilt weight="duotone" className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{u.last_sign_in_at ? t('admin.sendLoginEmail') : t('admin.resendInvite')}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteTarget(u)}
                                  >
                                    <Trash weight="duotone" className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('admin.deleteUser')}</TooltipContent>
                              </Tooltip>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            {SELF_HOSTED && (
              <TabsContent value="models" className="mt-0">
                <AiModelsSection />
              </TabsContent>
            )}
            <TabsContent value="flags" className="mt-0">
              <FeatureFlagsSection />
            </TabsContent>
            {!SELF_HOSTED && (
              <TabsContent value="editor" className="mt-0">
                <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                  <EditorBenchmarkSection />
                </Suspense>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className={ADMIN_SCOPE}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.deleteUserTitle', { name: deleteTarget?.display_name || deleteTarget?.email })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.deleteUserDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? t('admin.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showInvite} onOpenChange={(open) => { setShowInvite(open); if (!open) { setInviteEmail(''); setInvitePlan('draft'); } }}>
        <DialogContent className={cn('max-w-md', ADMIN_SCOPE)}>
          <DialogHeader>
            <DialogTitle>{t('admin.inviteUser')}</DialogTitle>
            <DialogDescription>
              Send an invitation email. They'll set their password on first sign in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/80">Email</label>
              <Input
                type="email"
                placeholder={t('admin.emailPlaceholder')}
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/80">Plan</label>
              <div className="inline-flex rounded-full border border-border overflow-hidden text-xs font-medium">
                {(['draft', 'manuscript', 'studio'] as const).map(plan => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setInvitePlan(plan)}
                    className={`px-3 py-1.5 transition-colors capitalize ${
                      invitePlan === plan
                        ? plan === 'draft' ? 'bg-muted text-foreground' : 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {plan}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowInvite(false)} disabled={inviting}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()} className="gap-2">
                <PaperPlaneTilt weight="duotone" className="w-4 h-4" />
                {inviting ? t('admin.sending') : t('admin.sendInvite')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <UserStatsSheet user={statsUser} onOpenChange={(open) => { if (!open) setStatsUser(null); }} />

      <Dialog open={!!grantTarget} onOpenChange={(open) => { if (!open) setGrantTarget(null); }}>
        <DialogContent className={cn('max-w-md', ADMIN_SCOPE)}>
          <DialogHeader>
            <DialogTitle>Grant credits</DialogTitle>
            <DialogDescription>
              Add or subtract credits for <span className="font-medium">{grantTarget?.display_name || grantTarget?.email}</span>. Use a negative amount to deduct.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-foreground/80">Amount</label>
              <Input
                type="number"
                value={grantAmount}
                onChange={e => setGrantAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-foreground/80">Note (optional)</label>
              <Input value={grantNote} onChange={e => setGrantNote(e.target.value)} placeholder="Reason for grant" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantTarget(null)} disabled={granting}>{t('common.cancel')}</Button>
            <Button onClick={handleGrant} disabled={granting} className="gap-2">
              <Coins weight="duotone" className="w-4 h-4" />
              {granting ? 'Granting…' : 'Grant credits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
