-- 1) Allow 'author' plan
CREATE OR REPLACE FUNCTION public.validate_user_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.plan NOT IN ('beginner', 'storyteller', 'author') THEN
    RAISE EXCEPTION 'Invalid plan: %. Must be beginner, storyteller, or author.', NEW.plan;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Per-user AI usage tracking (per calendar month, per feature)
CREATE TABLE IF NOT EXISTS public.user_ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,
  feature text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month, feature)
);

GRANT SELECT ON public.user_ai_usage TO authenticated;
GRANT ALL ON public.user_ai_usage TO service_role;

ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI usage"
  ON public.user_ai_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) Helper: quota lookup. NULL means feature is locked for this plan.
CREATE OR REPLACE FUNCTION public.get_ai_quota(_user_id uuid, _feature text)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _plan text;
BEGIN
  SELECT public.get_user_plan(_user_id) INTO _plan;

  -- Free / Beginner: no AI at all
  IF _plan = 'beginner' THEN
    RETURN NULL;
  END IF;

  -- Storyteller: cheap AI only
  IF _plan = 'storyteller' THEN
    RETURN CASE _feature
      WHEN 'chat_flash' THEN 500
      WHEN 'map_draw'   THEN 30
      WHEN 'ocr'        THEN 100
      WHEN 'draw_flavor' THEN 200
      ELSE NULL
    END;
  END IF;

  -- Author: everything
  IF _plan = 'author' THEN
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

-- 4) Helper: atomically bump usage and return the new count
CREATE OR REPLACE FUNCTION public.bump_ai_usage(_user_id uuid, _feature text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _month text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _count integer;
BEGIN
  INSERT INTO public.user_ai_usage (user_id, month, feature, count, updated_at)
  VALUES (_user_id, _month, _feature, 1, now())
  ON CONFLICT (user_id, month, feature)
  DO UPDATE SET count = public.user_ai_usage.count + 1, updated_at = now()
  RETURNING count INTO _count;
  RETURN _count;
END;
$$;

-- 5) Helper: current month's usage (for quota checks)
CREATE OR REPLACE FUNCTION public.get_current_ai_usage(_user_id uuid, _feature text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT count FROM public.user_ai_usage
       WHERE user_id = _user_id
         AND feature = _feature
         AND month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')),
    0
  );
$$;

-- 6) Grandfather existing Storyteller users into Author
UPDATE public.user_plans SET plan = 'author' WHERE plan = 'storyteller';