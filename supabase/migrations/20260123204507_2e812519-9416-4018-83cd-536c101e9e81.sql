-- Drop existing policies that check shared_with_user_id for shared access
DROP POLICY IF EXISTS "Shared users can view grids shared with them" ON notebook_grids;
DROP POLICY IF EXISTS "Shared users can view notepads in shared grids" ON notebook_grids;
DROP POLICY IF EXISTS "Shared users can view notepads in shared grids" ON notepads;
DROP POLICY IF EXISTS "Shared users can create notepads in shared grids" ON notepads;
DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON notepads;
DROP POLICY IF EXISTS "Shared users can delete notepads in shared grids" ON notepads;
DROP POLICY IF EXISTS "Users can view shares they received" ON canvas_shares;

-- Create a security definer function to get current user's email
CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid()
$$;

-- Recreate policies that check by user_id OR email match
CREATE POLICY "Shared users can view grids shared with them"
ON notebook_grids FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM canvas_shares
    WHERE canvas_shares.grid_id = notebook_grids.id
    AND canvas_shares.status = 'accepted'
    AND (
      canvas_shares.shared_with_user_id = auth.uid()
      OR canvas_shares.shared_with_email = public.get_current_user_email()
    )
  )
);

CREATE POLICY "Shared users can view notepads in shared grids"
ON notepads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
    AND canvas_shares.status = 'accepted'
    AND (
      canvas_shares.shared_with_user_id = auth.uid()
      OR canvas_shares.shared_with_email = public.get_current_user_email()
    )
  )
);

CREATE POLICY "Shared users can create notepads in shared grids"
ON notepads FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
    AND canvas_shares.status = 'accepted'
    AND (
      canvas_shares.shared_with_user_id = auth.uid()
      OR canvas_shares.shared_with_email = public.get_current_user_email()
    )
  )
);

CREATE POLICY "Shared users can update notepads in shared grids"
ON notepads FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
    AND canvas_shares.status = 'accepted'
    AND (
      canvas_shares.shared_with_user_id = auth.uid()
      OR canvas_shares.shared_with_email = public.get_current_user_email()
    )
  )
);

CREATE POLICY "Shared users can delete notepads in shared grids"
ON notepads FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
    AND canvas_shares.status = 'accepted'
    AND (
      canvas_shares.shared_with_user_id = auth.uid()
      OR canvas_shares.shared_with_email = public.get_current_user_email()
    )
  )
);

CREATE POLICY "Users can view shares they received"
ON canvas_shares FOR SELECT
USING (
  auth.uid() = shared_with_user_id
  OR shared_with_email = public.get_current_user_email()
);