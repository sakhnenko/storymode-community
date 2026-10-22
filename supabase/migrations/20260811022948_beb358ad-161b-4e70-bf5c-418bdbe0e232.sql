CREATE OR REPLACE FUNCTION public.plan_credit_defaults(_plan text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _plan WHEN 'studio' THEN 3500 WHEN 'manuscript' THEN 1000 ELSE 30 END
$function$;