
INSERT INTO storage.buckets (id, name, public)
VALUES ('homepage-gifs', 'homepage-gifs', true);

CREATE POLICY "Anyone can view homepage gifs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'homepage-gifs');

CREATE POLICY "Admins can manage homepage gifs"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'homepage-gifs' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'homepage-gifs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
