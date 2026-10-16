-- First-run welcome chat. The signup trigger deletes a person's waitlist row,
-- so their waitlist answers are copied here first; the welcome chat then
-- records its progress and the project it created.

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  project_type text,
  project_detail text,
  writing_about text,
  writing_language text,
  welcome_message text,
  setup_attempts integer NOT NULL DEFAULT 0 CHECK (setup_attempts >= 0),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_onboarding TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_onboarding TO service_role;

DROP POLICY IF EXISTS "Users can read their own onboarding" ON public.user_onboarding;
CREATE POLICY "Users can read their own onboarding"
  ON public.user_onboarding FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_user_onboarding_updated_at ON public.user_onboarding;
CREATE TRIGGER update_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wl_lang text;
  _wl_name text;
  _wl_ui text;
  _wl_project_type text;
  _wl_project_detail text;
  _wl_writing_about text;
  _name text;
  _pref text := 'en';
BEGIN
  BEGIN
    SELECT writing_language, name, ui_language, project_type, project_detail, writing_about
    INTO _wl_lang, _wl_name, _wl_ui, _wl_project_type, _wl_project_detail, _wl_writing_about
    FROM public.waitlist WHERE lower(email) = lower(NEW.email) LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _wl_lang := NULL; _wl_name := NULL; _wl_ui := NULL;
    _wl_project_type := NULL; _wl_project_detail := NULL; _wl_writing_about := NULL;
  END;

  IF _wl_ui IN ('en', 'pt-BR') THEN
    _pref := _wl_ui;
  ELSIF _wl_lang IS NOT NULL AND (lower(_wl_lang) LIKE 'pt%' OR lower(_wl_lang) LIKE '%portug%') THEN
    _pref := 'pt-BR';
  END IF;

  _name := NULLIF(btrim(coalesce(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    _wl_name,
    ''
  )), '');

  INSERT INTO public.profiles (user_id, preferred_language, display_name) VALUES (NEW.id, _pref, _name);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'draft');
  PERFORM public.ensure_user_credits(NEW.id);
  PERFORM public.seed_new_user_from_template(NEW.id);

  IF _pref = 'pt-BR' THEN
    UPDATE public.projects SET ai_language = 'pt-BR' WHERE user_id = NEW.id;
  END IF;

  BEGIN
    INSERT INTO public.user_onboarding (user_id, project_type, project_detail, writing_about, writing_language)
    VALUES (NEW.id, _wl_project_type, _wl_project_detail, _wl_writing_about, _wl_lang)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'user_onboarding seed failed for %: %', NEW.id, SQLERRM;
  END;

  BEGIN
    DELETE FROM public.waitlist WHERE lower(email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;
