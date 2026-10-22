-- Allow users to delete their own maps
CREATE POLICY "Users can delete their own map"
ON public.map_canvas
FOR DELETE
USING (auth.uid() = user_id);