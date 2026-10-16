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
  AND user_id = (SELECT p.user_id FROM public.projects p WHERE p.id = story_chapters.project_id)
);