-- Fix the canvas_shares SELECT policy to prevent email exposure
-- Users should only see their OWN share invitations, not all shares for a grid

-- Drop the existing overly permissive policy for recipients
DROP POLICY IF EXISTS "Users can view shares they received" ON public.canvas_shares;

-- Create a more restrictive policy that only allows users to see shares where they are the recipient
-- This prevents seeing other users' email addresses who were also invited to the same grid
CREATE POLICY "Users can view their own received shares" 
ON public.canvas_shares 
FOR SELECT 
USING (
  (auth.uid() = shared_with_user_id) 
  OR (shared_with_email = get_current_user_email())
);