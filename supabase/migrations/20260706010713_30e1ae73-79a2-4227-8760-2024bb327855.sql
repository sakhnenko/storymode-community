
-- 1) Loosen public read policies on folios and notepads
DROP POLICY IF EXISTS "Anyone can view public grids in public projects" ON public.notebook_grids;
CREATE POLICY "Anyone can view grids in public projects"
ON public.notebook_grids FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.projects p
          WHERE p.id = notebook_grids.project_id AND p.is_public = true)
);

DROP POLICY IF EXISTS "Anyone can view notepads in public grids of public projects" ON public.notepads;
CREATE POLICY "Anyone can view notepads in public projects"
ON public.notepads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.projects p ON p.id = ng.project_id
    WHERE ng.id = notepads.grid_id AND p.is_public = true
  )
);

-- 2) Mark A Study in Scarlet as template
UPDATE public.projects SET is_template = true
 WHERE id = '6c9ffe69-f07e-47dd-b19a-6a92b171523f';

-- 3) Ensure-starter-project RPC with per-user advisory lock (idempotent)
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

  -- Serialize concurrent calls for the same user
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
    RETURN _new_id;
  END IF;

  INSERT INTO public.projects (user_id, title, icon, position)
  VALUES (_user_id, 'Default', '📁', 0)
  RETURNING id INTO _new_id;

  INSERT INTO public.map_canvas (user_id, project_id, title, position)
  VALUES (_user_id, _new_id, '🌏 World Map', 0);

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_starter_project(uuid) TO authenticated;

-- 4) Cleanup: delete duplicate empty Default projects for the affected invited user,
-- keeping only the first-created one (which we'll then seed from template on next login).
DELETE FROM public.projects
 WHERE user_id = '00000000-0000-0000-0000-000000000000'
   AND title = 'Default';
