import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { NotebookGrid } from '@/hooks/useNotebookGrids';
import { Project } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { ArrowLeft, SignOut, Check, Notebook, ClockClockwise, MapTrifold, UserCircle, CaretDown, ShieldCheck, BookOpen, DotsThreeVertical, Globe, Lock, Plus, Question, Scroll, Sparkle, Translate, Trash } from '@/components/ui/icons';
import { useUserCredits } from '@/hooks/useUserCredits';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ViewMode } from '@/pages/GridView';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EmojiPicker } from '@/components/EmojiPicker';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ProjectVisibilityModal } from '@/components/project/ProjectVisibilityModal';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';
import { useProfile } from '@/hooks/useProfile';
import { PROJECT_MEMORY_FLAG, useFeatureAccess } from '@/hooks/useFeatureAccess';
import { StoryModeLogo } from '@/components/brand/StoryModeLogo';

export type DashboardView = 'notes' | 'timeline' | 'map' | 'story' | 'codex';

interface HeaderProps {
  backUrl?: string;
  grid?: NotebookGrid | null;
  onGridUpdate?: (updates: Partial<NotebookGrid>) => void;
  project?: Project | null;
  onProjectUpdate?: (updates: Partial<Project>) => void;
  onAddColumn?: () => void;
  isReadOnly?: boolean;
  isOwner?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  dashboardView?: DashboardView;
  onDashboardViewChange?: (view: DashboardView) => void;
}

