
DROP POLICY IF EXISTS "Shared project users can update maps" ON public.map_canvas;
CREATE POLICY "Shared project users can update maps"
ON public.map_canvas
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND project_shares.shared_with_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND project_shares.shared_with_user_id = auth.uid()
  )
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Backgrounds are publicly readable" ON storage.objects;
CREATE POLICY "Users can view their own background images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'backgrounds'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "map-stickers public read" ON storage.objects;
CREATE POLICY "map-stickers user read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'map-stickers'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
