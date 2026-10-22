
-- Fix notepads DELETE policies for shared users: require ownership
DROP POLICY IF EXISTS "Shared users can delete notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can delete notepads in shared grids"
ON public.notepads
FOR DELETE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM canvas_shares
    WHERE canvas_shares.grid_id = notepads.grid_id
      AND canvas_shares.status = 'accepted'
      AND canvas_shares.shared_with_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Shared project users can delete notepads" ON public.notepads;
CREATE POLICY "Shared project users can delete notepads"
ON public.notepads
FOR DELETE
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
);

-- Fix story_chapters UPDATE policy for shared collaborators: prevent ownership re-attribution
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);
