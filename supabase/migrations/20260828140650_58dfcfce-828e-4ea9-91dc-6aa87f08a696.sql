CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wl_lang text;
  _wl_name text;
  _name text;
  _pref text := 'en';
BEGIN
  BEGIN
    SELECT writing_language, name INTO _wl_lang, _wl_name FROM public.waitlist WHERE lower(email) = lower(NEW.email) LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _wl_lang := NULL; _wl_name := NULL;
  END;

  IF _wl_lang IS NOT NULL AND (lower(_wl_lang) LIKE 'pt%' OR lower(_wl_lang) LIKE '%portug%') THEN
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
    DELETE FROM public.waitlist WHERE lower(email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;