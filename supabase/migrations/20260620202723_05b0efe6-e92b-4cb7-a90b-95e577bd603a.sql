
-- Prevent user_id from being changed on these tables (defense in depth)
DROP TRIGGER IF EXISTS prevent_user_id_change_notepads ON public.notepads;
CREATE TRIGGER prevent_user_id_change_notepads
BEFORE UPDATE ON public.notepads
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

DROP TRIGGER IF EXISTS prevent_user_id_change_story_chapters ON public.story_chapters;
CREATE TRIGGER prevent_user_id_change_story_chapters
BEFORE UPDATE ON public.story_chapters
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

-- Notepads: fix shared project update WITH CHECK
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
);

-- Notepads: fix shared grid update WITH CHECK
DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can update notepads in shared grids"
ON public.notepads
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.canvas_shares cs
    WHERE cs.grid_id = notepads.grid_id
      AND cs.status = 'accepted'
      AND cs.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvas_shares cs
    WHERE cs.grid_id = notepads.grid_id
      AND cs.status = 'accepted'
      AND cs.shared_with_user_id = auth.uid()
  )
);

-- Story chapters: fix shared update WITH CHECK
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- Story chapters: add delete policy for shared collaborators (parity with notepads)
DROP POLICY IF EXISTS "Shared users can delete chapters" ON public.story_chapters;
CREATE POLICY "Shared users can delete chapters"
ON public.story_chapters
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);
