
-- Public read access to sticker images
CREATE POLICY "map-stickers public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'map-stickers');

-- Authenticated users can upload to their own folder
CREATE POLICY "map-stickers user upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'map-stickers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "map-stickers user update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'map-stickers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "map-stickers user delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'map-stickers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
