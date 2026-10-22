
-- Drafts: per-chapter snapshots
CREATE TABLE public.story_chapter_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID NOT NULL REFERENCES public.story_chapters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  draft_number INT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, draft_number)
);
CREATE INDEX story_chapter_drafts_chapter_idx ON public.story_chapter_drafts(chapter_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_chapter_drafts TO authenticated;
GRANT ALL ON public.story_chapter_drafts TO service_role;

ALTER TABLE public.story_chapter_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own drafts"
  ON public.story_chapter_drafts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_story_chapter_drafts_updated_at
  BEFORE UPDATE ON public.story_chapter_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track the active draft on the chapter (nullable; null = legacy/no drafts yet)
ALTER TABLE public.story_chapters
  ADD COLUMN IF NOT EXISTS active_draft_id UUID NULL REFERENCES public.story_chapter_drafts(id) ON DELETE SET NULL;

-- Link notepads to a chapter for the "Chapter Folio" section
ALTER TABLE public.notepads
  ADD COLUMN IF NOT EXISTS chapter_id UUID NULL REFERENCES public.story_chapters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS notepads_chapter_id_idx ON public.notepads(chapter_id);
