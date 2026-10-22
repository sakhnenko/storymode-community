CREATE OR REPLACE FUNCTION public.plan_credit_defaults(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _plan WHEN 'studio' THEN 3500 WHEN 'manuscript' THEN 800 ELSE 30 END
$$;

UPDATE public.user_credits uc
   SET credits_included = 800, updated_at = now()
  FROM public.user_plans up
 WHERE up.user_id = uc.user_id
   AND up.plan = 'manuscript'
   AND uc.credits_included = 1000;