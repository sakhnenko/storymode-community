CREATE OR REPLACE FUNCTION public.owns_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _project_id IS NULL OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id AND p.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_grid(_grid_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _grid_id IS NULL OR EXISTS (
    SELECT 1 FROM public.notebook_grids g
    WHERE g.id = _grid_id AND g.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_chapter(_chapter_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _chapter_id IS NULL OR EXISTS (
    SELECT 1 FROM public.story_chapters c
    WHERE c.id = _chapter_id AND c.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.owns_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_grid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_chapter(uuid) TO authenticated;

-- map_canvas
DROP POLICY IF EXISTS "Users can create their own map" ON public.map_canvas;
CREATE POLICY "Users can create their own map"
ON public.map_canvas FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Users can update their own map" ON public.map_canvas;
CREATE POLICY "Users can update their own map"
ON public.map_canvas FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));

-- notebook_grids
DROP POLICY IF EXISTS "Users can create their own grids" ON public.notebook_grids;
CREATE POLICY "Users can create their own grids"
ON public.notebook_grids FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));

DROP POLICY IF EXISTS "Users can update their own grids" ON public.notebook_grids;
CREATE POLICY "Users can update their own grids"
ON public.notebook_grids FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));

-- notepads
DROP POLICY IF EXISTS "Users can create their own notepads" ON public.notepads;
CREATE POLICY "Users can create their own notepads"
ON public.notepads FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.owns_grid(grid_id) AND public.owns_chapter(chapter_id));

DROP POLICY IF EXISTS "Users can update their own notepads" ON public.notepads;
CREATE POLICY "Users can update their own notepads"
ON public.notepads FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND public.owns_grid(grid_id) AND public.owns_chapter(chapter_id));

-- story_chapters
DROP POLICY IF EXISTS "Owners manage their chapters" ON public.story_chapters;
CREATE POLICY "Owners manage their chapters"
ON public.story_chapters FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND public.owns_project(project_id));