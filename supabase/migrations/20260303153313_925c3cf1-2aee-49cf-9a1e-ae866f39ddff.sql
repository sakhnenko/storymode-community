
-- Fix #1: Restrict profiles to authenticated users only
DROP POLICY "Users can view any profile" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Fix #3: Private grids should not be exposed through public projects
DROP POLICY "Anyone can view grids in public projects" ON public.notebook_grids;
CREATE POLICY "Anyone can view public grids in public projects" ON public.notebook_grids
  FOR SELECT USING (
    is_public = true AND EXISTS (
      SELECT 1 FROM projects WHERE projects.id = notebook_grids.project_id AND projects.is_public = true
    )
  );

-- Fix #4: Private notepads should not be exposed through public projects
DROP POLICY "Anyone can view notepads in public projects" ON public.notepads;
CREATE POLICY "Anyone can view notepads in public grids of public projects" ON public.notepads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM notebook_grids ng
      JOIN projects p ON p.id = ng.project_id
      WHERE ng.id = notepads.grid_id AND ng.is_public = true AND p.is_public = true
    )
  );

-- Fix #5: Map canvas data should respect project public status more carefully
DROP POLICY "Anyone can view maps in public projects" ON public.map_canvas;
CREATE POLICY "Anyone can view maps in public projects" ON public.map_canvas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = map_canvas.project_id AND projects.is_public = true
    )
  );
