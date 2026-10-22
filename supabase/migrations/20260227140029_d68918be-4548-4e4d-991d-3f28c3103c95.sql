-- Add is_public column to projects table
ALTER TABLE public.projects ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Allow anyone to view public projects
CREATE POLICY "Anyone can view public projects"
ON public.projects
FOR SELECT
USING (is_public = true);