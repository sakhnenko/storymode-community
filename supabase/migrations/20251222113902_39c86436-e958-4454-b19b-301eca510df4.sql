-- Add position column to notebook_grids for ordering
ALTER TABLE public.notebook_grids 
ADD COLUMN position integer NOT NULL DEFAULT 0;