import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, SpinnerGap } from '@/components/ui/icons';
import { pendingSaves } from '@/lib/pending-saves';
import type { MemoryStreamEvent } from '@/hooks/useProjectMemory';
import { WRITING_KINDS, isMemoryCurrent, needsMemoryUpgrade, type MemoryChapter, type MemoryClaim, type MemoryKind, type MemoryProfile, type ProjectMemory } from '../../../supabase/functions/_shared/project-memory';

export interface ProjectMemoryProps {
  projectId: string;
  chapterId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectChapter?: (id: string) => void;
}
export interface ProjectMemoryController {
  data?: ProjectMemory;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
  saveProfile: (profile: MemoryProfile) => Promise<void>;
  editClaim: (chapterId: string, key: string, disposition: string, correction?: string) => Promise<void>;
  setIdentity: (kind: MemoryKind, a: string, b: string, same: boolean | null, keep?: string) => Promise<void>;
  analyze: (chapterId: string) => Promise<{ cached?: boolean; count?: number; rejected?: number }>;
  watchAnalysis: (chapterId: string, onEvent: (event: MemoryStreamEvent) => void) => Promise<{ cached?: boolean; count?: number; rejected?: number }>;
}
const defaultProfile: MemoryProfile = { enabled: false, register: 'auto', genre: '', guidance: '' };

export function MemoryFact({ chapter, claim, edit, onOpenSource, onEditingChange }: {
  chapter: MemoryChapter; claim: MemoryClaim;
  edit: (chapterId: string, key: string, disposition: string, correction?: string) => Promise<void>;
  onOpenSource: () => void;
  onEditingChange: (key: string, editing: boolean) => void;
}) {
  const { t } = useTranslation();
  const override = chapter.overrides[claim.key];
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState(override?.correction || claim.statement);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    onEditingChange(claim.key, editing || busy);
    return () => onEditingChange(claim.key, false);
  }, [claim.key, editing, busy, onEditingChange]);
  const change = async (disposition: string, text = '') => {
    setBusy(true); setFailed(false);
    try { await edit(chapter.id, claim.key, disposition, text); setEditing(false); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const excluded = override?.disposition === 'excluded';
  return <article className="rounded-lg border border-border bg-card p-4 space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="font-medium">{claim.subject} <span className="text-xs text-muted-foreground">· {t(`memory.kind.${claim.kind}`)}</span></h4>
      {override && <span className="text-xs text-muted-foreground">{t(`memory.status.${override.disposition}`)}</span>}
    </div>
    <p className={excluded ? 'text-sm text-muted-foreground line-through' : 'text-sm leading-relaxed'}>{override?.disposition === 'corrected' ? override.correction : claim.statement}</p>
    <p className="text-xs text-muted-foreground">{[
      t(`memory.basis.${claim.basis}`),
      claim.time && claim.time !== 'unknown' ? t(`memory.time.${claim.time}`) : '',
      claim.scope,
    ].filter(Boolean).join(' · ')}</p>
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('memory.evidence')} · {chapter.title}</summary>
      {override?.disposition === 'corrected' && <p className="mt-2">{t('memory.original')}: {claim.statement}</p>}
      <blockquote className="my-3 border-l-2 border-border pl-3 leading-relaxed whitespace-pre-wrap">{claim.quote}</blockquote>
      <Button size="sm" variant="outline" onClick={onOpenSource}>{t('memory.openChapter')}</Button>
      {!isMemoryCurrent(chapter) && <p className="mt-2 text-muted-foreground">{t('memory.staleEvidence')}</p>}
    </details>
    {editing ? <div className="space-y-2">
      <label className="block text-xs" htmlFor={`correction-${claim.key}`}>{t('memory.correction')}</label>
      <Textarea id={`correction-${claim.key}`} value={correction} onChange={e => setCorrection(e.target.value)} maxLength={2000} disabled={busy} />
      <p className="text-xs text-muted-foreground">{t('memory.correctionHint')}</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !correction.trim()} onClick={() => void change('corrected', correction.trim())}>{t('common.save')}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
      </div>
    </div> : <div className="flex flex-wrap gap-2">
      {!excluded && <>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setCorrection(override?.correction || claim.statement); setEditing(true); }}>{t('memory.correct')}</Button>
      </>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change(excluded ? 'extracted' : 'excluded')}>{t(excluded ? 'memory.restore' : 'memory.exclude')}</Button>
      {override?.disposition === 'corrected' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void change('extracted')}>{t('memory.resetFact')}</Button>}
    </div>}
    {failed && <p role="alert" className="text-xs text-destructive">{t('memory.saveFailed')}</p>}
  </article>;
}

