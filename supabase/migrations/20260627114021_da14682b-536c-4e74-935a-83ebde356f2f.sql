
-- 1) Prevent shared collaborators from re-attributing story chapters to themselves
DROP TRIGGER IF EXISTS story_chapters_prevent_user_id_change ON public.story_chapters;
CREATE TRIGGER story_chapters_prevent_user_id_change
BEFORE UPDATE ON public.story_chapters
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- 2) Add explicit policies for the public 'backgrounds' storage bucket.
-- Bucket holds shared public art images; reads are public, writes are denied to all users (service_role bypasses RLS).
DROP POLICY IF EXISTS "Backgrounds are publicly readable" ON storage.objects;
CREATE POLICY "Backgrounds are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'backgrounds');

DROP POLICY IF EXISTS "Backgrounds are read only" ON storage.objects;
CREATE POLICY "Backgrounds are read only"
ON storage.objects
FOR ALL
TO authenticated, anon
USING (bucket_id = 'backgrounds' AND false)
WITH CHECK (bucket_id = 'backgrounds' AND false);
