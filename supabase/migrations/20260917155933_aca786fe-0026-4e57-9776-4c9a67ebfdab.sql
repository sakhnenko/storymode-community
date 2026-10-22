-- Serialize paid AI work per user. Every provider call receives a short-lived
-- reservation before it starts and settles the measured charge afterward.

CREATE TABLE IF NOT EXISTS public.ai_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  reserved_credits integer NOT NULL CHECK (reserved_credits > 0),
  actual_credits integer,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'settled', 'released', 'expired')),
  ledger_id uuid UNIQUE REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  finished_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_credit_reservations_one_active_per_user
  ON public.ai_credit_reservations (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ai_credit_reservations_user_created_idx
  ON public.ai_credit_reservations (user_id, created_at DESC);

ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_credit_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_credit_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_credits(
  _user_id uuid,
  _feature text,
  _minimum integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _credits public.user_credits;
  _active_id uuid;
  _reservation_id uuid;
  _available integer;
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _feature IS NULL OR length(_feature) > 80 THEN
    RAISE EXCEPTION 'bad reservation';
  END IF;
  IF _minimum <= 0 OR _minimum > 1000000 THEN
    RAISE EXCEPTION 'bad reservation amount';
  END IF;

  PERFORM public.apply_credit_period_reset(_user_id);
  SELECT * INTO _credits
  FROM public.user_credits
  WHERE user_id = _user_id
  FOR UPDATE;

  UPDATE public.ai_credit_reservations
  SET status = 'expired', finished_at = now()
  WHERE user_id = _user_id
    AND status = 'active'
    AND expires_at <= now();

  SELECT id INTO _active_id
  FROM public.ai_credit_reservations
  WHERE user_id = _user_id AND status = 'active'
  LIMIT 1;

  IF _active_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'busy');
  END IF;

  _available := (_credits.credits_included - _credits.credits_used)
    + _credits.credits_purchased;

  IF _available < _minimum THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient',
      'needed', _minimum,
      'remaining', GREATEST(_available, 0)
    );
  END IF;

  INSERT INTO public.ai_credit_reservations
    (user_id, feature, reserved_credits)
  VALUES
    (_user_id, _feature, _minimum)
  RETURNING id INTO _reservation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reservation_id', _reservation_id,
    'reserved', _minimum,
    'remaining', _available
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_credit_reservation(
  _reservation_id uuid,
  _user_id uuid,
  _amount integer,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reservation public.ai_credit_reservations;
  _credits public.user_credits;
  _available integer;
  _from_included integer;
  _from_purchased integer;
  _charged integer;
  _ledger_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF _amount <= 0 OR _amount > 1000000 THEN
    RAISE EXCEPTION 'bad amount';
  END IF;

  SELECT * INTO _reservation
  FROM public.ai_credit_reservations
  WHERE id = _reservation_id AND user_id = _user_id
  FOR UPDATE;

  IF _reservation.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF _reservation.status = 'settled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'spent', _reservation.actual_credits,
      'ledger_id', _reservation.ledger_id
    );
  END IF;
  IF _reservation.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', _reservation.status);
  END IF;

  SELECT * INTO _credits
  FROM public.user_credits
  WHERE user_id = _user_id
  FOR UPDATE;

  _available := (_credits.credits_included - _credits.credits_used)
    + _credits.credits_purchased;
  _from_included := LEAST(
    _amount,
    GREATEST(_credits.credits_included - _credits.credits_used, 0)
  );
  _from_purchased := LEAST(
    _amount - _from_included,
    GREATEST(_credits.credits_purchased, 0)
  );
  _charged := _from_included + _from_purchased;

  UPDATE public.user_credits
  SET credits_used = credits_used + _from_included,
      credits_purchased = credits_purchased - _from_purchased,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.credit_ledger
    (user_id, kind, bucket, delta, reason, metadata)
  VALUES
    (
      _user_id,
      'spend',
      'credits',
      -_charged,
      _reason,
      COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object(
        'reservation_id', _reservation_id,
        'reserved_credits', _reservation.reserved_credits,
        'requested_credits', _amount,
        'uncovered_credits', GREATEST(_amount - _charged, 0)
      )
    )
  RETURNING id INTO _ledger_id;

  UPDATE public.ai_credit_reservations
  SET status = 'settled',
      actual_credits = _charged,
      ledger_id = _ledger_id,
      metadata = COALESCE(_metadata, '{}'::jsonb),
      finished_at = now()
  WHERE id = _reservation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'spent', _charged,
    'requested', _amount,
    'remaining', GREATEST(_available - _charged, 0),
    'ledger_id', _ledger_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_credit_reservation(
  _reservation_id uuid,
  _user_id uuid,
  _reason text DEFAULT 'request_aborted'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _released uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_credit_reservations
  SET status = 'released',
      metadata = metadata || jsonb_build_object('release_reason', COALESCE(_reason, 'request_aborted')),
      finished_at = now()
  WHERE id = _reservation_id
    AND user_id = _user_id
    AND status = 'active'
  RETURNING id INTO _released;

  RETURN jsonb_build_object('ok', true, 'released', _released IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_credits(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_credit_reservation(uuid, uuid, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ai_credit_reservation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_credit_reservation(uuid, uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_credit_reservation(uuid, uuid, text) TO service_role;