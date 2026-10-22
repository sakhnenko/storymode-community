-- Who can create an account on a self-hosted install. Self-hosted sign-up is
-- open and its AI isn't metered, so without this anyone who found an
-- install's address could sign up and spend its owner's AI credit.
--
-- One row: sign-ups open to everyone, or closed to all but the addresses the
-- admin has added. The very first account (the admin) is always allowed.
-- Without a row nothing is enforced: that's the hosted app, whose accounts
-- come from waitlist invites. The community edition adds the row, closed.

CREATE TABLE IF NOT EXISTS public.signup_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  open boolean NOT NULL DEFAULT false,
  allowed_emails text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.signup_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_settings FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.signup_settings TO authenticated;

CREATE POLICY "Admins read sign-up settings" ON public.signup_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update sign-up settings" ON public.signup_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Whether this address may create an account now. Callable before signing in,
-- so the sign-up form can say sign-ups are closed instead of failing.
CREATE OR REPLACE FUNCTION public.signup_allowed(_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.signup_settings;
BEGIN
  SELECT * INTO _settings FROM public.signup_settings WHERE singleton;
  IF NOT FOUND OR _settings.open THEN
    RETURN true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(_settings.allowed_emails) AS allowed
    WHERE lower(btrim(allowed)) = lower(btrim(coalesce(_email, '')))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_allowed(text) TO anon, authenticated, service_role;

-- Every new account goes through this, whether from the sign-up form or
-- Supabase's dashboard: add the address in Admin → Sign-ups first.
CREATE OR REPLACE FUNCTION public.enforce_signup_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- So two first sign-ups at once can't both count as the first.
  PERFORM pg_advisory_xact_lock(hashtextextended('signup_settings', 0));
  IF NOT public.signup_allowed(NEW.email) THEN
    RAISE EXCEPTION 'Sign-ups are closed on this StoryMode'
      USING ERRCODE = 'P0001', HINT = 'An admin can add this address in Admin → Sign-ups.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_signup_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_signup_settings ON auth.users;
CREATE TRIGGER enforce_signup_settings
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signup_settings();

NOTIFY pgrst, 'reload schema';
