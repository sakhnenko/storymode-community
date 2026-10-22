
-- Credits system
CREATE TABLE public.user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  writing_included INTEGER NOT NULL DEFAULT 20,
  writing_used INTEGER NOT NULL DEFAULT 0,
  writing_purchased INTEGER NOT NULL DEFAULT 0,
  image_included INTEGER NOT NULL DEFAULT 5,
  image_used INTEGER NOT NULL DEFAULT 0,
  image_purchased INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own credits read" ON public.user_credits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin credits read" ON public.user_credits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_user_credits_updated
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('spend','grant','purchase','reset','refund')),
  bucket TEXT NOT NULL CHECK (bucket IN ('writing','image')),
  delta INTEGER NOT NULL,
  reason TEXT,
  actor UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credit_ledger_user_created_idx ON public.credit_ledger (user_id, created_at DESC);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Plan defaults helper
CREATE OR REPLACE FUNCTION public.plan_credit_defaults(_plan TEXT)
RETURNS TABLE(writing INTEGER, image INTEGER)
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT
    CASE _plan WHEN 'studio' THEN 3000 WHEN 'manuscript' THEN 800 ELSE 20 END,
    CASE _plan WHEN 'studio' THEN 400 WHEN 'manuscript' THEN 100 ELSE 5 END
$$;

-- Seed credits row for user
CREATE OR REPLACE FUNCTION public.ensure_user_credits(_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _plan TEXT; _w INTEGER; _i INTEGER;
BEGIN
  SELECT public.get_user_plan(_user_id) INTO _plan;
  SELECT writing, image INTO _w, _i FROM public.plan_credit_defaults(_plan);
  INSERT INTO public.user_credits (user_id, writing_included, image_included)
  VALUES (_user_id, _w, _i)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Reset monthly credits if a new period has started
CREATE OR REPLACE FUNCTION public.apply_credit_period_reset(_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.user_credits; _plan TEXT; _w INTEGER; _i INTEGER; _now_period TIMESTAMPTZ;
BEGIN
  PERFORM public.ensure_user_credits(_user_id);
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  _now_period := date_trunc('month', now());
  IF _row.period_start < _now_period THEN
    SELECT public.get_user_plan(_user_id) INTO _plan;
    SELECT writing, image INTO _w, _i FROM public.plan_credit_defaults(_plan);
    UPDATE public.user_credits SET
      writing_included = _w,
      image_included = _i,
      writing_used = 0,
      image_used = 0,
      period_start = _now_period,
      updated_at = now()
    WHERE user_id = _user_id;
    INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason)
    VALUES (_user_id, 'reset', 'writing', _w, 'monthly_reset'),
           (_user_id, 'reset', 'image', _i, 'monthly_reset');
  END IF;
END;
$$;

-- Spend credits (called from edge functions with SECURITY DEFINER via service role)
CREATE OR REPLACE FUNCTION public.spend_credits(_user_id UUID, _bucket TEXT, _amount INTEGER, _reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.user_credits; _available INTEGER; _from_inc INTEGER; _from_pur INTEGER;
BEGIN
  IF _bucket NOT IN ('writing','image') THEN RAISE EXCEPTION 'bad bucket'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'bad amount'; END IF;
  PERFORM public.apply_credit_period_reset(_user_id);
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  IF _bucket = 'writing' THEN
    _available := (_row.writing_included - _row.writing_used) + _row.writing_purchased;
  ELSE
    _available := (_row.image_included - _row.image_used) + _row.image_purchased;
  END IF;

  IF _available < _amount THEN
    RETURN jsonb_build_object('ok', false, 'available', _available, 'requested', _amount, 'bucket', _bucket);
  END IF;

  IF _bucket = 'writing' THEN
    _from_inc := LEAST(_amount, GREATEST(_row.writing_included - _row.writing_used, 0));
    _from_pur := _amount - _from_inc;
    UPDATE public.user_credits SET
      writing_used = writing_used + _from_inc,
      writing_purchased = writing_purchased - _from_pur,
      updated_at = now()
    WHERE user_id = _user_id;
  ELSE
    _from_inc := LEAST(_amount, GREATEST(_row.image_included - _row.image_used, 0));
    _from_pur := _amount - _from_inc;
    UPDATE public.user_credits SET
      image_used = image_used + _from_inc,
      image_purchased = image_purchased - _from_pur,
      updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason)
  VALUES (_user_id, 'spend', _bucket, -_amount, _reason);

  RETURN jsonb_build_object('ok', true, 'bucket', _bucket, 'spent', _amount);
END;
$$;

-- Grant credits (admin) or record purchase
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id UUID, _bucket TEXT, _amount INTEGER, _kind TEXT, _reason TEXT, _actor UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _bucket NOT IN ('writing','image') THEN RAISE EXCEPTION 'bad bucket'; END IF;
  IF _kind NOT IN ('grant','purchase') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'bad amount'; END IF;
  PERFORM public.ensure_user_credits(_user_id);

  IF _bucket = 'writing' THEN
    UPDATE public.user_credits SET writing_purchased = writing_purchased + _amount, updated_at = now() WHERE user_id = _user_id;
  ELSE
    UPDATE public.user_credits SET image_purchased = image_purchased + _amount, updated_at = now() WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason, actor)
  VALUES (_user_id, _kind, _bucket, _amount, _reason, _actor);
END;
$$;

-- Return current credits summary for calling user
CREATE OR REPLACE FUNCTION public.get_my_credits()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid UUID := auth.uid(); _row public.user_credits;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _row FROM public.user_credits WHERE user_id = _uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'writing', jsonb_build_object('included',0,'used',0,'purchased',0,'remaining',0),
      'image', jsonb_build_object('included',0,'used',0,'purchased',0,'remaining',0),
      'period_start', NULL
    );
  END IF;
  RETURN jsonb_build_object(
    'writing', jsonb_build_object(
      'included', _row.writing_included,
      'used', _row.writing_used,
      'purchased', _row.writing_purchased,
      'remaining', (_row.writing_included - _row.writing_used) + _row.writing_purchased
    ),
    'image', jsonb_build_object(
      'included', _row.image_included,
      'used', _row.image_used,
      'purchased', _row.image_purchased,
      'remaining', (_row.image_included - _row.image_used) + _row.image_purchased
    ),
    'period_start', _row.period_start
  );
END;
$$;

-- Seed on user creation: replace handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  INSERT INTO public.user_plans (user_id, plan) VALUES (NEW.id, 'draft');
  PERFORM public.ensure_user_credits(NEW.id);
  PERFORM public.seed_new_user_from_template(NEW.id);
  BEGIN
    DELETE FROM public.waitlist WHERE lower(email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- Backfill existing users
INSERT INTO public.user_credits (user_id, writing_included, image_included)
SELECT u.id,
  CASE COALESCE(up.plan, 'draft') WHEN 'studio' THEN 3000 WHEN 'manuscript' THEN 800 ELSE 20 END,
  CASE COALESCE(up.plan, 'draft') WHEN 'studio' THEN 400 WHEN 'manuscript' THEN 100 ELSE 5 END
FROM auth.users u
LEFT JOIN public.user_plans up ON up.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;
