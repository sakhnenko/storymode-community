-- Add title column to map_canvas for multiple maps support
ALTER TABLE public.map_canvas ADD COLUMN title text NOT NULL DEFAULT 'World Map';

-- Add a position column for ordering maps
ALTER TABLE public.map_canvas ADD COLUMN position integer NOT NULL DEFAULT 0;