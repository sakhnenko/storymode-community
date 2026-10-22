-- 1. story_chapters: prevent collaborators from changing user_id attribution
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;
CREATE POLICY "Shared users can update chapters"
ON public.story_chapters
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.project_shares ps
    WHERE ps.project_id = story_chapters.project_id
      AND ps.shared_with_user_id = auth.uid()
      AND ps.status = 'accepted'
  )
);

-- 2. Lock down AI quota functions to caller identity
CREATE OR REPLACE FUNCTION public.bump_ai_usage(_user_id uuid, _feature text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _month text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _count integer;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.user_ai_usage (user_id, month, feature, count, updated_at)
  VALUES (_user_id, _month, _feature, 1, now())
  ON CONFLICT (user_id, month, feature)
  DO UPDATE SET count = public.user_ai_usage.count + 1, updated_at = now()
  RETURNING count INTO _count;
  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ai_quota(_user_id uuid, _feature text)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _plan text;
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT public.get_user_plan(_user_id) INTO _plan;
  IF _plan = 'beginner' THEN RETURN NULL; END IF;
  IF _plan = 'storyteller' THEN
    RETURN CASE _feature
      WHEN 'chat_flash' THEN 500
      WHEN 'map_draw'   THEN 30
      WHEN 'ocr'        THEN 100
      WHEN 'draw_flavor' THEN 200
      ELSE NULL
    END;
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_current_ai_usage(_user_id uuid, _feature text)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN COALESCE(
    (SELECT count FROM public.user_ai_usage
       WHERE user_id = _user_id
         AND feature = _feature
         AND month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')),
    0
  );
END;
$function$;

-- 3. Explicit deny policies for client writes on user_ai_usage
-- (service_role bypasses RLS, so edge functions still work via the SECURITY DEFINER RPCs)
CREATE POLICY "No client inserts on ai usage"
ON public.user_ai_usage FOR INSERT TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "No client updates on ai usage"
ON public.user_ai_usage FOR UPDATE TO authenticated, anon
USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on ai usage"
ON public.user_ai_usage FOR DELETE TO authenticated, anon
USING (false);

-- 4. Explicit deny policies for client INSERT/DELETE on user_plans
CREATE POLICY "No client inserts on user plans"
ON public.user_plans FOR INSERT TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "No client deletes on user plans"
ON public.user_plans FOR DELETE TO authenticated, anon
USING (false);