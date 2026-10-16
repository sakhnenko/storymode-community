
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS writing_language text,
  ADD COLUMN IF NOT EXISTS has_own_openai_key boolean;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'draft');
  PERFORM public.seed_new_user_from_template(NEW.id);
  -- Remove any matching waitlist entry once the user actually joins.
  BEGIN
    DELETE FROM public.waitlist WHERE lower(email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;
