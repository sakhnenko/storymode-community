-- Add icon column to notebook_grids for storing emoji
ALTER TABLE public.notebook_grids ADD COLUMN icon text NOT NULL DEFAULT '📓';