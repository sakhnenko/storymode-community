
DROP POLICY IF EXISTS "Shared project users can update notepads" ON public.notepads;
CREATE POLICY "Shared project users can update notepads"
ON public.notepads
FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM notebook_grids ng
    JOIN project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND ps.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM notebook_grids ng
    JOIN project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND ps.shared_with_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can update notepads in shared grids"
ON public.notepads
FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM canvas_shares cs
    WHERE cs.grid_id = notepads.grid_id
      AND cs.status = 'accepted'
      AND cs.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM canvas_shares cs
    WHERE cs.grid_id = notepads.grid_id
      AND cs.status = 'accepted'
      AND cs.shared_with_user_id = auth.uid()
  )
);
