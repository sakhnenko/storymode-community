
CREATE TABLE public.content_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('notepad', 'chapter_draft')),
  entity_id UUID NOT NULL,
  day DATE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, day)
);

CREATE INDEX content_snapshots_entity_idx
  ON public.content_snapshots(entity_type, entity_id, day DESC);
CREATE INDEX content_snapshots_user_idx
  ON public.content_snapshots(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_snapshots TO authenticated;
GRANT ALL ON public.content_snapshots TO service_role;

ALTER TABLE public.content_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own snapshots"
  ON public.content_snapshots FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_content_snapshots_updated_at
  BEFORE UPDATE ON public.content_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper RPC: upsert today's snapshot and prune anything older than 3 days for the same entity.
CREATE OR REPLACE FUNCTION public.upsert_content_snapshot(
  _entity_type TEXT,
  _entity_id UUID,
  _title TEXT,
  _content TEXT
) RETURNS public.content_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.content_snapshots;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _entity_type NOT IN ('notepad', 'chapter_draft') THEN
    RAISE EXCEPTION 'Invalid entity_type %', _entity_type;
  END IF;

  INSERT INTO public.content_snapshots (user_id, entity_type, entity_id, day, title, content)
  VALUES (_uid, _entity_type, _entity_id, (now() AT TIME ZONE 'utc')::date, COALESCE(_title, ''), COALESCE(_content, ''))
  ON CONFLICT (entity_type, entity_id, day)
  DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = now()
  RETURNING * INTO _row;

  DELETE FROM public.content_snapshots
   WHERE entity_type = _entity_type
     AND entity_id = _entity_id
     AND user_id = _uid
     AND day < ((now() AT TIME ZONE 'utc')::date - INTERVAL '2 days');

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_content_snapshot(TEXT, UUID, TEXT, TEXT) TO authenticated;
