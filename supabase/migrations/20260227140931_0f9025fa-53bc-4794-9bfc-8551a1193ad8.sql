
-- Allow anyone to view notebook_grids belonging to public projects
CREATE POLICY "Anyone can view grids in public projects"
ON public.notebook_grids
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = notebook_grids.project_id
  AND projects.is_public = true
));

-- Allow anyone to view notepads in grids belonging to public projects
CREATE POLICY "Anyone can view notepads in public projects"
ON public.notepads
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.notebook_grids ng
  JOIN public.projects p ON p.id = ng.project_id
  WHERE ng.id = notepads.grid_id
  AND p.is_public = true
));

-- Allow anyone to view maps belonging to public projects
CREATE POLICY "Anyone can view maps in public projects"
ON public.map_canvas
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects
  WHERE projects.id = map_canvas.project_id
  AND projects.is_public = true
));
