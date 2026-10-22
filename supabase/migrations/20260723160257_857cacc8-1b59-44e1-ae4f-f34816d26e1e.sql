
CREATE OR REPLACE FUNCTION public.spend_credits(_user_id UUID, _bucket TEXT, _amount INTEGER, _reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.user_credits;
  _available INTEGER;
  _from_inc INTEGER;
  _from_pur INTEGER;
  _ledger_id UUID;
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
  VALUES (_user_id, 'spend', _bucket, -_amount, _reason)
  RETURNING id INTO _ledger_id;

  RETURN jsonb_build_object('ok', true, 'bucket', _bucket, 'spent', _amount, 'ledger_id', _ledger_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_ai_charge(_ledger_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

  IF _row.bucket = 'writing' THEN
    UPDATE public.user_credits
       SET writing_purchased = writing_purchased + _amount, updated_at = now()
     WHERE user_id = _uid;
  ELSE
    UPDATE public.user_credits
       SET image_purchased = image_purchased + _amount, updated_at = now()
     WHERE user_id = _uid;
  END IF;

  UPDATE public.credit_ledger
     SET metadata = metadata || jsonb_build_object('refunded', true)
   WHERE id = _ledger_id;

  INSERT INTO public.credit_ledger (user_id, kind, bucket, delta, reason, metadata)
  VALUES (_uid, 'refund', _row.bucket, _amount,
          'undo:' || COALESCE(_row.reason, ''),
          jsonb_build_object('refund_of', _ledger_id));

  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'bucket', _row.bucket);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_ai_charge(UUID) TO authenticated;
