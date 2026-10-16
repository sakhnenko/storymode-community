-- Add height column to notepads for persisting notebook heights
ALTER TABLE public.notepads ADD COLUMN height integer NOT NULL DEFAULT 200;