-- Pin onboarding to the approved A Study in Scarlet source project and keep
-- the template designation out of ordinary project-owner updates.

CREATE TABLE IF NOT EXISTS public.starter_template_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE RESTRICT,
  configured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.starter_template_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.starter_template_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.starter_template_config TO service_role;

-- This is the existing A Study in Scarlet project already designated by the
-- original starter-project migration. INSERT ... SELECT keeps fresh/empty
-- environments safe: if the project is absent, onboarding falls back to the
-- normal empty Default project instead of trusting another flagged project.
UPDATE public.projects
SET is_template = true
WHERE id = '6c9ffe69-f07e-47dd-b19a-6a92b171523f';

INSERT INTO public.starter_template_config (singleton, project_id)
SELECT true, id
FROM public.projects
WHERE id = '6c9ffe69-f07e-47dd-b19a-6a92b171523f'
ON CONFLICT (singleton) DO UPDATE
SET project_id = EXCLUDED.project_id,
    configured_at = now();

CREATE OR REPLACE FUNCTION public.protect_project_template()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _is_admin boolean := COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false);
  _is_privileged_role boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
BEGIN
  IF _is_admin OR _is_privileged_role THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_template THEN
      RAISE EXCEPTION 'Only administrators can designate starter templates'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_template THEN
      RAISE EXCEPTION 'Only administrators can delete starter templates'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Let the owner relinquish a legacy/incorrect template flag. While the flag
  -- remains true, only an administrator can alter the template or its content.
  IF OLD.is_template AND NOT NEW.is_template THEN
    RETURN NEW;
  END IF;

  IF OLD.is_template OR NEW.is_template IS DISTINCT FROM OLD.is_template THEN
    RAISE EXCEPTION 'Only administrators can modify starter templates'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_project_template() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_project_template ON public.projects;
CREATE TRIGGER protect_project_template
BEFORE INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_project_template();

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

  IF _template_id IS NULL THEN RETURN; END IF;
  PERFORM public.clone_project_for_user(_template_id, _new_user_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed_new_user_from_template failed for %: %', _new_user_id, SQLERRM;
END;
$$;

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

  INSERT INTO public.projects (user_id, title, icon, position, is_starter)
  VALUES (_user_id, 'Default', '📁', 0, true)
  RETURNING id INTO _new_id;

  INSERT INTO public.map_canvas (user_id, project_id, title, position, bg_color)
  VALUES (_user_id, _new_id, '🗺️ World Map', 0, '#87a782');

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_starter_project(uuid) TO authenticated;

-- Rollback path: restore seed_new_user_from_template and
-- ensure_starter_project from their preceding migrations, then drop
-- protect_project_template, protect_project_template(), and
-- starter_template_config. No user-authored project content is rewritten by
-- this change.
