
-- 1. Remove email-bypass on share-based policies. Recreate with user_id-only checks.

-- notepads
DROP POLICY IF EXISTS "Shared project users can create notepads" ON public.notepads;
CREATE POLICY "Shared project users can create notepads" ON public.notepads
FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM notebook_grids ng
  JOIN project_shares ps ON ps.project_id = ng.project_id
  WHERE ng.id = notepads.grid_id AND ps.status = 'accepted' AND ps.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared project users can delete notepads" ON public.notepads;
CREATE POLICY "Shared project users can delete notepads" ON public.notepads
FOR DELETE USING (EXISTS (
  SELECT 1 FROM notebook_grids ng
  JOIN project_shares ps ON ps.project_id = ng.project_id
  WHERE ng.id = notepads.grid_id AND ps.status = 'accepted' AND ps.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared project users can update notepads" ON public.notepads;
CREATE POLICY "Shared project users can update notepads" ON public.notepads
FOR UPDATE USING (EXISTS (
  SELECT 1 FROM notebook_grids ng
  JOIN project_shares ps ON ps.project_id = ng.project_id
  WHERE ng.id = notepads.grid_id AND ps.status = 'accepted' AND ps.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared project users can view notepads" ON public.notepads;
CREATE POLICY "Shared project users can view notepads" ON public.notepads
FOR SELECT USING (EXISTS (
  SELECT 1 FROM notebook_grids ng
  JOIN project_shares ps ON ps.project_id = ng.project_id
  WHERE ng.id = notepads.grid_id AND ps.status = 'accepted' AND ps.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared users can create notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can create notepads in shared grids" ON public.notepads
FOR INSERT WITH CHECK (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notepads.grid_id AND canvas_shares.status = 'accepted' AND canvas_shares.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared users can delete notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can delete notepads in shared grids" ON public.notepads
FOR DELETE USING (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notepads.grid_id AND canvas_shares.status = 'accepted' AND canvas_shares.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can update notepads in shared grids" ON public.notepads
FOR UPDATE USING (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notepads.grid_id AND canvas_shares.status = 'accepted' AND canvas_shares.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared users can view notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can view notepads in shared grids" ON public.notepads
FOR SELECT USING (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notepads.grid_id AND canvas_shares.status = 'accepted' AND canvas_shares.shared_with_user_id = auth.uid()
));

-- notebook_grids
DROP POLICY IF EXISTS "Shared project users can view grids" ON public.notebook_grids;
CREATE POLICY "Shared project users can view grids" ON public.notebook_grids
FOR SELECT USING (EXISTS (
  SELECT 1 FROM project_shares
  WHERE project_shares.project_id = notebook_grids.project_id AND project_shares.status = 'accepted' AND project_shares.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared users can view grids shared with them" ON public.notebook_grids;
CREATE POLICY "Shared users can view grids shared with them" ON public.notebook_grids
FOR SELECT USING (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notebook_grids.id AND canvas_shares.status = 'accepted' AND canvas_shares.shared_with_user_id = auth.uid()
));

-- map_canvas
DROP POLICY IF EXISTS "Shared project users can update maps" ON public.map_canvas;
CREATE POLICY "Shared project users can update maps" ON public.map_canvas
FOR UPDATE USING (EXISTS (
  SELECT 1 FROM project_shares
  WHERE project_shares.project_id = map_canvas.project_id AND project_shares.status = 'accepted' AND project_shares.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared project users can view maps" ON public.map_canvas;
CREATE POLICY "Shared project users can view maps" ON public.map_canvas
FOR SELECT USING (EXISTS (
  SELECT 1 FROM project_shares
  WHERE project_shares.project_id = map_canvas.project_id AND project_shares.status = 'accepted' AND project_shares.shared_with_user_id = auth.uid()
));

-- canvas_shares & project_shares: recipient SELECT by user_id only
DROP POLICY IF EXISTS "Users can view their own received shares" ON public.canvas_shares;
CREATE POLICY "Users can view their own received shares" ON public.canvas_shares
FOR SELECT USING (auth.uid() = shared_with_user_id);

DROP POLICY IF EXISTS "Recipients can view their project shares" ON public.project_shares;
CREATE POLICY "Recipients can view their project shares" ON public.project_shares
FOR SELECT USING (auth.uid() = shared_with_user_id);

-- projects shared view
DROP POLICY IF EXISTS "Shared users can view shared projects" ON public.projects;
CREATE POLICY "Shared users can view shared projects" ON public.projects
FOR SELECT USING (EXISTS (
  SELECT 1 FROM project_shares
  WHERE project_shares.project_id = projects.id AND project_shares.status = 'accepted' AND project_shares.shared_with_user_id = auth.uid()
));

-- 2. story_chapters: add user_id check on INSERT
DROP POLICY IF EXISTS "Shared users can insert chapters" ON public.story_chapters;
CREATE POLICY "Shared users can insert chapters" ON public.story_chapters
FOR INSERT WITH CHECK (
  story_chapters.user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- 3. Tighten profiles SELECT
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.can_view_profile(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = _target_user_id
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.user_id = _target_user_id AND p.is_public = true)
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
$$;

CREATE POLICY "Users can view profiles in their context" ON public.profiles
FOR SELECT TO authenticated
USING (public.can_view_profile(user_id));

-- 4. Drop unused helper
DROP FUNCTION IF EXISTS public.get_current_user_email();
