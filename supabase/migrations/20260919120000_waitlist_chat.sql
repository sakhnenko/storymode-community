-- Conversational waitlist:
--   * store the interface language the visitor chose plus their project answers;
--   * budget AI-written replies on the public page per calendar month;
--   * apply the chosen language to the account when the invited user signs up.

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS ui_language text,
  ADD COLUMN IF NOT EXISTS project_type text,
  ADD COLUMN IF NOT EXISTS project_detail text;

ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS waitlist_ui_language_check;
ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_ui_language_check
  CHECK (ui_language IS NULL OR ui_language IN ('en', 'pt-BR'));

-- Replace rather than overload, so named-argument RPC calls resolve to exactly
-- one function. The new parameters default to NULL, which keeps callers that
-- still send the original seven arguments working.
DROP FUNCTION IF EXISTS public.register_waitlist_submission(text, text, text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.register_waitlist_submission(
  _email text,
  _source text,
  _name text,
  _writing_about text,
  _writing_language text,
  _has_own_openai_key boolean,
  _ip_hash text,
  _ui_language text DEFAULT NULL,
  _project_type text DEFAULT NULL,
  _project_detail text DEFAULT NULL
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

  PERFORM pg_advisory_xact_lock(hashtextextended(_normalized_email, 0));
  SELECT id, created_at INTO _waitlist_id, _created_at
  FROM public.waitlist
  WHERE lower(email) = _normalized_email
  ORDER BY created_at ASC
  LIMIT 1;

  IF _waitlist_id IS NULL THEN
    INSERT INTO public.waitlist
      (email, source, name, writing_about, writing_language, has_own_openai_key,
       ui_language, project_type, project_detail)
    VALUES
      (
        _normalized_email,
        left(NULLIF(btrim(_source), ''), 100),
        left(NULLIF(btrim(_name), ''), 200),
        left(NULLIF(btrim(_writing_about), ''), 2000),
        left(NULLIF(btrim(_writing_language), ''), 100),
        COALESCE(_has_own_openai_key, false),
        CASE WHEN _ui_language IN ('en', 'pt-BR') THEN _ui_language END,
        left(NULLIF(btrim(_project_type), ''), 100),
        left(NULLIF(btrim(_project_detail), ''), 200)
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

REVOKE ALL ON FUNCTION public.register_waitlist_submission(text, text, text, text, text, boolean, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_waitlist_submission(text, text, text, text, text, boolean, text, text, text, text)
  TO service_role;

-- AI-written replies on the public waitlist page: at most _max_visitors
-- distinct (hashed) addresses per calendar month, and _max_replies_per_visitor
-- replies each. Raw IP addresses are never stored.
CREATE TABLE IF NOT EXISTS public.waitlist_ai_reply_usage (
  period_start date NOT NULL,
  ip_hash text NOT NULL,
  reply_count integer NOT NULL DEFAULT 1 CHECK (reply_count > 0),
  PRIMARY KEY (period_start, ip_hash)
);

ALTER TABLE public.waitlist_ai_reply_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.waitlist_ai_reply_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.waitlist_ai_reply_usage TO service_role;

CREATE OR REPLACE FUNCTION public.claim_waitlist_ai_reply(
  _ip_hash text,
  _max_visitors integer,
  _max_replies_per_visitor integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period date := date_trunc('month', now())::date;
  _replies integer;
  _visitors integer;
BEGIN
  IF auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF _ip_hash IS NULL OR length(_ip_hash) NOT BETWEEN 16 AND 128 THEN
    RETURN false;
  END IF;

  -- Serialize claims within the month so concurrent first-time visitors
  -- cannot push the distinct-visitor count past the cap.
  PERFORM pg_advisory_xact_lock(hashtextextended('waitlist_ai_reply:' || _period::text, 0));

  SELECT reply_count INTO _replies
  FROM public.waitlist_ai_reply_usage
  WHERE period_start = _period AND ip_hash = _ip_hash;

  IF _replies IS NULL THEN
    SELECT count(*) INTO _visitors
    FROM public.waitlist_ai_reply_usage
    WHERE period_start = _period;
    IF _visitors >= _max_visitors THEN
      RETURN false;
    END IF;

    -- Hashes are only needed for the current month's budget.
    DELETE FROM public.waitlist_ai_reply_usage WHERE period_start < _period;

    INSERT INTO public.waitlist_ai_reply_usage (period_start, ip_hash, reply_count)
    VALUES (_period, _ip_hash, 1);
    RETURN true;
  END IF;

  IF _replies >= _max_replies_per_visitor THEN
    RETURN false;
  END IF;

  UPDATE public.waitlist_ai_reply_usage
  SET reply_count = reply_count + 1
  WHERE period_start = _period AND ip_hash = _ip_hash;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_waitlist_ai_reply(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_ai_reply(text, integer, integer)
  TO service_role;

-- The interface language chosen in the waitlist chat becomes the account's
-- interface and story language. Rows from the older form have no ui_language,
-- so they keep the previous inference from writing_language.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wl_lang text;
  _wl_name text;
  _wl_ui text;
  _name text;
  _pref text := 'en';
BEGIN
  BEGIN
    SELECT writing_language, name, ui_language INTO _wl_lang, _wl_name, _wl_ui
    FROM public.waitlist WHERE lower(email) = lower(NEW.email) LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _wl_lang := NULL; _wl_name := NULL; _wl_ui := NULL;
  END;

  IF _wl_ui IN ('en', 'pt-BR') THEN
    _pref := _wl_ui;
  ELSIF _wl_lang IS NOT NULL AND (lower(_wl_lang) LIKE 'pt%' OR lower(_wl_lang) LIKE '%portug%') THEN
    _pref := 'pt-BR';
  END IF;

  _name := NULLIF(btrim(coalesce(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    _wl_name,
    ''
  )), '');

  INSERT INTO public.profiles (user_id, preferred_language, display_name) VALUES (NEW.id, _pref, _name);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'draft');
  PERFORM public.ensure_user_credits(NEW.id);
  PERFORM public.seed_new_user_from_template(NEW.id);

  IF _pref = 'pt-BR' THEN
    UPDATE public.projects SET ai_language = 'pt-BR' WHERE user_id = NEW.id;
  END IF;

  BEGIN
    DELETE FROM public.waitlist WHERE lower(email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;
