import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Whether the signed-in user has the admin role; false until known. */
export function useIsAdmin() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['is-admin', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: row } = await supabase.from('user_roles').select('role')
        .eq('user_id', user!.id).eq('role', 'admin').maybeSingle();
      return !!row;
    },
  });
  return !!data;
}
