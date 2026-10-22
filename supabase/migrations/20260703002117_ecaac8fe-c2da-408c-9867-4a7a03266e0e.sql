
-- 1. is_template flag on projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS projects_is_template_idx ON public.projects (is_template) WHERE is_template = true;

-- 2. Deep-clone a project for a target user
CREATE OR REPLACE FUNCTION public.clone_project_for_user(
  _source_project_id uuid,
  _target_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_project_id uuid := gen_random_uuid();
  _next_position integer;
  r record;
  _new_id uuid;
BEGIN
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = _source_project_id) THEN
    RAISE EXCEPTION 'Source project % not found', _source_project_id;
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO _next_position
    FROM public.projects WHERE user_id = _target_user_id;

  INSERT INTO public.projects (id, user_id, title, icon, position, is_public, ai_language, is_template)
  SELECT _new_project_id, _target_user_id, title, icon, _next_position, false, ai_language, false
    FROM public.projects WHERE id = _source_project_id;

  CREATE TEMP TABLE _grid_map    (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _notepad_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _chapter_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _draft_map   (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;

  -- Folios
  FOR r IN SELECT * FROM public.notebook_grids WHERE project_id = _source_project_id LOOP
    _new_id := gen_random_uuid();
    INSERT INTO _grid_map VALUES (r.id, _new_id);
    INSERT INTO public.notebook_grids
      (id, user_id, project_id, title, icon, col_sizes, row_sizes, position, is_public)
    VALUES
      (_new_id, _target_user_id, _new_project_id, r.title, r.icon, r.col_sizes, r.row_sizes, r.position, false);
  END LOOP;

  -- Chapters (defer active_draft_id)
  FOR r IN SELECT * FROM public.story_chapters WHERE project_id = _source_project_id LOOP
    _new_id := gen_random_uuid();
    INSERT INTO _chapter_map VALUES (r.id, _new_id);
    INSERT INTO public.story_chapters
      (id, project_id, user_id, title, content, position, theme, active_draft_id)
    VALUES
      (_new_id, _new_project_id, _target_user_id, r.title, r.content, r.position, r.theme, NULL);
  END LOOP;

  -- Drafts (chapter_id must be remapped)
  FOR r IN
    SELECT d.* FROM public.story_chapter_drafts d
    JOIN _chapter_map m ON m.old_id = d.chapter_id
  LOOP
    _new_id := gen_random_uuid();
    INSERT INTO _draft_map VALUES (r.id, _new_id);
    INSERT INTO public.story_chapter_drafts
      (id, chapter_id, user_id, draft_number, title, content, name)
    VALUES
      (_new_id,
       (SELECT new_id FROM _chapter_map WHERE old_id = r.chapter_id),
       _target_user_id, r.draft_number, r.title, r.content, r.name);
  END LOOP;

  -- Fix chapter.active_draft_id now that drafts exist
  UPDATE public.story_chapters sc
     SET active_draft_id = dm.new_id
    FROM public.story_chapters src
    JOIN _chapter_map cm ON cm.old_id = src.id
    JOIN _draft_map   dm ON dm.old_id = src.active_draft_id
   WHERE sc.id = cm.new_id;

  -- Notepads (remap grid_id + chapter_id)
  FOR r IN
    SELECT n.* FROM public.notepads n
    JOIN _grid_map gm ON gm.old_id = n.grid_id
  LOOP
    _new_id := gen_random_uuid();
    INSERT INTO _notepad_map VALUES (r.id, _new_id);
    INSERT INTO public.notepads
      (id, user_id, title, content, theme, font, row_index, col_index, grid_id, height, font_size, chapter_id, icon)
    VALUES
      (_new_id, _target_user_id, r.title, r.content, r.theme, r.font, r.row_index, r.col_index,
       (SELECT new_id FROM _grid_map WHERE old_id = r.grid_id),
       r.height, r.font_size,
       (SELECT new_id FROM _chapter_map WHERE old_id = r.chapter_id),
       r.icon);
  END LOOP;

  -- Map canvases (remap notepad_id / grid_id inside placed_notebooks JSON)
  FOR r IN SELECT * FROM public.map_canvas WHERE project_id = _source_project_id LOOP
    INSERT INTO public.map_canvas
      (id, user_id, cells, bg_color, zoom, offset_x, offset_y, placed_notebooks, title, position, project_id)
    VALUES
      (gen_random_uuid(), _target_user_id, r.cells, r.bg_color, r.zoom, r.offset_x, r.offset_y,
       COALESCE((
         SELECT jsonb_agg(
           CASE
             WHEN (item ? 'notepad_id') AND (item ? 'grid_id') THEN
               item || jsonb_build_object(
                 'notepad_id', COALESCE((SELECT new_id::text FROM _notepad_map WHERE old_id::text = item->>'notepad_id'), item->>'notepad_id'),
                 'grid_id',    COALESCE((SELECT new_id::text FROM _grid_map    WHERE old_id::text = item->>'grid_id'),    item->>'grid_id')
               )
             ELSE item
           END
         )
         FROM jsonb_array_elements(r.placed_notebooks) AS item
       ), '[]'::jsonb),
       r.title, r.position, _new_project_id);
  END LOOP;

  DROP TABLE _grid_map;
  DROP TABLE _notepad_map;
  DROP TABLE _chapter_map;
  DROP TABLE _draft_map;

  RETURN _new_project_id;
END;
$$;

-- 3. Seed helper: clone most recent template into a new user
CREATE OR REPLACE FUNCTION public.seed_new_user_from_template(_new_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _template_id uuid;
BEGIN
  SELECT id INTO _template_id
    FROM public.projects
   WHERE is_template = true
   ORDER BY updated_at DESC
   LIMIT 1;
  IF _template_id IS NULL THEN RETURN; END IF;
  PERFORM public.clone_project_for_user(_template_id, _new_user_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed_new_user_from_template failed for %: %', _new_user_id, SQLERRM;
END;
$$;

-- 4. Extend handle_new_user to seed the template
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'beginner');
  PERFORM public.seed_new_user_from_template(NEW.id);
  RETURN NEW;
END;
$$;

-- 5. Create an independent template copy of "A Study in Scarlet" so the feature
-- works out of the box. Editing the original project will NOT affect the template.
DO $$
DECLARE
  _src uuid := '6c9ffe69-f07e-47dd-b19a-6a92b171523f';
  _owner uuid;
  _new uuid;
BEGIN
  SELECT user_id INTO _owner FROM public.projects WHERE id = _src;
  IF _owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE is_template = true) THEN
    _new := public.clone_project_for_user(_src, _owner);
    UPDATE public.projects
       SET is_template = true,
           title = title || ' (Starter Template)'
     WHERE id = _new;
  END IF;
END $$;
