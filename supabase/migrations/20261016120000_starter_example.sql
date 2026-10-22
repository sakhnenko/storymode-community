-- A starter example project that can ship as data, for installs without a
-- template project of their own. The hosted app copies its configured
-- template (starter_template_config) to each new account, and nothing changes
-- there: this table stays empty, and the template still comes first. A fresh
-- self-hosted database has no template, so new accounts got an empty
-- "Default" project; the community edition fills this table with the
-- "A Study in Scarlet" example instead.

CREATE TABLE IF NOT EXISTS public.starter_example (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  -- { project: {title, icon, ai_language}, folios: [], chapters: [], drafts: [],
  --   notebooks: [], maps: [] }, rows as exported, ids as in the source.
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.starter_example ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.starter_example FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.starter_example TO service_role;

-- Builds the example for a user, with new ids throughout; null when there's no example.
CREATE OR REPLACE FUNCTION public.clone_starter_example_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _data jsonb;
  _project_id uuid := gen_random_uuid();
  _position integer;
  _ids jsonb;
BEGIN
  SELECT data INTO _data FROM public.starter_example WHERE singleton;
  IF _data IS NULL OR _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- A new id for every folio, chapter, draft and notebook, keyed by its old id.
  SELECT coalesce(jsonb_object_agg(old_id, gen_random_uuid()), '{}'::jsonb) INTO _ids
  FROM (
    SELECT x->>'id' AS old_id FROM jsonb_array_elements(_data->'folios') x
    UNION ALL SELECT x->>'id' FROM jsonb_array_elements(_data->'chapters') x
    UNION ALL SELECT x->>'id' FROM jsonb_array_elements(_data->'drafts') x
    UNION ALL SELECT x->>'id' FROM jsonb_array_elements(_data->'notebooks') x
  ) ids;

  SELECT coalesce(max(position), -1) + 1 INTO _position FROM public.projects WHERE user_id = _user_id;

  INSERT INTO public.projects (id, user_id, title, icon, position, is_public, ai_language, is_template, is_starter)
  VALUES (
    _project_id, _user_id,
    coalesce(_data->'project'->>'title', 'Example'),
    coalesce(_data->'project'->>'icon', '📕'),
    _position, false,
    coalesce(_data->'project'->>'ai_language', 'en'),
    false, true
  );

  INSERT INTO public.notebook_grids (id, user_id, project_id, title, icon, col_sizes, row_sizes, position, is_public)
  SELECT (_ids->>(x->>'id'))::uuid, _user_id, _project_id, g.title, g.icon, g.col_sizes, g.row_sizes, g.position, false
  FROM jsonb_array_elements(_data->'folios') x,
       jsonb_populate_record(NULL::public.notebook_grids, x) g;

  INSERT INTO public.story_chapters (id, project_id, user_id, title, content, position, theme, active_draft_id)
  SELECT (_ids->>(x->>'id'))::uuid, _project_id, _user_id, c.title, c.content, c.position, c.theme, NULL
  FROM jsonb_array_elements(_data->'chapters') x,
       jsonb_populate_record(NULL::public.story_chapters, x) c;

  INSERT INTO public.story_chapter_drafts (id, chapter_id, user_id, draft_number, title, content, name)
  SELECT (_ids->>(x->>'id'))::uuid, (_ids->>(x->>'chapter_id'))::uuid, _user_id, d.draft_number, d.title, d.content, d.name
  FROM jsonb_array_elements(_data->'drafts') x,
       jsonb_populate_record(NULL::public.story_chapter_drafts, x) d
  WHERE _ids ? (x->>'chapter_id');

  UPDATE public.story_chapters sc
     SET active_draft_id = (_ids->>(x->>'active_draft_id'))::uuid
    FROM jsonb_array_elements(_data->'chapters') x
   WHERE sc.id = (_ids->>(x->>'id'))::uuid
     AND _ids ? (x->>'active_draft_id');

  INSERT INTO public.notepads
    (id, user_id, title, content, theme, font, row_index, col_index, grid_id, height, font_size, chapter_id, icon)
  SELECT (_ids->>(x->>'id'))::uuid, _user_id, n.title, n.content, n.theme, n.font, n.row_index, n.col_index,
         (_ids->>(x->>'grid_id'))::uuid, n.height, n.font_size, (_ids->>(x->>'chapter_id'))::uuid, n.icon
  FROM jsonb_array_elements(_data->'notebooks') x,
       jsonb_populate_record(NULL::public.notepads, x) n
  WHERE _ids ? (x->>'grid_id');

  -- Notebooks placed on a map point at their notebook and folio by id.
  INSERT INTO public.map_canvas
    (id, user_id, project_id, title, position, cells, bg_color, zoom, offset_x, offset_y, placed_notebooks)
  SELECT gen_random_uuid(), _user_id, _project_id, m.title, m.position, m.cells, m.bg_color, m.zoom, m.offset_x, m.offset_y,
         coalesce((
           SELECT jsonb_agg(
             CASE WHEN item ? 'notepad_id' THEN
               item || jsonb_build_object(
                 'notepad_id', coalesce(_ids->>(item->>'notepad_id'), item->>'notepad_id'),
                 'grid_id', coalesce(_ids->>(item->>'grid_id'), item->>'grid_id'))
             ELSE item END)
           FROM jsonb_array_elements(x->'placed_notebooks') item
         ), '[]'::jsonb)
  FROM jsonb_array_elements(_data->'maps') x,
       jsonb_populate_record(NULL::public.map_canvas, x) m;

  RETURN _project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_starter_example_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clone_starter_example_for_user(uuid) TO service_role;

-- On sign-up: the configured template as before, otherwise the example.
CREATE OR REPLACE FUNCTION public.seed_new_user_from_template(_new_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _template_id uuid;
BEGIN
  SELECT config.project_id INTO _template_id
  FROM public.starter_template_config config
  JOIN public.projects template
    ON template.id = config.project_id
   AND template.is_template = true
  WHERE config.singleton = true;

  IF _template_id IS NOT NULL THEN
    PERFORM public.clone_project_for_user(_template_id, _new_user_id);
  ELSE
    PERFORM public.clone_starter_example_for_user(_new_user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed_new_user_from_template failed for %: %', _new_user_id, SQLERRM;
END;
$$;

-- When an account has no projects at all: the template, else the example,
-- else an empty Default project.
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

  SELECT id INTO _existing
  FROM public.projects
  WHERE user_id = _user_id
  ORDER BY position ASC, created_at ASC
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  SELECT config.project_id INTO _template
  FROM public.starter_template_config config
  JOIN public.projects template
    ON template.id = config.project_id
   AND template.is_template = true
  WHERE config.singleton = true;

  IF _template IS NOT NULL THEN
    _new_id := public.clone_project_for_user(_template, _user_id);
    UPDATE public.projects SET is_starter = true WHERE id = _new_id;
    RETURN _new_id;
  END IF;

  _new_id := public.clone_starter_example_for_user(_user_id);
  IF _new_id IS NOT NULL THEN
    RETURN _new_id;
  END IF;

  INSERT INTO public.projects (user_id, title, icon, position, is_starter)
  VALUES (_user_id, 'Default', '📁', 0, true)
  RETURNING id INTO _new_id;

  INSERT INTO public.map_canvas (user_id, project_id, title, position, bg_color)
  VALUES (_user_id, _new_id, '🗺️ World Map', 0, '#87a782');

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_starter_project(uuid) TO authenticated;
