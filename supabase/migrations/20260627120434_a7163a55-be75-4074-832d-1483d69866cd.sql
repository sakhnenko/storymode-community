DROP POLICY IF EXISTS "Admins can manage background images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage background images" ON storage.objects;

CREATE POLICY "Authenticated users can manage background images"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'backgrounds')
WITH CHECK (bucket_id = 'backgrounds');