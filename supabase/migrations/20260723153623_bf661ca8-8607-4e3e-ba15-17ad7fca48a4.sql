CREATE OR REPLACE FUNCTION public.plan_credit_defaults(_plan text)
 RETURNS TABLE(writing integer, image integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE _plan WHEN 'studio' THEN 500 WHEN 'manuscript' THEN 100 ELSE 20 END,
    CASE _plan WHEN 'studio' THEN 100 WHEN 'manuscript' THEN 20 ELSE 5 END
$function$;