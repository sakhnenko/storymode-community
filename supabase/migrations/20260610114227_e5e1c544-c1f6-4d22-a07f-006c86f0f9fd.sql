
-- Generic trigger function: prevent user_id from being changed on update
CREATE OR REPLACE FUNCTION public.prevent_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- map_canvas
DROP TRIGGER IF EXISTS lock_owner_map_canvas ON public.map_canvas;
CREATE TRIGGER lock_owner_map_canvas
BEFORE UPDATE ON public.map_canvas
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

-- Add WITH CHECK to shared-update policy on map_canvas
DROP POLICY IF EXISTS "Shared project users can update maps" ON public.map_canvas;
CREATE POLICY "Shared project users can update maps"
ON public.map_canvas
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM project_shares
  WHERE project_shares.project_id = map_canvas.project_id
    AND project_shares.status = 'accepted'
    AND project_shares.shared_with_user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM project_shares
  WHERE project_shares.project_id = map_canvas.project_id
    AND project_shares.status = 'accepted'
    AND project_shares.shared_with_user_id = auth.uid()
));

-- notepads
DROP TRIGGER IF EXISTS lock_owner_notepads ON public.notepads;
CREATE TRIGGER lock_owner_notepads
BEFORE UPDATE ON public.notepads
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

DROP POLICY IF EXISTS "Shared project users can update notepads" ON public.notepads;
CREATE POLICY "Shared project users can update notepads"
ON public.notepads
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM notebook_grids ng
  JOIN project_shares ps ON ps.project_id = ng.project_id
  WHERE ng.id = notepads.grid_id
    AND ps.status = 'accepted'
    AND ps.shared_with_user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM notebook_grids ng
  JOIN project_shares ps ON ps.project_id = ng.project_id
  WHERE ng.id = notepads.grid_id
    AND ps.status = 'accepted'
    AND ps.shared_with_user_id = auth.uid()
));

DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON public.notepads;
CREATE POLICY "Shared users can update notepads in shared grids"
ON public.notepads
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notepads.grid_id
    AND canvas_shares.status = 'accepted'
    AND canvas_shares.shared_with_user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM canvas_shares
  WHERE canvas_shares.grid_id = notepads.grid_id
    AND canvas_shares.status = 'accepted'
    AND canvas_shares.shared_with_user_id = auth.uid()
));

-- story_chapters
DROP TRIGGER IF EXISTS lock_owner_story_chapters ON public.story_chapters;
CREATE TRIGGER lock_owner_story_chapters
BEFORE UPDATE ON public.story_chapters
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

-- Fix the broken collaborator update policy on story_chapters:
-- remove the user_id = auth.uid() requirement from WITH CHECK; the trigger
-- now guarantees ownership cannot change, and the USING clause still gates access.
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM project_shares ps
  WHERE ps.project_id = story_chapters.project_id
    AND ps.shared_with_user_id = auth.uid()
    AND ps.status = 'accepted'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM project_shares ps
  WHERE ps.project_id = story_chapters.project_id
    AND ps.shared_with_user_id = auth.uid()
    AND ps.status = 'accepted'
));
