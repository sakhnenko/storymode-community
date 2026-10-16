
-- Fix story_chapters insert policy: scope to authenticated
DROP POLICY IF EXISTS "Shared users can insert chapters" ON public.story_chapters;
CREATE POLICY "Shared users can insert chapters"
ON public.story_chapters
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- Fix story_chapters update policy: enforce user_id = auth.uid() in WITH CHECK
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- Restrict can_view_profile public-project branch to anonymous viewers only
CREATE OR REPLACE FUNCTION public.can_view_profile(_target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() = _target_user_id
    OR (
      auth.uid() IS NULL
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
