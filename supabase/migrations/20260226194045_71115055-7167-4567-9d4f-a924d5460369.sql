
-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Project',
  icon TEXT NOT NULL DEFAULT '📁',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add project_id to notebook_grids (nullable initially for migration)
ALTER TABLE public.notebook_grids
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Add project_id to map_canvas (nullable initially for migration)
ALTER TABLE public.map_canvas
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Create a "Default" project for each existing user who has grids or maps
-- and assign their existing data to it
DO $$
DECLARE
  r RECORD;
  new_project_id UUID;
BEGIN
  FOR r IN (
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM public.notebook_grids
      UNION
      SELECT user_id FROM public.map_canvas
    ) combined
  ) LOOP
    INSERT INTO public.projects (user_id, title, icon)
    VALUES (r.user_id, 'Default', '📁')
    RETURNING id INTO new_project_id;

    UPDATE public.notebook_grids
    SET project_id = new_project_id
    WHERE user_id = r.user_id AND project_id IS NULL;

    UPDATE public.map_canvas
    SET project_id = new_project_id
    WHERE user_id = r.user_id AND project_id IS NULL;
  END LOOP;
END $$;
