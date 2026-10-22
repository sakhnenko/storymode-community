-- Create notepads table for storing user notes
CREATE TABLE public.notepads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'clean-white',
  font TEXT NOT NULL DEFAULT 'inter',
  row_index INTEGER NOT NULL DEFAULT 0,
  col_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notepads ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own notepads" 
ON public.notepads 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notepads" 
ON public.notepads 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notepads" 
ON public.notepads 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notepads" 
ON public.notepads 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_notepads_updated_at
BEFORE UPDATE ON public.notepads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create grid_layouts table for storing user grid configuration
CREATE TABLE public.grid_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  col_sizes TEXT[] NOT NULL DEFAULT ARRAY['50', '50'],
  row_sizes TEXT[][] NOT NULL DEFAULT ARRAY[ARRAY['50', '50'], ARRAY['50', '50']],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for grid_layouts
ALTER TABLE public.grid_layouts ENABLE ROW LEVEL SECURITY;

-- Create policies for grid_layouts
CREATE POLICY "Users can view their own grid layout" 
ON public.grid_layouts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own grid layout" 
ON public.grid_layouts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own grid layout" 
ON public.grid_layouts 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for grid_layouts timestamp
CREATE TRIGGER update_grid_layouts_updated_at
BEFORE UPDATE ON public.grid_layouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();