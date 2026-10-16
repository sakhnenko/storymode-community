CREATE OR REPLACE FUNCTION public.sync_credits_on_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _c integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.plan IS NOT DISTINCT FROM OLD.plan THEN
    RETURN NEW;
  END IF;
  PERFORM public.ensure_user_credits(NEW.user_id);
  SELECT public.plan_credit_defaults(NEW.plan) INTO _c;
  UPDATE public.user_credits
     SET credits_included = GREATEST(_c, credits_included),
         updated_at = now()
   WHERE user_id = NEW.user_id
     AND credits_included < _c;
  IF FOUND THEN
    INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason)
    VALUES (NEW.user_id, 'reset', 'credits', _c, 'plan_change:' || NEW.plan);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_credits_on_plan_change ON public.user_plans;
CREATE TRIGGER sync_credits_on_plan_change
AFTER INSERT OR UPDATE OF plan ON public.user_plans
FOR EACH ROW EXECUTE FUNCTION public.sync_credits_on_plan_change();