export function Header({
  backUrl,
  grid,
  onGridUpdate,
  project,
  onProjectUpdate,
  onAddColumn,
  isReadOnly = false,
  isOwner = true,
  viewMode,
  onViewModeChange,
  dashboardView,
  onDashboardViewChange,
}: HeaderProps) {
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const canUseCodex = useFeatureAccess(PROJECT_MEMORY_FLAG) && !isReadOnly;
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { credits } = useUserCredits();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [siblingGrids, setSiblingGrids] = useState<NotebookGrid[]>([]);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [projectLangOpen, setProjectLangOpen] = useState(false);

  // Check if current user is admin
  useEffect(() => {
    if (!user) { setIsUserAdmin(false); return; }
    const checkAdmin = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      setIsUserAdmin(!!data);
    };
    checkAdmin();
  }, [user]);

  // Fetch sibling folios when viewing a grid that belongs to a project
  useEffect(() => {
    if (!grid?.project_id) { setSiblingGrids([]); return; }
    const fetchSiblings = async () => {
      const { data } = await supabase
        .from('notebook_grids')
        .select('*')
        .eq('project_id', grid.project_id!)
        .neq('title', '__chapter_notes__')
        .order('position', { ascending: true });
      if (data) setSiblingGrids(data as NotebookGrid[]);
    };
    fetchSiblings();
  }, [grid?.project_id, grid?.id]);

  // The "entity" is either grid (folio) or project
  const entity = grid || project;
  const entityTable = grid ? 'notebook_grids' : 'projects';
  const [localTitle, setLocalTitle] = useState(entity?.title || '');
  const localTitleRef = useRef(entity?.title || '');
  const savedTitleRef = useRef(entity?.title || '');
  const confirmedTitleRef = useRef(entity?.title || '');
  const titleDirtyRef = useRef(false);
  const titleTargetRef = useRef<{ id: string; table: 'notebook_grids' | 'projects'; kind: 'grid' | 'project' } | null>(
    entity ? { id: entity.id, table: grid ? 'notebook_grids' : 'projects', kind: grid ? 'grid' : 'project' } : null,
  );
  const onGridUpdateRef = useRef(onGridUpdate);
  const onProjectUpdateRef = useRef(onProjectUpdate);
  const toastRef = useRef(toast);
  const translateRef = useRef(t);

  useEffect(() => { onGridUpdateRef.current = onGridUpdate; }, [onGridUpdate]);
  useEffect(() => { onProjectUpdateRef.current = onProjectUpdate; }, [onProjectUpdate]);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { translateRef.current = t; }, [t]);

  const flushTitle = useCallback(() => {
    const target = titleTargetRef.current;
    if (!target || !titleDirtyRef.current) return;

    const submittedTitle = localTitleRef.current.trim();
    if (!submittedTitle) {
      titleDirtyRef.current = false;
      localTitleRef.current = savedTitleRef.current;
      setLocalTitle(savedTitleRef.current);
      return;
    }

    const previousConfirmedTitle = confirmedTitleRef.current;
    titleDirtyRef.current = false;
    localTitleRef.current = submittedTitle;
    savedTitleRef.current = submittedTitle;
    setLocalTitle(submittedTitle);

    void (async () => {
      try {
        const { error } = await supabase
          .from(target.table as any)
          .update({ title: submittedTitle } as any)
          .eq('id', target.id);
        if (error) throw error;

        if (titleTargetRef.current?.id !== target.id) return;
        confirmedTitleRef.current = submittedTitle;
        if (target.kind === 'grid') {
          onGridUpdateRef.current?.({ title: submittedTitle });
          setSiblingGrids(prev => prev.map(item => item.id === target.id ? { ...item, title: submittedTitle } : item));
        } else {
          onProjectUpdateRef.current?.({ title: submittedTitle });
        }
      } catch (error: any) {
        if (titleTargetRef.current?.id === target.id) {
          confirmedTitleRef.current = previousConfirmedTitle;
          savedTitleRef.current = previousConfirmedTitle;
          if (!titleDirtyRef.current && localTitleRef.current === submittedTitle) {
            localTitleRef.current = previousConfirmedTitle;
            setLocalTitle(previousConfirmedTitle);
          } else {
            titleDirtyRef.current = localTitleRef.current.trim() !== previousConfirmedTitle;
          }
        }
        toastRef.current({
          title: translateRef.current('header.errorUpdatingTitle'),
          description: error.message,
          variant: 'destructive',
        });
      }
    })();
  }, []);

  useEffect(() => {
    const nextTarget = entity
      ? { id: entity.id, table: grid ? 'notebook_grids' as const : 'projects' as const, kind: grid ? 'grid' as const : 'project' as const }
      : null;
    const targetChanged = titleTargetRef.current?.id !== nextTarget?.id;
    if (targetChanged) flushTitle();
    titleTargetRef.current = nextTarget;

    const nextTitle = entity?.title || '';
    const hadPendingEdit = !targetChanged && titleDirtyRef.current;
    confirmedTitleRef.current = nextTitle;
    savedTitleRef.current = nextTitle;
    if (!hadPendingEdit || localTitleRef.current.trim() === nextTitle) {
      localTitleRef.current = nextTitle;
      titleDirtyRef.current = false;
      setLocalTitle(nextTitle);
    } else {
      titleDirtyRef.current = true;
    }
  }, [entity, grid, flushTitle]);

  useEffect(() => {
    if (!titleDirtyRef.current) return;
    const timeout = window.setTimeout(flushTitle, 1500);
    return () => window.clearTimeout(timeout);
  }, [localTitle, flushTitle]);

  useEffect(() => () => flushTitle(), [flushTitle]);

  const handleTitleChange = (title: string) => {
    localTitleRef.current = title;
    titleDirtyRef.current = title.trim() !== savedTitleRef.current;
    setLocalTitle(title);
  };

  const handleIconChange = async (icon: string) => {
    if (!entity) return;
    try {
      const { error } = await supabase.from(entityTable as any).update({ icon } as any).eq('id', entity.id);
      if (error) throw error;
      if (grid) onGridUpdate?.({ icon });
      if (project) onProjectUpdate?.({ icon });
    } catch (error: any) {
      toast({ title: t('header.errorUpdatingIcon'), description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!entity) return;
    try {
      const { error } = await supabase.from(entityTable as any).delete().eq('id', entity.id);
      if (error) throw error;
      if (grid) {
        navigate(grid.project_id ? `/project/${grid.project_id}` : '/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast({ title: grid ? t('header.errorDeletingFolio') : t('header.errorDeletingProject'), description: error.message, variant: 'destructive' });
    }
  };

  const handlePublicToggle = async (checked: boolean) => {
    if (!grid) return;
    try {
      const { error } = await supabase.from('notebook_grids').update({ is_public: checked }).eq('id', grid.id);
      if (error) throw error;
      onGridUpdate?.({ is_public: checked });
    } catch (error: any) {
      toast({ title: t('header.errorUpdatingVisibility'), description: error.message, variant: 'destructive' });
    }
  };

  return (
    <header className="group h-14 border-b border-border bg-card flex items-center justify-between px-4 relative">
      <div className="flex items-center gap-3">
        {backUrl ? (
          <Button variant="ghost" size="icon" aria-label={t('common.back', 'Back')} onClick={() => navigate(backUrl)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Button>
        ) : !isReadOnly && !entity ? (
          <Link to="/" aria-label="StoryMode home">
            <StoryModeLogo markClassName="h-6 w-6" wordmarkClassName="text-[22px]" />
          </Link>
        ) : null}

        {entity && (
          <div className="flex items-center gap-2 ml-2">
            {!isReadOnly && isOwner && <EmojiPicker value={entity.icon || (grid ? '📓' : '📁')} onChange={handleIconChange} />}
            {(isReadOnly || !isOwner) && <span className="text-xl">{entity.icon || (grid ? '📓' : '📁')}</span>}

            {!isReadOnly && isOwner && (
              // The box is as wide as its text: an invisible copy in the same grid cell sets the
              // width (a width in ch overshoots, since this font is letter-spaced).
              <span className={`inline-grid min-w-[4ch] ${
                grid ? 'max-w-[200px]' : 'max-w-[200px] sm:max-w-[360px] md:max-w-[520px] lg:max-w-[680px]'
              }`}>
                <span aria-hidden="true" className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre font-mono font-normal">
                  {localTitle || ' '}
                </span>
                <input
                  type="text"
                  size={1}
                  value={localTitle}
                  onChange={event => handleTitleChange(event.target.value)}
                  onBlur={flushTitle}
                  onKeyDown={event => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  aria-label={grid
                    ? t('header.folioTitle', { defaultValue: 'Folio title' })
                    : t('header.projectTitle', { defaultValue: 'Project title' })}
                  className="col-start-1 row-start-1 h-8 w-full min-w-0 border-0 bg-transparent p-0 font-mono font-normal text-foreground outline-none focus-visible:ring-0"
                />
              </span>
            )}

            {grid && grid.project_id && siblingGrids.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {!isReadOnly && isOwner ? (
                    <button
                      type="button"
                      aria-label={t('header.switchFolio', { defaultValue: 'Switch folio' })}
                      className="-ml-1 inline-flex h-7 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CaretDown size={12} strokeWidth={1.75} />
                    </button>
                  ) : (
                    <button className="flex items-center gap-1 font-mono font-normal max-w-[200px] truncate hover:text-foreground/80 transition-colors cursor-pointer outline-none focus:outline-none focus-visible:outline-none">
                      <span className="truncate">{entity.title}</span>
                      <CaretDown size={12} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                    </button>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[200px]">
                  {[...siblingGrids].sort((a, b) => a.title.localeCompare(b.title)).map(sg => {
                    const isCurrent = sg.id === grid.id;
                    return (
                      <DropdownMenuItem
                        key={sg.id}
                        className={`font-mono font-normal text-sm gap-2 ${isCurrent ? 'bg-current/10' : ''}`}
                        onClick={() => { if (!isCurrent) navigate(`/grid/${sg.id}`); }}
                      >
                        <span>{sg.icon || '📓'}</span>
                        <span className="truncate flex-1">{sg.title}</span>
                        {isCurrent && <Check weight="bold" className="w-3 h-3 opacity-60" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (isReadOnly || !isOwner) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h2 className={`font-mono font-normal truncate ${grid ? 'max-w-[200px]' : 'max-w-[200px] sm:max-w-[360px] md:max-w-[520px] lg:max-w-[680px]'}`}>{entity.title}</h2>
                  </TooltipTrigger>
                  <TooltipContent>{entity.title}</TooltipContent>
                </Tooltip>
            ) : null}
            {!isReadOnly && isOwner && (
              <DropdownMenu onOpenChange={(open) => { if (!open) setProjectLangOpen(false); }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('header.moreActions')}
                        className="-ml-1.5 h-8 w-6 text-muted-foreground opacity-30 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <DotsThreeVertical weight="bold" className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t('header.moreActions')}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                  {project && (() => {
                    const language = ((project as any)?.ai_language as string) || 'en';
                    return (
                      <>
                        <DropdownMenuItem className="gap-2 text-sm" onSelect={() => setShowVisibilityModal(true)}>
                          {(project as any).is_public
                            ? <Globe weight="duotone" className="w-4 h-4" />
                            : <Lock weight="duotone" className="w-4 h-4" />}
                          {t('header.projectVisibility')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 text-sm"
                          onSelect={(e) => { e.preventDefault(); setProjectLangOpen((v) => !v); }}
                        >
                          <Translate weight="duotone" className="w-4 h-4" />
                          <span className="flex-1">{t('project.projectLanguage')}</span>
                          {!projectLangOpen && (
                            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                              {language === 'pt-BR' ? 'PT' : 'EN'}
                            </span>
                          )}
                          <CaretDown weight="bold" className={`w-3 h-3 opacity-60 transition-transform ${projectLangOpen ? 'rotate-180' : ''}`} />
                        </DropdownMenuItem>
                        {projectLangOpen && SUPPORTED_LANGUAGES.map(l => {
                          const isCurrent = language === l.code;
                          return (
                            <DropdownMenuItem
                              key={l.code}
                              className="gap-2 pl-9 text-sm"
                              onClick={async () => {
                                if (isCurrent) return;
                                try {
                                  const { error } = await supabase
                                    .from('projects')
                                    .update({ ai_language: l.code } as any)
                                    .eq('id', project.id);
                                  if (error) throw error;
                                  onProjectUpdate?.({ ai_language: l.code } as any);
                                } catch (err: any) {
                                  toast({ title: t('header.errorUpdatingLanguage'), description: err.message, variant: 'destructive' });
                                }
                              }}
                            >
                              <span className="flex-1">{l.label}</span>
                              {isCurrent && <Check weight="bold" className="w-3 h-3 opacity-60" />}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                      </>
                    );
                  })()}
                  <DropdownMenuItem
                    className="gap-2 text-sm text-destructive focus:text-destructive"
                    onSelect={() => setShowDeleteDialog(true)}
                  >
                    <Trash size={14} className="w-4 h-4" />
                    {grid ? t('header.deleteFolio') : t('header.deleteProject')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isReadOnly && isOwner && grid && onAddColumn && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('header.addColumn')}
                    className="h-8 w-8 opacity-10 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    onClick={onAddColumn}
                  >
                    <Plus size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('header.addColumn')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {dashboardView && onDashboardViewChange && (
          <div className="flex items-center gap-1 rounded-full bg-black/[0.03] p-1 shadow-[inset_0_1px_3px_0_hsl(0_0%_0%/0.1),inset_0_1px_1px_0_hsl(0_0%_0%/0.06)]">
            {([
              { key: 'story' as const, label: t('header.story'), icon: BookOpen },
              { key: 'notes' as const, label: t('header.folios'), icon: Notebook },
              { key: 'timeline' as const, label: t('header.timeline'), icon: ClockClockwise },
              { key: 'map' as const, label: t('header.maps'), icon: MapTrifold },
              ...(canUseCodex ? [{ key: 'codex' as const, label: t('header.codex'), icon: Scroll }] : []),
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onDashboardViewChange(key)}
                className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  dashboardView === key
                    ? 'bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_0_18px_-2px_hsl(var(--primary)/0.55),inset_0_1px_0_0_hsl(0_0%_100%/0.18)] ring-1 ring-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-black/5'
                }`}
              >
                <Icon weight={dashboardView === key ? 'fill' : 'duotone'} className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {user && !grid && !isReadOnly && (
          <div className="flex items-center gap-1">
            {(
              <DropdownMenu>

                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('header.accountMenu')}
                    className="h-9 pl-1 pr-2 gap-1.5 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={profile?.avatar_url || undefined} alt="" />
                      <AvatarFallback className="text-[11px]">
                        {profileLoading ? '' : (profile?.display_name || user.email || '?').trim().charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <CaretDown weight="bold" className="w-3 h-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[220px]">
                  <DropdownMenuLabel className="truncate text-sm font-medium text-foreground">
                    {profileLoading && !profile ? t('common.loading') : profile?.display_name?.trim() || user.email}
                  </DropdownMenuLabel>
                  {(() => {
                    const total = credits.included + credits.purchased;
                    if (!total) return null;
                    const pct = Math.max(0, Math.min(100, Math.round((credits.remaining / total) * 100)));
                    return (
                      <DropdownMenuItem className="gap-2 text-sm" onClick={() => navigate('/profile')}>
                        <Sparkle weight="duotone" className="w-4 h-4 text-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-muted-foreground">AI Credits</span>
                            <span className="text-xs font-mono tabular-nums text-foreground">
                              {credits.remaining.toLocaleString()}<span className="opacity-50"> / {total.toLocaleString()}</span>
                            </span>
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })()}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-sm" onClick={() => navigate('/profile')}>
                    <UserCircle weight="duotone" className="w-4 h-4" />
                    {t('auth.myProfile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-sm"
                    onSelect={(e) => { e.preventDefault(); setLangOpen((v) => !v); }}
                  >
                    <Globe weight="duotone" className="w-4 h-4" />
                    <span className="flex-1">{t('common.language')}</span>
                    <CaretDown weight="bold" className={`w-3 h-3 opacity-60 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
                  </DropdownMenuItem>
                  {langOpen && SUPPORTED_LANGUAGES.map(l => {
                    const current = (i18n.language || 'en').startsWith('pt') ? 'pt-BR' : 'en';
                    const isCurrent = current === l.code;
                    return (
                      <DropdownMenuItem
                        key={l.code}
                        className="gap-2 pl-9 text-sm"
                        onClick={async () => {
                          setLanguage(l.code as LanguageCode);
                          if (profile) await updateProfile({ preferred_language: l.code });
                        }}
                      >
                        <span className="flex-1">{l.label}</span>
                        {isCurrent && <Check weight="bold" className="w-3 h-3 opacity-60" />}
                      </DropdownMenuItem>
                    );
                  })}

                  <DropdownMenuItem className="gap-2 text-sm" onClick={() => navigate('/guide')}>
                    <Question weight="duotone" className="w-4 h-4" />
                    {t('home.nav.guide', 'Guide')}
                  </DropdownMenuItem>
                  {isUserAdmin && (
                    <DropdownMenuItem className="gap-2 text-sm" onClick={() => navigate('/admin')}>
                      <ShieldCheck weight="duotone" className="w-4 h-4" />
                      {t('auth.admin')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-sm"
                    onClick={() => {
                      // Home first, then sign out, so the page being left can't react to the
                      // missing user on its own (and Back doesn't return to it).
                      navigate('/', { replace: true });
                      void signOut();
                    }}
                  >
                    <SignOut weight="duotone" className="w-4 h-4" />
                    {t('auth.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

          </div>
        )}

        {grid && viewMode && onViewModeChange && (
          <div className="flex items-center gap-1 rounded-full bg-black/[0.03] p-1 shadow-[inset_0_1px_3px_0_hsl(0_0%_0%/0.1),inset_0_1px_1px_0_hsl(0_0%_0%/0.06)]">
            {([
              { key: 'notebook' as const, label: t('header.notebook'), icon: Notebook },
              { key: 'timeline' as const, label: t('header.timeline'), icon: ClockClockwise },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onViewModeChange(key)}
                className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  viewMode === key
                    ? 'bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_0_18px_-2px_hsl(var(--primary)/0.55),inset_0_1px_0_0_hsl(0_0%_100%/0.18)] ring-1 ring-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-black/5'
                }`}
              >
                <Icon weight={viewMode === key ? 'fill' : 'duotone'} className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {isReadOnly && (
          <Link to="/" aria-label="StoryMode home" className="absolute left-1/2 -translate-x-1/2">
            <StoryModeLogo markClassName="h-5 w-5" wordmarkClassName="text-xl" />
          </Link>
        )}
      </div>

      {project && (
        <ProjectVisibilityModal
          open={showVisibilityModal}
          onOpenChange={setShowVisibilityModal}
          projectId={project.id}
          projectTitle={project.title}
          isPublic={(project as any).is_public ?? false}
          onPublicChange={onProjectUpdate ? (checked) => {
            onProjectUpdate({ is_public: checked } as any);
            supabase.from('projects').update({ is_public: checked } as any).eq('id', project.id).then(() => {
              // Folio visibility is enforced per folio too, so keep them in sync with the project.
              supabase.from('notebook_grids').update({ is_public: checked }).eq('project_id', project.id).then(() => {});
            });
          } : undefined}
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('header.deleteEntityTitle', { title: entity?.title })}</AlertDialogTitle>
            <AlertDialogDescription>
              {grid
                ? t('header.deleteFolioDescription')
                : t('header.deleteProjectDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
