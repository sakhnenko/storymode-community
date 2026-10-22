CREATE OR REPLACE FUNCTION public.get_my_shared_grid_ids()
RETURNS TABLE(grid_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cs.grid_id
  FROM public.canvas_shares cs
  WHERE cs.status = 'accepted'
    AND (
      cs.shared_with_user_id = auth.uid()
      OR cs.shared_with_email = (
        SELECT lower(email) FROM auth.users WHERE id = auth.uid()
      )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_shared_grid_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_shared_grid_ids() TO authenticated;
