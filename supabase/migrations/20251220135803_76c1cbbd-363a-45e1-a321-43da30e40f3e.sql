-- Create notebook_grids table
CREATE TABLE public.notebook_grids (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Grid',
  col_sizes text[] NOT NULL DEFAULT ARRAY['50'::text, '50'::text],
  row_sizes text[][] NOT NULL DEFAULT ARRAY[ARRAY['50'::text, '50'::text], ARRAY['50'::text, '50'::text]],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notebook_grids ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own grids"
ON public.notebook_grids
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own grids"
ON public.notebook_grids
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own grids"
ON public.notebook_grids
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own grids"
ON public.notebook_grids
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_notebook_grids_updated_at
BEFORE UPDATE ON public.notebook_grids
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add grid_id to notepads table (nullable first)
ALTER TABLE public.notepads ADD COLUMN grid_id uuid REFERENCES public.notebook_grids(id) ON DELETE CASCADE;