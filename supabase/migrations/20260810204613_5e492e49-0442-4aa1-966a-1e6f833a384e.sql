-- 1. Unified balance columns
ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS credits_included integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS credits_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_purchased integer NOT NULL DEFAULT 0;

UPDATE public.user_credits SET
  credits_included  = COALESCE(writing_included, 0)  + COALESCE(image_included, 0),
  credits_used      = COALESCE(writing_used, 0)      + COALESCE(image_used, 0),
  credits_purchased = COALESCE(writing_purchased, 0) + COALESCE(image_purchased, 0);

ALTER TABLE public.user_credits
  DROP COLUMN IF EXISTS writing_included,
  DROP COLUMN IF EXISTS writing_used,
  DROP COLUMN IF EXISTS writing_purchased,
  DROP COLUMN IF EXISTS image_included,
  DROP COLUMN IF EXISTS image_used,
  DROP COLUMN IF EXISTS image_purchased;

-- 2. Ledger: single bucket
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_bucket_check;
ALTER TABLE public.credit_ledger ALTER COLUMN bucket SET DEFAULT 'credits';
UPDATE public.credit_ledger SET bucket = 'credits' WHERE bucket <> 'credits';
ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_bucket_check CHECK (bucket = 'credits');

-- 3. Plan pool
DROP FUNCTION IF EXISTS public.plan_credit_defaults(text);
CREATE FUNCTION public.plan_credit_defaults(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _plan WHEN 'studio' THEN 4000 WHEN 'manuscript' THEN 1000 ELSE 50 END
$$;

-- 4. Seed / reset
CREATE OR REPLACE FUNCTION public.ensure_user_credits(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _plan TEXT; _c INTEGER;
BEGIN
  SELECT public.get_user_plan(_user_id) INTO _plan;
  SELECT public.plan_credit_defaults(_plan) INTO _c;
  INSERT INTO public.user_credits (user_id, credits_included)
  VALUES (_user_id, _c)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_period_reset(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.user_credits; _plan TEXT; _c INTEGER; _now_period TIMESTAMPTZ;
BEGIN
  PERFORM public.ensure_user_credits(_user_id);
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  _now_period := date_trunc('month', now());
  IF _row.period_start < _now_period THEN
    SELECT public.get_user_plan(_user_id) INTO _plan;
    SELECT public.plan_credit_defaults(_plan) INTO _c;
    UPDATE public.user_credits SET
      credits_included = _c,
      credits_used = 0,
      period_start = _now_period,
      updated_at = now()
    WHERE user_id = _user_id;
    INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason)
    VALUES (_user_id, 'reset', 'credits', _c, 'monthly_reset');
  END IF;
END;
$$;

-- 5. Balance read
CREATE OR REPLACE FUNCTION public.get_my_credits()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid UUID := auth.uid(); _row public.user_credits;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('included',0,'used',0,'purchased',0,'remaining',0,'period_start',NULL);
  END IF;
  RETURN jsonb_build_object(
    'included', _row.credits_included,
    'used', _row.credits_used,
    'purchased', _row.credits_purchased,
    'remaining', (_row.credits_included - _row.credits_used) + _row.credits_purchased,
    'period_start', _row.period_start
  );
END;
$$;

-- 6. Spend
DROP FUNCTION IF EXISTS public.spend_credits(uuid, text, integer, text);
CREATE FUNCTION public.spend_credits(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.user_credits;
  _available INTEGER;
  _from_inc INTEGER;
  _from_pur INTEGER;
  _ledger_id UUID;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'bad amount'; END IF;
  PERFORM public.apply_credit_period_reset(_user_id);
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  _available := (_row.credits_included - _row.credits_used) + _row.credits_purchased;

  -- Usage-metered charges are computed after the model has already answered,
  -- so we never refuse here: clamp to whatever is left (can go to zero).
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
$$;

-- 7. Grant / purchase
DROP FUNCTION IF EXISTS public.grant_credits(uuid, text, integer, text, text, uuid);
CREATE FUNCTION public.grant_credits(_user_id uuid, _amount integer, _kind text, _reason text, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _kind NOT IN ('grant','purchase') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'bad amount'; END IF;
  PERFORM public.ensure_user_credits(_user_id);
  UPDATE public.user_credits
     SET credits_purchased = credits_purchased + _amount, updated_at = now()
   WHERE user_id = _user_id;
  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason, actor)
  VALUES (_user_id, _kind, 'credits', _amount, _reason, _actor);
END;
$$;

-- 8. Refund
CREATE OR REPLACE FUNCTION public.refund_ai_charge(_ledger_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.credit_ledger;
  _amount INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  SELECT * INTO _row FROM public.credit_ledger WHERE id = _ledger_id;
  IF _row.id IS NULL OR _row.user_id <> _uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF _row.kind <> 'spend' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_spend');
  END IF;
  IF (_row.metadata->>'refunded') = 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_refunded');
  END IF;
  IF _row.created_at < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  _amount := ABS(_row.delta);

  UPDATE public.user_credits
     SET credits_purchased = credits_purchased + _amount, updated_at = now()
   WHERE user_id = _uid;

  UPDATE public.credit_ledger
     SET metadata = metadata || jsonb_build_object('refunded', true)
   WHERE id = _ledger_id;

  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason, metadata)
  VALUES (_uid, 'refund', 'credits', _amount,
          'undo:' || COALESCE(_row.reason, ''),
          jsonb_build_object('refund_of', _ledger_id));

  RETURN jsonb_build_object('ok', true, 'amount', _amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_credits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_charge(uuid) TO authenticated;