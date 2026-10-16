
-- Preserve current behaviour for anything already published
UPDATE public.notebook_grids g
SET is_public = true
FROM public.projects p
WHERE p.id = g.project_id AND p.is_public = true AND g.is_public = false;

DROP POLICY IF EXISTS "Anyone can view grids in public projects" ON public.notebook_grids;
CREATE POLICY "Anyone can view grids in public projects"
ON public.notebook_grids
FOR SELECT
USING (
  is_public = true
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = notebook_grids.project_id AND p.is_public = true
  )
);

DROP POLICY IF EXISTS "Anyone can view notepads in public projects" ON public.notepads;
CREATE POLICY "Anyone can view notepads in public projects"
ON public.notepads
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.notebook_grids ng
    JOIN public.projects p ON p.id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ng.is_public = true
      AND p.is_public = true
  )
);

-- Sharing tables: owner/invitee scoped access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_shares TO authenticated;
GRANT ALL ON public.project_shares TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas_shares TO authenticated;
GRANT ALL ON public.canvas_shares TO service_role;

CREATE POLICY "Owners and invitees can view project shares"
ON public.project_shares FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

CREATE POLICY "Owners can create project shares"
ON public.project_shares FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners and invitees can update project shares"
ON public.project_shares FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid())
WITH CHECK (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

CREATE POLICY "Owners can delete project shares"
ON public.project_shares FOR DELETE TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Owners and invitees can view canvas shares"
ON public.canvas_shares FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

CREATE POLICY "Owners can create canvas shares"
ON public.canvas_shares FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners and invitees can update canvas shares"
ON public.canvas_shares FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid())
WITH CHECK (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

CREATE POLICY "Owners can delete canvas shares"
ON public.canvas_shares FOR DELETE TO authenticated
USING (owner_id = auth.uid());
