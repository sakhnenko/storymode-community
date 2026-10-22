-- Add is_public column to notebook_grids
ALTER TABLE public.notebook_grids 
ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Create policy to allow anyone to view public grids
CREATE POLICY "Anyone can view public grids"
ON public.notebook_grids
FOR SELECT
USING (is_public = true);

-- Create policy to allow anyone to view notepads in public grids
CREATE POLICY "Anyone can view notepads in public grids"
ON public.notepads
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.notebook_grids 
    WHERE notebook_grids.id = notepads.grid_id 
    AND notebook_grids.is_public = true
  )
);