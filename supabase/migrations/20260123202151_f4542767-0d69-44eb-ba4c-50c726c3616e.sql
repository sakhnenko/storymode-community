-- Create table for tracking shared canvases
CREATE TABLE public.canvas_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grid_id UUID NOT NULL REFERENCES public.notebook_grids(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL,
    shared_with_email TEXT NOT NULL,
    shared_with_user_id UUID,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (grid_id, shared_with_email)
);

-- Enable RLS
ALTER TABLE public.canvas_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Canvas owners can view all shares for their canvases
CREATE POLICY "Owners can view shares for their canvases"
ON public.canvas_shares
FOR SELECT
USING (auth.uid() = owner_id);

-- Policy: Users can view shares where they are the recipient
CREATE POLICY "Users can view shares they received"
ON public.canvas_shares
FOR SELECT
USING (auth.uid() = shared_with_user_id);

-- Policy: Canvas owners can create shares
CREATE POLICY "Owners can create shares"
ON public.canvas_shares
FOR INSERT
WITH CHECK (
    auth.uid() = owner_id AND
    EXISTS (
        SELECT 1 FROM public.notebook_grids 
        WHERE id = grid_id AND user_id = auth.uid()
    )
);

-- Policy: Canvas owners can delete shares
CREATE POLICY "Owners can delete shares"
ON public.canvas_shares
FOR DELETE
USING (auth.uid() = owner_id);

-- Policy: Canvas owners can update shares (e.g., when user accepts)
CREATE POLICY "Owners can update shares"
ON public.canvas_shares
FOR UPDATE
USING (auth.uid() = owner_id);

-- Policy: Recipients can update their own share status (accept invitation)
CREATE POLICY "Recipients can update their share status"
ON public.canvas_shares
FOR UPDATE
USING (auth.uid() = shared_with_user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_canvas_shares_updated_at
BEFORE UPDATE ON public.canvas_shares
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update notebook_grids RLS to allow shared users to view
CREATE POLICY "Shared users can view grids shared with them"
ON public.notebook_grids
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_shares
        WHERE canvas_shares.grid_id = notebook_grids.id
        AND canvas_shares.shared_with_user_id = auth.uid()
        AND canvas_shares.status = 'accepted'
    )
);

-- Update notepads RLS to allow shared users to view and edit
CREATE POLICY "Shared users can view notepads in shared grids"
ON public.notepads
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_shares
        WHERE canvas_shares.grid_id = notepads.grid_id
        AND canvas_shares.shared_with_user_id = auth.uid()
        AND canvas_shares.status = 'accepted'
    )
);

CREATE POLICY "Shared users can update notepads in shared grids"
ON public.notepads
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_shares
        WHERE canvas_shares.grid_id = notepads.grid_id
        AND canvas_shares.shared_with_user_id = auth.uid()
        AND canvas_shares.status = 'accepted'
    )
);

CREATE POLICY "Shared users can create notepads in shared grids"
ON public.notepads
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.canvas_shares
        WHERE canvas_shares.grid_id = notepads.grid_id
        AND canvas_shares.shared_with_user_id = auth.uid()
        AND canvas_shares.status = 'accepted'
    )
);

CREATE POLICY "Shared users can delete notepads in shared grids"
ON public.notepads
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.canvas_shares
        WHERE canvas_shares.grid_id = notepads.grid_id
        AND canvas_shares.shared_with_user_id = auth.uid()
        AND canvas_shares.status = 'accepted'
    )
);