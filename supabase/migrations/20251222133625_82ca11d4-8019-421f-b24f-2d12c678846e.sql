-- Add font_size column to notepads table
ALTER TABLE public.notepads 
ADD COLUMN font_size text NOT NULL DEFAULT 'medium';