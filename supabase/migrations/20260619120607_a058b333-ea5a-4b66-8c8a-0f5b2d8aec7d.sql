
-- 1. Notebook grids: drop standalone-public policy
DROP POLICY IF EXISTS "Anyone can view public grids" ON public.notebook_grids;

-- 2. Notepads: drop standalone-public policy
DROP POLICY IF EXISTS "Anyone can view notepads in public grids" ON public.notepads;

-- 3. Story chapters: fix shared update policy + lock user_id via trigger
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
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

DROP TRIGGER IF EXISTS prevent_story_chapter_user_id_change ON public.story_chapters;
CREATE TRIGGER prevent_story_chapter_user_id_change
BEFORE UPDATE ON public.story_chapters
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

-- 4. Pin search_path on pgmq wrapper functions. They belong to Lovable's email
-- queue, which Lovable Cloud creates outside these migrations, so a fresh
-- project (a self-hosted install) doesn't have them.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.read_email_batch(text, integer, integer)',
    'public.delete_email(text, bigint)',
    'public.enqueue_email(text, jsonb)',
    'public.move_to_dlq(text, text, bigint, jsonb)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pgmq', fn);
    END IF;
  END LOOP;
END $$;
