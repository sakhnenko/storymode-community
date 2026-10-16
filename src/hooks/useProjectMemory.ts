import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorBody } from '@/lib/function-error';
import { useAuth } from '@/hooks/useAuth';
import type { MemoryKind, ProjectMemory, MemoryProfile } from '../../supabase/functions/_shared/project-memory';

export function useProjectMemory(projectId: string, enabled: boolean) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const queryKey = ['project-memory', user?.id, projectId];
  const query = useQuery({ queryKey, enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_project_memory', { _project_id: projectId });
      if (error) throw error;
      return data as unknown as ProjectMemory;
    },
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: q => q.state.data?.chapters.some(c => c.status === 'running') ? 5000 : false,
  });
  const refresh = () => cache.invalidateQueries({ queryKey });
  return { ...query, refresh,
    saveProfile: async (profile: MemoryProfile) => {
      const { error } = await supabase.from('project_writing_profiles').upsert({ project_id: projectId, ...profile });
      if (error) throw error;
      await refresh();
    },
    editClaim: async (chapterId: string, key: string, disposition: string, correction = '') => {
      const { error } = await supabase.rpc('edit_project_memory_claim', {
        _project_id: projectId, _chapter_id: chapterId, _key: key, _disposition: disposition, _correction: correction,
      });
      if (error) throw error;
      await refresh();
    },
    /** Records whether two entries of one kind are the same; `same: null` forgets the call. */
    setIdentity: async (kind: MemoryKind, a: string, b: string, same: boolean | null, keep?: string) => {
      const { error } = await supabase.rpc('set_project_memory_identity', {
        _project_id: projectId, _kind: kind, _a: a, _b: b, _same: same as boolean, _keep: keep,
      });
      if (error) throw error;
      await refresh();
    },
    analyze: async (chapterId: string) => {
      const { data, error } = await supabase.functions.invoke('project-memory', {
        body: { projectId, chapterId, acceptUsage: true },
      });
      if (error) {
        // Codes the Codex explains in the author's language; anything else reads as unavailable.
        const response = await functionErrorBody(error);
        let code = typeof response?.error === 'string' ? response.error : 'unavailable';
        if (response?.ai_request_in_progress) code = 'busy';
        if (response?.credits_exhausted) code = 'credits';
        throw new Error(code);
      }
      if (data?.error) throw new Error(data.error);
      await refresh();
      return data as { cached?: boolean; count?: number; rejected?: number };
    },
    /**
     * Analyzes a chapter while reporting what is found as it is written. Throws
     * an error code like `analyze`. The server finishes and saves even if the
     * page stops listening.
     */
    watchAnalysis: async (chapterId: string, onEvent: (event: MemoryStreamEvent) => void) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('unavailable');
      let response: Response;
      try {
        response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ projectId, chapterId, acceptUsage: true, stream: true }),
        });
      } catch { throw new Error('unavailable'); }
      if (!(response.headers.get('content-type') || '').includes('event-stream') || !response.body) {
        // Answered at once: already current, or refused before reading began.
        let payload: Record<string, unknown> | null = null;
        try { payload = await response.json(); } catch { /* no body */ }
        if (response.ok && payload?.cached) { await refresh(); return { cached: true }; }
        let code = typeof payload?.error === 'string' ? payload.error : 'unavailable';
        if (payload?.ai_request_in_progress) code = 'busy';
        if (payload?.credits_exhausted) code = 'credits';
        throw new Error(code);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let outcome: MemoryStreamEvent | null = null;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, end).trim();
            buffer = buffer.slice(end + 1);
            if (!line.startsWith('data:')) continue;
            let event: MemoryStreamEvent;
            try { event = JSON.parse(line.slice(5)); } catch { continue; }
            if (event.type === 'done' || event.type === 'error') outcome = event;
            else onEvent(event);
          }
        }
      } catch { /* connection lost; the refresh below shows whatever was saved */ }
      await refresh();
      if (outcome?.type === 'done') return { count: outcome.count, rejected: outcome.rejected };
      throw new Error(outcome?.type === 'error' ? outcome.error : 'unavailable');
    },
  };
}

/** What a chapter being read reports along the way (see the project-memory function). */
export type MemoryStreamEvent =
  | { type: 'start'; passages: number }
  | { type: 'passage'; index: number }
  | { type: 'entity'; name: string; kind: MemoryKind; sameAs: string[] }
  /** `statement` is unvalidated until the chapter is saved. */
  | { type: 'fact'; subject: string; kind: string; statement: string }
  | { type: 'done'; count: number; rejected: number }
  | { type: 'error'; error: string };