export function ProjectMemoryPanel({ chapterId, open, onOpenChange, onSelectChapter, memory }: ProjectMemoryProps & { memory: ProjectMemoryController }) {
  const { t } = useTranslation();
  const pending = useSyncExternalStore(pendingSaves.subscribe, pendingSaves.getSnapshot);
  const [profile, setProfile] = useState<MemoryProfile>(defaultProfile);
  const [profileDirty, setProfileDirty] = useState(false);
  const [selected, setSelected] = useState(chapterId || '');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editingClaims, setEditingClaims] = useState<Set<string>>(() => new Set());
  const onEditingChange = useCallback((key: string, editing: boolean) => {
    setEditingClaims(previous => {
      if (previous.has(key) === editing) return previous;
      const next = new Set(previous);
      if (editing) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  useEffect(() => { setSelected(chapterId || ''); }, [chapterId]);
  useEffect(() => {
    if (memory.data && !profileDirty) setProfile(memory.data.profile || defaultProfile);
  }, [memory.data, profileDirty]);
  const chapters = memory.data?.chapters || [];
  const chapter = chapters.find(c => c.id === selected);
  const currentCount = chapters.filter(isMemoryCurrent).length;
  const editProfile = (patch: Partial<MemoryProfile>) => { setProfile(p => ({ ...p, ...patch })); setProfileDirty(true); };
  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try { await memory.saveProfile(profile); setProfileDirty(false); setNotice(t('memory.profileSaved')); }
    catch { setError(t('memory.saveFailed')); }
    finally { setSaving(false); }
  };
  const analyze = async () => {
    if (!selected || pending.pendingCount || !accepted) return;
    setAnalyzing(true); setError(''); setNotice('');
    try {
      const result = await memory.analyze(selected);
      setNotice(result.cached ? t('memory.cached') : t('memory.analyzed', { count: result.count, rejected: result.rejected }));
    } catch (e) {
      const code = e instanceof Error ? e.message : 'failed';
      setError(t(`memory.errors.${code}`, { defaultValue: t('memory.errors.failed') }));
      void memory.refresh();
    } finally { setAnalyzing(false); }
  };
  const openChange = (next: boolean) => {
    if (!next && profileDirty) { setError(t('memory.unsavedProfile')); return; }
    if (!next && editingClaims.size) { setError(t('memory.unsavedCorrection')); return; }
    onOpenChange(next);
  };
  return <Dialog open={open} onOpenChange={openChange}>
    <DialogContent className="flex h-[min(850px,calc(100vh-2rem))] max-w-5xl flex-col overflow-hidden p-0">
      <DialogHeader className="border-b border-border p-5 pr-12">
        <DialogTitle className="flex items-center gap-2 font-mono"><BookOpen className="h-5 w-5" />{t('memory.title')}</DialogTitle>
        <DialogDescription>{t('memory.description')}</DialogDescription>
      </DialogHeader>
      {memory.isLoading ? <p className="p-5" role="status">{t('common.loading')}</p> : memory.isError ? <div className="p-5 space-y-3">
        <p role="alert">{t('memory.unavailable')}</p><Button variant="outline" onClick={() => void memory.refetch()}>{t('memory.retry')}</Button>
      </div> : <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-5 md:grid-cols-[280px_minmax(0,1fr)]">
          <section className="space-y-4" aria-labelledby="memory-profile-heading">
            <h3 id="memory-profile-heading" className="font-medium">{t('memory.profile')}</h3>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={profile.enabled} onChange={e => editProfile({ enabled: e.target.checked })} disabled={saving} />{t('memory.enable')}
            </label>
            <label className="block text-sm">{t('memory.register')}
              <select className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm" value={profile.register} onChange={e => editProfile({ register: e.target.value as MemoryProfile['register'] })} disabled={saving}>
                {['auto', ...WRITING_KINDS].map(value => <option key={value} value={value}>{t(`memory.registers.${value}`)}</option>)}
              </select>
            </label>
            <label className="block text-sm">{t('memory.genre')}<Input className="mt-1" value={profile.genre} onChange={e => editProfile({ genre: e.target.value })} maxLength={120} disabled={saving} /></label>
            <label className="block text-sm">{t('memory.guidance')}<Textarea className="mt-1" value={profile.guidance} onChange={e => editProfile({ guidance: e.target.value })} maxLength={2000} disabled={saving} /></label>
            <p className="text-xs text-muted-foreground">{t('memory.profileHint')}</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={!profileDirty || saving} onClick={() => void save()}>{t('common.save')}</Button>
              {profileDirty && <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setProfile(memory.data?.profile || defaultProfile); setProfileDirty(false); setError(''); }}>{t('common.cancel')}</Button>}
            </div>
            <p className="text-xs text-muted-foreground">{t('memory.coverage', { count: currentCount, total: chapters.length })}</p>
            <Button size="sm" variant="ghost" onClick={() => void memory.refetch()}>{t('memory.refresh')}</Button>
          </section>
          <section className="min-w-0 space-y-4" aria-labelledby="memory-chapter-heading">
            <h3 id="memory-chapter-heading" className="font-medium">{t('memory.chapter')}</h3>
            <select aria-label={t('memory.chapter')} className="w-full rounded-md border border-input bg-background p-2 text-sm" value={selected} onChange={e => { if (editingClaims.size) { setError(t('memory.unsavedCorrection')); return; } setSelected(e.target.value); setNotice(''); setError(''); }} disabled={analyzing}>
              <option value="">{t('memory.selectChapter')}</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.title || t('story.infoUntitled')}</option>)}
            </select>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs text-muted-foreground">{t('memory.cost')}</p>
              <label className="flex gap-2 text-xs items-start"><input type="checkbox" className="mt-0.5" checked={accepted} onChange={e => setAccepted(e.target.checked)} disabled={analyzing} />{t('memory.acceptUsage')}</label>
              <Button size="sm" variant="outline" disabled={!chapter || !memory.data?.profile?.enabled || profileDirty || editingClaims.size > 0 || analyzing || chapter.status === 'running' || !accepted || pending.pendingCount > 0 || (isMemoryCurrent(chapter) && !needsMemoryUpgrade(chapter))} onClick={() => void analyze()}>
                {analyzing && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}{t(analyzing || chapter?.status === 'running' ? 'memory.analyzing' : chapter && isMemoryCurrent(chapter) ? (needsMemoryUpgrade(chapter) ? 'memory.upgrade' : 'memory.cached') : 'memory.analyze')}
              </Button>
              {pending.pendingCount > 0 && <p className="text-xs text-muted-foreground">{t('memory.pending')}</p>}
              {!memory.data?.profile?.enabled && <p className="text-xs text-muted-foreground">{t('memory.enableFirst')}</p>}
            </div>
            {chapter?.revision && !isMemoryCurrent(chapter) && <p className="text-sm text-muted-foreground">{t('memory.stale')}</p>}
            {chapter?.status === 'failed' && <p className="text-sm text-muted-foreground">{t('memory.previousFailed')}</p>}
            {chapter?.writingKind && <p className="text-xs text-muted-foreground">{t('memory.detected')}: {t(`memory.registers.${chapter.writingKind}`)}</p>}
            {chapter?.entities && chapter.entities.length > 0 && <div className="space-y-1.5 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('memory.recorded')}</p>
              {(['person', 'place', 'organization', 'object', 'system', 'concept', 'event'] as const).map(kind => {
                const list = chapter.entities!.filter(e => e.kind === kind);
                if (!list.length) return null;
                return <div key={kind} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                  <span className="text-muted-foreground">{t(`memory.kind.${kind}`)}:</span>
                  {list.map(e => <span key={e.name} className="rounded-full border border-border px-2 py-0.5" title={e.aliases.join(', ')}>
                    {e.name}<span className="text-muted-foreground"> · {t(`codex.presence.${e.presence}`)}</span>
                  </span>)}
                </div>;
              })}
            </div>}
            {chapter?.claims.length ? chapter.claims.map(claim => <MemoryFact key={`${chapter.id}-${claim.key}`} chapter={chapter} claim={claim} edit={memory.editClaim} onEditingChange={onEditingChange} onOpenSource={() => { if (profileDirty) { setError(t('memory.unsavedProfile')); return; } if (editingClaims.size) { setError(t('memory.unsavedCorrection')); return; } onSelectChapter?.(chapter.id); onOpenChange(false); }} />)
              : <p className="py-5 text-sm text-muted-foreground">{t(chapter?.revision ? 'memory.noFacts' : 'memory.empty')}</p>}
          </section>
        </div>
      </div>}
      {(notice || error) && <div className="shrink-0 border-t border-border px-5 py-3 text-sm">
        {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
      </div>}
    </DialogContent>
  </Dialog>;
}
