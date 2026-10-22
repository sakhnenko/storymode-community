CREATE OR REPLACE FUNCTION public.ensure_user_credits(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _plan TEXT; _c INTEGER; _signup TIMESTAMPTZ;
BEGIN
  SELECT public.get_user_plan(_user_id) INTO _plan;
  SELECT public.plan_credit_defaults(_plan) INTO _c;
  SELECT created_at INTO _signup FROM auth.users WHERE id = _user_id;
  INSERT INTO public.user_credits (user_id, credits_included, period_start)
  VALUES (_user_id, _c, COALESCE(_signup, now()))
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_period_reset(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.user_credits; _plan TEXT; _c INTEGER; _new_start TIMESTAMPTZ; _months INTEGER;
BEGIN
  PERFORM public.ensure_user_credits(_user_id);
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  IF now() >= _row.period_start + interval '1 month' THEN
    -- Roll forward whole months from the user's own anniversary date.
    _months := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - _row.period_start)) / EXTRACT(EPOCH FROM interval '30 days'))::int);
    _new_start := _row.period_start + (_months || ' months')::interval;
    WHILE _new_start > now() LOOP
      _new_start := _new_start - interval '1 month';
    END LOOP;
    WHILE _new_start + interval '1 month' <= now() LOOP
      _new_start := _new_start + interval '1 month';
    END LOOP;

    SELECT public.get_user_plan(_user_id) INTO _plan;
    SELECT public.plan_credit_defaults(_plan) INTO _c;
    UPDATE public.user_credits SET
      credits_included = _c,
      credits_used = 0,
      period_start = _new_start,
      updated_at = now()
    WHERE user_id = _user_id;
    INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason)
    VALUES (_user_id, 'reset', 'credits', _c, 'monthly_reset');
  END IF;
END;
$$;

-- Realign existing rows to each user's signup anniversary.
UPDATE public.user_credits uc
SET period_start = u.created_at
      + (FLOOR(EXTRACT(EPOCH FROM (now() - u.created_at)) / EXTRACT(EPOCH FROM interval '30 days'))::int || ' months')::interval
FROM auth.users u
WHERE u.id = uc.user_id;

UPDATE public.user_credits uc
SET period_start = uc.period_start - interval '1 month'
WHERE uc.period_start > now();