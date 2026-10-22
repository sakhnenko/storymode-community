-- Fix collaborator ownership escalation: prevent shared users from changing user_id
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters" ON public.story_chapters
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
  user_id = (SELECT user_id FROM public.story_chapters sc WHERE sc.id = story_chapters.id)
  AND EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- Fix profile exposure: do not expose profiles to unauthenticated visitors
CREATE OR REPLACE FUNCTION public.can_view_profile(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() = _target_user_id
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