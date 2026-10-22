CREATE TABLE public.chapter_review_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.story_chapters(id) ON DELETE CASCADE,
  draft_id uuid REFERENCES public.story_chapter_drafts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  intent text NOT NULL CHECK (intent IN ('sounds_wrong','needs_ideas','mark_for_review')),
  quote text NOT NULL,
  context_before text,
  context_after text,
  ai_status text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','ready','error')),
  ai_critique text,
  ai_suggestions jsonb,
  ai_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapter_review_highlights TO authenticated;
GRANT ALL ON public.chapter_review_highlights TO service_role;

ALTER TABLE public.chapter_review_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own review highlights"
  ON public.chapter_review_highlights
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX chapter_review_highlights_chapter_idx ON public.chapter_review_highlights(chapter_id);
CREATE INDEX chapter_review_highlights_draft_idx ON public.chapter_review_highlights(draft_id);

CREATE TRIGGER update_chapter_review_highlights_updated_at
  BEFORE UPDATE ON public.chapter_review_highlights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();