
-- 1. canvas_shares: prevent recipients from re-assigning the row to another user
DROP POLICY IF EXISTS "Recipients can update their share status" ON public.canvas_shares;
CREATE POLICY "Recipients can update their share status"
ON public.canvas_shares
FOR UPDATE
USING (auth.uid() = shared_with_user_id)
WITH CHECK (auth.uid() = shared_with_user_id);

-- 2. project_shares: same fix
DROP POLICY IF EXISTS "Recipients can update their project share status" ON public.project_shares;
CREATE POLICY "Recipients can update their project share status"
ON public.project_shares
FOR UPDATE
USING (auth.uid() = shared_with_user_id)
WITH CHECK (auth.uid() = shared_with_user_id);

-- 3. map_canvas: prevent collaborators from re-attributing ownership.
-- Enforce that user_id must remain the project owner's user_id.
DROP POLICY IF EXISTS "Shared project users can update maps" ON public.map_canvas;
CREATE POLICY "Shared project users can update maps"
ON public.map_canvas
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND project_shares.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND project_shares.shared_with_user_id = auth.uid()
  )
  AND user_id = (SELECT p.user_id FROM public.projects p WHERE p.id = map_canvas.project_id)
);

-- 4. notepads (project-share path): prevent collaborator from re-attributing ownership.
DROP POLICY IF EXISTS "Shared project users can update notepads" ON public.notepads;
CREATE POLICY "Shared project users can update notepads"
ON public.notepads
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND ps.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND ps.shared_with_user_id = auth.uid()
  )
  AND user_id = (SELECT ng2.user_id FROM public.notebook_grids ng2 WHERE ng2.id = notepads.grid_id)
);

-- 5. notepads (grid-share path): same fix
DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can update notepads in shared grids"
ON public.notepads
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
      AND canvas_shares.status = 'accepted'
      AND canvas_shares.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
      AND canvas_shares.status = 'accepted'
      AND canvas_shares.shared_with_user_id = auth.uid()
  )
  AND user_id = (SELECT ng2.user_id FROM public.notebook_grids ng2 WHERE ng2.id = notepads.grid_id)
);

-- 6. can_view_profile: restrict the public-project branch to authenticated viewers
CREATE OR REPLACE FUNCTION public.can_view_profile(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() = _target_user_id
    OR (
      auth.uid() IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.projects p WHERE p.user_id = _target_user_id AND p.is_public = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.project_shares ps
      WHERE ps.status = 'accepted'
        AND (
          (ps.owner_id = auth.uid() AND ps.shared_with_user_id = _target_user_id)
          OR (ps.shared_with_user_id = auth.uid() AND ps.owner_id = _target_user_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.canvas_shares cs
      WHERE cs.status = 'accepted'
        AND (
          (cs.owner_id = auth.uid() AND cs.shared_with_user_id = _target_user_id)
          OR (cs.shared_with_user_id = auth.uid() AND cs.owner_id = _target_user_id)
        )
    )
$function$;
