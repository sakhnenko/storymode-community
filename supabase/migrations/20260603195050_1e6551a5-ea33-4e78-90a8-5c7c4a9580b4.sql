CREATE TABLE public.story_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled chapter',
  content text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  theme text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.story_chapters TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_chapters TO authenticated;
GRANT ALL ON public.story_chapters TO service_role;

ALTER TABLE public.story_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their chapters"
ON public.story_chapters
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Shared users can read chapters"
ON public.story_chapters
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

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

CREATE POLICY "Shared users can insert chapters"
ON public.story_chapters
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

CREATE POLICY "Public projects expose chapters"
ON public.story_chapters
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = story_chapters.project_id
      AND p.is_public = true
  )
);

CREATE INDEX story_chapters_project_id_idx ON public.story_chapters(project_id, position);

CREATE TRIGGER set_story_chapters_updated_at
BEFORE UPDATE ON public.story_chapters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();