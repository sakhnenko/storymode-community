CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _wl_lang text;
  _pref text := 'en';
BEGIN
  BEGIN
    SELECT writing_language INTO _wl_lang FROM public.waitlist WHERE lower(email) = lower(NEW.email) LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _wl_lang := NULL;
  END;

  IF _wl_lang IS NOT NULL AND (lower(_wl_lang) LIKE 'pt%' OR lower(_wl_lang) LIKE '%portug%') THEN
    _pref := 'pt-BR';
  END IF;

  INSERT INTO public.profiles (user_id, preferred_language) VALUES (NEW.id, _pref);
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
$function$;