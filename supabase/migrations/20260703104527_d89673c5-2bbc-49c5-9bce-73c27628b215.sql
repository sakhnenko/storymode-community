DROP POLICY IF EXISTS "Shared project users can update maps" ON public.map_canvas;
CREATE POLICY "Shared project users can update maps"
ON public.map_canvas
FOR UPDATE
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND project_shares.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND project_shares.shared_with_user_id = auth.uid()
  )
);