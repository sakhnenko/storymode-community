import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export const CHAPTER_MAP_OUTLINE_FLAG = 'chapter_map_outline' as const;
export const PROJECT_MEMORY_FLAG = 'project_memory' as const;
/** Book-wide AI editor answers from project memory and matching passages instead of the full text. */
export const MEMORY_BOOK_CONTEXT_FLAG = 'memory_book_context' as const;
/** The AI editor's current speed tiers (Fast short on Gemini 2.5 Flash, Thoughtful on Gemini 3.6 Flash). */
export const EDITOR_SPEED_TIERS_FLAG = 'editor_speed_tiers' as const;
/** The home page's light feature showcase instead of the original feature sections. */
export const HOME_SHOWCASE_FLAG = 'home_showcase' as const;

export function useFeatureAccess(key: string) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['feature-access', user?.id, key],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_use_feature', { _key: key });
      if (error) throw error;
      return data === true;
    },
    retry: false,
    refetchOnWindowFocus: true,
  });
  // Fail closed while loading or if the flag service cannot be reached.
  return query.data === true && !query.isError;
}

/**
 * A flag for pages signed-out visitors see too. Signed in, it follows the
 * rollout (admins, everyone or off); signed out, it's on only when open to
 * everyone. `undefined` until known.
 */
export function usePublicFeature(key: string) {
  const { user, loading } = useAuth();
  const query = useQuery({
    queryKey: ['public-feature', user?.id ?? null, key],
    enabled: !loading,
    queryFn: async () => {
      const { data, error } = user
        ? await supabase.rpc('can_use_feature', { _key: key })
        : await supabase.rpc('feature_open_to_everyone', { _key: key });
      if (error) throw error;
      return data === true;
    },
    retry: false,
    staleTime: 60_000,
  });
  // Fail closed if the flag service cannot be reached.
  if (query.isError) return false;
  return query.data;
}
