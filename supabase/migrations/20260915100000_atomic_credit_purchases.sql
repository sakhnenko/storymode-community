-- Record each Stripe checkout exactly once and grant its credits in the same
-- database transaction.

CREATE TABLE IF NOT EXISTS public.credit_purchase_receipts (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  ledger_id uuid UNIQUE REFERENCES public.credit_ledger(id) ON DELETE RESTRICT,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_purchase_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credit_purchase_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_purchase_receipts TO service_role;

-- Preserve idempotency for purchases processed before this table existed.
-- DISTINCT ON tolerates any historical duplicate ledger rows without changing
-- balances or deleting audit history.
INSERT INTO public.credit_purchase_receipts
  (session_id, user_id, pack_id, credits, ledger_id, processed_at)
SELECT DISTINCT ON (ledger.metadata->>'session_id')
  ledger.metadata->>'session_id',
  ledger.user_id,
  COALESCE(ledger.metadata->>'pack_id', 'legacy'),
  GREATEST(ledger.delta, 1),
  ledger.id,
  ledger.created_at
FROM public.credit_ledger ledger
WHERE ledger.kind = 'purchase'
  AND NULLIF(ledger.metadata->>'session_id', '') IS NOT NULL
ORDER BY ledger.metadata->>'session_id', ledger.created_at ASC
ON CONFLICT (session_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_credit_purchase(
  _session_id text,
  _user_id uuid,
  _pack_id text,
  _credits integer,
  _actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed_session text;
  _receipt public.credit_purchase_receipts;
  _ledger_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF _session_id IS NULL OR length(_session_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'bad session id';
  END IF;
  IF _user_id IS NULL OR _actor IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'bad user';
  END IF;
  IF _pack_id IS NULL OR length(_pack_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'bad pack';
  END IF;
  IF _credits <= 0 OR _credits > 1000000 THEN
    RAISE EXCEPTION 'bad credit amount';
  END IF;

  INSERT INTO public.credit_purchase_receipts
    (session_id, user_id, pack_id, credits)
  VALUES
    (_session_id, _user_id, _pack_id, _credits)
  ON CONFLICT (session_id) DO NOTHING
  RETURNING session_id INTO _claimed_session;

  IF _claimed_session IS NULL THEN
    SELECT * INTO _receipt
    FROM public.credit_purchase_receipts
    WHERE session_id = _session_id;

    IF _receipt.user_id IS DISTINCT FROM _user_id THEN
      RAISE EXCEPTION 'Session mismatch' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'credited', true,
      'duplicate', true,
      'credits', _receipt.credits,
      'ledger_id', _receipt.ledger_id
    );
  END IF;

  PERFORM public.ensure_user_credits(_user_id);

  UPDATE public.user_credits
  SET credits_purchased = credits_purchased + _credits,
      updated_at = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit account not found';
  END IF;

  INSERT INTO public.credit_ledger
    (user_id, kind, bucket, delta, reason, actor, metadata)
  VALUES
    (
      _user_id,
      'purchase',
      'credits',
      _credits,
      'stripe:' || _pack_id,
      _actor,
      jsonb_build_object('session_id', _session_id, 'pack_id', _pack_id)
    )
  RETURNING id INTO _ledger_id;

  UPDATE public.credit_purchase_receipts
  SET ledger_id = _ledger_id,
      processed_at = now()
  WHERE session_id = _session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'credited', true,
    'duplicate', false,
    'credits', _credits,
    'ledger_id', _ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_credit_purchase(text, uuid, text, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credit_purchase(text, uuid, text, integer, uuid)
  TO service_role;

-- Rollback: restore verify-credit-purchase before dropping
-- grant_credit_purchase() and credit_purchase_receipts. The receipt rows are
-- audit/idempotency data; dropping them does not reverse granted balances.

