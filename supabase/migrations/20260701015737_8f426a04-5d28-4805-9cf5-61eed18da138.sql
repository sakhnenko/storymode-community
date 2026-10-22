
-- Fix backgrounds bucket policies: enforce ownership via path prefix = auth.uid()
DROP POLICY IF EXISTS "Authenticated users can manage background images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload background images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update background images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete background images" ON storage.objects;

CREATE POLICY "Users can upload their own background images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'backgrounds'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own background images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'backgrounds'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'backgrounds'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own background images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'backgrounds'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Fix story_chapters shared delete: restrict to authenticated user's own rows only
DROP POLICY IF EXISTS "Shared users can delete chapters" ON public.story_chapters;

CREATE POLICY "Shared users can delete their own chapters"
ON public.story_chapters
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.status = 'accepted'
      AND ps.shared_with_user_id = auth.uid()
  )
);
