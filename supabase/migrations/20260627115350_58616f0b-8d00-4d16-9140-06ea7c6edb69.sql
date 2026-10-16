-- Replace the deny-all writes policy on backgrounds bucket so that admins can upload/manage
-- background images via the Cloud dashboard. Public reads remain enabled.
DROP POLICY IF EXISTS "Backgrounds are read only" ON storage.objects;

DROP POLICY IF EXISTS "Admins can manage background images" ON storage.objects;
CREATE POLICY "Admins can manage background images"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'backgrounds' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'backgrounds' AND public.has_role(auth.uid(), 'admin'));