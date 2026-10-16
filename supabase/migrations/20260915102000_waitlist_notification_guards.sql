-- Atomically register waitlist submissions, claim at most one notification,
-- and rate-limit anonymous notification work without storing raw IP addresses.

CREATE TABLE IF NOT EXISTS public.waitlist_notification_deliveries (
  waitlist_id uuid PRIMARY KEY REFERENCES public.waitlist(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text
);

CREATE TABLE IF NOT EXISTS public.waitlist_notification_rate_limits (
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (ip_hash, window_start)
);

ALTER TABLE public.waitlist_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_notification_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.waitlist_notification_deliveries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.waitlist_notification_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.waitlist_notification_deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.waitlist_notification_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.register_waitlist_submission(
  _email text,
  _source text,
  _name text,
  _writing_about text,
  _writing_language text,
  _has_own_openai_key boolean,
  _ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized_email text := lower(btrim(COALESCE(_email, '')));
  _window timestamptz := date_trunc('hour', now());
  _request_count integer;
  _waitlist_id uuid;
  _created_at timestamptz;
  _was_inserted boolean := false;
  _claimed_id uuid;
  _delivery_status text;
  _delivery_claimed_at timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(_normalized_email) NOT BETWEEN 5 AND 320
     OR _normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid submission';
  END IF;
  IF _ip_hash IS NULL OR length(_ip_hash) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'invalid submission';
  END IF;

  INSERT INTO public.waitlist_notification_rate_limits
    (ip_hash, window_start, request_count)
  VALUES
    (_ip_hash, _window, 1)
  ON CONFLICT (ip_hash, window_start) DO UPDATE
  SET request_count = public.waitlist_notification_rate_limits.request_count + 1
  RETURNING request_count INTO _request_count;

  IF _request_count > 10 THEN
    RETURN jsonb_build_object('accepted', true, 'notify', false, 'rate_limited', true);
  END IF;

  -- Serialize case-insensitively without rewriting or deleting any historical
  -- mixed-case duplicates that may already exist.
  PERFORM pg_advisory_xact_lock(hashtextextended(_normalized_email, 0));
  SELECT id, created_at INTO _waitlist_id, _created_at
  FROM public.waitlist
  WHERE lower(email) = _normalized_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF _waitlist_id IS NULL THEN
    INSERT INTO public.waitlist
      (email, source, name, writing_about, writing_language, has_own_openai_key)
    VALUES
      (
        _normalized_email,
        left(NULLIF(btrim(_source), ''), 100),
        left(NULLIF(btrim(_name), ''), 200),
        left(NULLIF(btrim(_writing_about), ''), 2000),
        left(NULLIF(btrim(_writing_language), ''), 100),
        COALESCE(_has_own_openai_key, false)
      )
    ON CONFLICT (email) DO NOTHING
    RETURNING id, created_at INTO _waitlist_id, _created_at;
    _was_inserted := FOUND;
  END IF;

  IF _waitlist_id IS NULL THEN
    SELECT id, created_at INTO _waitlist_id, _created_at
    FROM public.waitlist
    WHERE lower(email) = _normalized_email
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF _waitlist_id IS NULL THEN
    RAISE EXCEPTION 'waitlist registration failed';
  END IF;

  -- The short compatibility window lets an older client insert the row and
  -- immediately call the function. An old address with no delivery record
  -- cannot be replayed, while a recorded failed/stale delivery remains safely
  -- retryable with the provider idempotency key.
  IF NOT _was_inserted AND _created_at < now() - interval '10 minutes' THEN
    SELECT status, claimed_at INTO _delivery_status, _delivery_claimed_at
    FROM public.waitlist_notification_deliveries
    WHERE waitlist_id = _waitlist_id;

    IF _delivery_status IS NULL
       OR _delivery_status = 'sent'
       OR (_delivery_status = 'sending' AND _delivery_claimed_at >= now() - interval '10 minutes') THEN
      RETURN jsonb_build_object('accepted', true, 'notify', false, 'duplicate', true);
    END IF;
  END IF;

  INSERT INTO public.waitlist_notification_deliveries
    (waitlist_id, status, claimed_at, sent_at, last_error)
  VALUES
    (_waitlist_id, 'sending', now(), NULL, NULL)
  ON CONFLICT (waitlist_id) DO UPDATE
  SET status = 'sending',
      claimed_at = now(),
      sent_at = NULL,
      last_error = NULL
  WHERE public.waitlist_notification_deliveries.status = 'failed'
     OR (
       public.waitlist_notification_deliveries.status = 'sending'
       AND public.waitlist_notification_deliveries.claimed_at < now() - interval '10 minutes'
     )
  RETURNING waitlist_id INTO _claimed_id;

  RETURN jsonb_build_object(
    'accepted', true,
    'notify', _claimed_id IS NOT NULL,
    'waitlist_id', CASE WHEN _claimed_id IS NOT NULL THEN _waitlist_id ELSE NULL END,
    'duplicate', NOT _was_inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_waitlist_notification(
  _waitlist_id uuid,
  _sent boolean,
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.waitlist_notification_deliveries
  SET status = CASE WHEN _sent THEN 'sent' ELSE 'failed' END,
      sent_at = CASE WHEN _sent THEN now() ELSE NULL END,
      last_error = CASE WHEN _sent THEN NULL ELSE left(COALESCE(_error, 'delivery failed'), 500) END
  WHERE waitlist_id = _waitlist_id AND status = 'sending';
END;
$$;

REVOKE ALL ON FUNCTION public.register_waitlist_submission(text, text, text, text, text, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_waitlist_notification(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_waitlist_submission(text, text, text, text, text, boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_waitlist_notification(uuid, boolean, text)
  TO service_role;

-- Compatibility: the old client-side INSERT policy remains during rollout.
-- Once all deployed clients submit through notify-waitlist, a later contraction
-- migration can revoke anon INSERT on waitlist and drop that policy.
