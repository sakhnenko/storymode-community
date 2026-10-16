ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_starter boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ensure_starter_project(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _new_id uuid;
  _template uuid;
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 42));

  SELECT id INTO _existing FROM public.projects
   WHERE user_id = _user_id ORDER BY position ASC, created_at ASC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT id INTO _template FROM public.projects
   WHERE is_template = true ORDER BY updated_at DESC LIMIT 1;

  IF _template IS NOT NULL THEN
    _new_id := public.clone_project_for_user(_template, _user_id);
    UPDATE public.projects SET is_starter = true WHERE id = _new_id;
    RETURN _new_id;
  END IF;

  INSERT INTO public.projects (user_id, title, icon, position, is_starter)
  VALUES (_user_id, 'Default', '📁', 0, true)
  RETURNING id INTO _new_id;

  INSERT INTO public.map_canvas (user_id, project_id, title, position)
  VALUES (_user_id, _new_id, '🌏 World Map', 0);

  RETURN _new_id;
END;
$$;

UPDATE public.projects p
   SET is_starter = true
 WHERE p.is_template = false
   AND p.title IN (SELECT title FROM public.projects WHERE is_template = true)
   AND p.id = (
     SELECT id FROM public.projects q
      WHERE q.user_id = p.user_id
      ORDER BY q.position ASC, q.created_at ASC
      LIMIT 1
   );