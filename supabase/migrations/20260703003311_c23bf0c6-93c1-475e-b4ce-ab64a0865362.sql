
CREATE OR REPLACE FUNCTION public.validate_user_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.plan NOT IN ('draft', 'manuscript', 'studio', 'beginner', 'storyteller', 'author') THEN
    RAISE EXCEPTION 'Invalid plan: %', NEW.plan;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.user_plans SET plan = 'draft'      WHERE plan = 'beginner';
UPDATE public.user_plans SET plan = 'manuscript' WHERE plan = 'storyteller';
UPDATE public.user_plans SET plan = 'studio'     WHERE plan = 'author';

CREATE OR REPLACE FUNCTION public.validate_user_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.plan NOT IN ('draft', 'manuscript', 'studio') THEN
    RAISE EXCEPTION 'Invalid plan: %. Must be draft, manuscript, or studio.', NEW.plan;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT plan FROM public.user_plans WHERE user_id = _user_id), 'draft')
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'draft');
  PERFORM public.seed_new_user_from_template(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_quota(_user_id uuid, _feature text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _plan text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT public.get_user_plan(_user_id) INTO _plan;
  IF _plan = 'draft' THEN RETURN NULL; END IF;
  IF _plan = 'manuscript' THEN
    RETURN CASE _feature
      WHEN 'chat_flash' THEN 500
      WHEN 'map_draw'   THEN 30
      WHEN 'ocr'        THEN 100
      WHEN 'draw_flavor' THEN 200
      ELSE NULL
    END;
  END IF;
  IF _plan = 'studio' THEN
    RETURN CASE _feature
      WHEN 'chat_flash' THEN 2000
      WHEN 'chat_gpt5'  THEN 200
      WHEN 'highlight'  THEN 300
      WHEN 'map_draw'   THEN 150
      WHEN 'ocr'        THEN 500
      WHEN 'draw_flavor' THEN 1000
      ELSE NULL
    END;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  openai_key_ciphertext text,
  openai_key_iv text,
  openai_key_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT (id, user_id, openai_key_last4, created_at, updated_at) ON public.user_api_keys TO authenticated;
GRANT ALL ON public.user_api_keys TO service_role;

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own key metadata"
ON public.user_api_keys FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own key"
ON public.user_api_keys FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_api_keys_updated_at
BEFORE UPDATE ON public.user_api_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
