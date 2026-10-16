
-- Create table to store user map canvas data
CREATE TABLE public.map_canvas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  cells jsonb NOT NULL DEFAULT '{}'::jsonb,
  bg_color text NOT NULL DEFAULT '#e5e7eb',
  zoom double precision NOT NULL DEFAULT 1,
  offset_x double precision NOT NULL DEFAULT 0,
  offset_y double precision NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_canvas_user_id_key UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.map_canvas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own map" ON public.map_canvas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own map" ON public.map_canvas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own map" ON public.map_canvas FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_map_canvas_updated_at
  BEFORE UPDATE ON public.map_canvas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
