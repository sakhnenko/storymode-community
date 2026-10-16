CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount integer, _kind text, _reason text, _actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _kind NOT IN ('grant','purchase') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'bad amount'; END IF;
  PERFORM public.ensure_user_credits(_user_id);
  UPDATE public.user_credits
     SET credits_purchased = credits_purchased + _amount, updated_at = now()
   WHERE user_id = _user_id;
  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason, actor)
  VALUES (_user_id, _kind, 'credits', _amount, _reason, _actor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_credits(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.user_credits;
  _available INTEGER;
  _from_inc INTEGER;
  _from_pur INTEGER;
  _ledger_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'bad amount'; END IF;
  PERFORM public.apply_credit_period_reset(_user_id);
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  _available := (_row.credits_included - _row.credits_used) + _row.credits_purchased;

  _from_inc := LEAST(_amount, GREATEST(_row.credits_included - _row.credits_used, 0));
  _from_pur := LEAST(_amount - _from_inc, GREATEST(_row.credits_purchased, 0));

  UPDATE public.user_credits SET
    credits_used = credits_used + _from_inc,
    credits_purchased = credits_purchased - _from_pur,
    updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason, metadata)
  VALUES (_user_id, 'spend', 'credits', -(_from_inc + _from_pur), _reason, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'spent', _from_inc + _from_pur,
    'requested', _amount,
    'remaining', GREATEST(_available - _amount, 0),
    'ledger_id', _ledger_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_credits(uuid, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.apply_credit_period_reset(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_user_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_period_reset(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_credits(uuid) TO service_role;