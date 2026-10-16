import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowsClockwise, Check, Warning } from '@/components/ui/icons';
import { pendingSaves } from '@/lib/pending-saves';

type ConnectivityPhase = 'online' | 'offline' | 'checking' | 'saving' | 'save-failed' | 'saved' | 'reconnected';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const HEALTH_TIMEOUT_MS = 7000;

async function canReachStoryMode(): Promise<boolean> {
  if (!SUPABASE_URL) return navigator.onLine;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: 'GET',
      cache: 'no-store',
      headers: SUPABASE_PUBLISHABLE_KEY ? { apikey: SUPABASE_PUBLISHABLE_KEY } : undefined,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ConnectivityBanner() {
  const { t } = useTranslation();
  const saveSnapshot = useSyncExternalStore(
    pendingSaves.subscribe,
    pendingSaves.getSnapshot,
    pendingSaves.getSnapshot,
  );
  const [phase, setPhase] = useState<ConnectivityPhase>(() => navigator.onLine ? 'online' : 'offline');
  const retryPromiseRef = useRef<Promise<void> | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const wasDisconnectedRef = useRef(!navigator.onLine);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const brieflyShowSuccess = useCallback((nextPhase: 'saved' | 'reconnected') => {
    clearSuccessTimer();
    setPhase(nextPhase);
    successTimerRef.current = window.setTimeout(() => {
      successTimerRef.current = null;
      setPhase('online');
    }, 4500);
  }, [clearSuccessTimer]);

  const retry = useCallback(() => {
    if (retryPromiseRef.current) return retryPromiseRef.current;
    clearSuccessTimer();
    setPhase('checking');

    const request = (async () => {
      const reachable = await canReachStoryMode();
      if (!reachable) {
        wasDisconnectedRef.current = true;
        setPhase('offline');
        return;
      }

      const pendingBeforeFlush = pendingSaves.getSnapshot().pendingCount;
      if (pendingBeforeFlush > 0) {
        setPhase('saving');
        const saved = await pendingSaves.flushAll();
        if (saved && pendingSaves.getSnapshot().pendingCount === 0) {
          wasDisconnectedRef.current = false;
          brieflyShowSuccess('saved');
        } else {
          setPhase('save-failed');
        }
        return;
      }

      const shouldCelebrateReconnect = wasDisconnectedRef.current;
      wasDisconnectedRef.current = false;
      if (shouldCelebrateReconnect) brieflyShowSuccess('reconnected');
      else setPhase('online');
    })().finally(() => {
      retryPromiseRef.current = null;
    });

    retryPromiseRef.current = request;
    return request;
  }, [brieflyShowSuccess, clearSuccessTimer]);

  useEffect(() => {
    const handleOffline = () => {
      clearSuccessTimer();
      wasDisconnectedRef.current = true;
      setPhase('offline');
    };
    const handleOnline = () => { void retry(); };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearSuccessTimer();
    };
  }, [clearSuccessTimer, retry]);

  // Browser online/offline events are imperfect on some platforms. While the
  // app believes it is offline, probe the backend occasionally so recovery
  // and pending-save flushing do not depend on another user action.
  useEffect(() => {
    if (phase !== 'offline') return;
    const interval = window.setInterval(() => { void retry(); }, 15000);
    return () => window.clearInterval(interval);
  }, [phase, retry]);

  // A server save can fail even when navigator.onLine is still true. Verify
  // the backend in that case, then automatically make one coherent retry.
  useEffect(() => {
    if (!saveSnapshot.hasFailures || phase !== 'online') return;
    void retry();
  }, [saveSnapshot.hasFailures, phase, retry]);

  // A queued follow-up may finish just after the first reconnect flush. Only
  // then is it truthful to claim that all pending writing was saved.
  useEffect(() => {
    if (phase !== 'save-failed' || saveSnapshot.pendingCount !== 0) return;
    wasDisconnectedRef.current = false;
    brieflyShowSuccess('saved');
  }, [brieflyShowSuccess, phase, saveSnapshot.pendingCount]);

  if (phase === 'online') return null;

  const isBusy = phase === 'checking' || phase === 'saving';
  const isSuccess = phase === 'saved' || phase === 'reconnected';
  const titleKey = phase === 'offline'
    ? 'connectivity.offlineTitle'
    : phase === 'checking'
      ? 'connectivity.checkingTitle'
      : phase === 'saving'
        ? 'connectivity.savingTitle'
        : phase === 'save-failed'
          ? 'connectivity.saveFailedTitle'
          : phase === 'saved'
            ? 'connectivity.savedTitle'
            : 'connectivity.reconnectedTitle';
  const descriptionKey = phase === 'offline'
    ? 'connectivity.offlineDescription'
    : phase === 'checking'
      ? 'connectivity.checkingDescription'
      : phase === 'saving'
        ? 'connectivity.savingDescription'
        : phase === 'save-failed'
          ? 'connectivity.saveFailedDescription'
          : phase === 'saved'
            ? 'connectivity.savedDescription'
            : 'connectivity.reconnectedDescription';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[220] flex w-[calc(100vw-2rem)] max-w-md items-start gap-3 rounded-xl border border-white/15 bg-[#111723] px-4 py-3 text-white shadow-[0_18px_55px_-16px_rgba(0,0,0,0.8)]"
    >
      <div className="mt-0.5 shrink-0 text-primary">
        {isSuccess ? (
          <Check weight="bold" className="h-5 w-5" />
        ) : isBusy ? (
          <ArrowsClockwise className="h-5 w-5 animate-spin" />
        ) : (
          <Warning className="h-5 w-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t(titleKey)}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/70">
          {t(descriptionKey, { count: saveSnapshot.pendingCount })}
        </p>
      </div>
      {!isBusy && !isSuccess && (
        <button
          type="button"
          onClick={() => { void retry(); }}
          className="shrink-0 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {t('connectivity.retry')}
        </button>
      )}
    </div>
  );
}
