-- Community edition: sign-ups start closed. The first account (the admin) can
-- always sign up; after that, only the addresses the admin adds in
-- Admin → Sign-ups, until the admin opens sign-ups to everyone.

INSERT INTO public.signup_settings (singleton, open)
VALUES (true, false)
ON CONFLICT (singleton) DO NOTHING;
