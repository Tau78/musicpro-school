-- Pagamento crediti su prenotazione pending: conferma lo slot
-- (allinea debit_booking_credits a review_booking_safe su hold→approve).

CREATE OR REPLACE FUNCTION public.debit_booking_credits(
  p_booking_id UUID,
  p_credits INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_debit INTEGER;
  v_available INTEGER;
  v_new_status public.booking_status;
  v_new_payment TEXT;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL
     AND current_setting('role', true) <> 'service_role' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_current_member IS NOT NULL
     AND v_booking.member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi addebitare crediti su questa prenotazione.'
    );
  END IF;

  v_debit := COALESCE(
    p_credits,
    v_booking.credits_held,
    v_booking.credits_used,
    CEIL(v_booking.duration_minutes::NUMERIC / 60)::INTEGER
  );

  IF v_debit IS NULL OR v_debit <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_CREDITS',
      'error_message', 'Numero crediti da addebitare non valido.'
    );
  END IF;

  IF v_booking.credits_used IS NOT NULL AND v_booking.credits_used > 0 THEN
    IF v_booking.status = 'pending'::public.booking_status THEN
      UPDATE public.bookings
      SET
        status = 'confirmed'::public.booking_status,
        payment_status = 'not_required',
        payment_method = COALESCE(payment_method, 'credits')
      WHERE id = p_booking_id;

      v_booking.status := 'confirmed'::public.booking_status;
      v_booking.payment_status := 'not_required';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'booking_id', p_booking_id,
      'credits_used', v_booking.credits_used,
      'status', v_booking.status,
      'payment_status', v_booking.payment_status,
      'message', 'Crediti gia addebitati su questa prenotazione.'
    );
  END IF;

  IF v_booking.credits_held > 0 THEN
    IF v_booking.credits_held <> v_debit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'HOLD_MISMATCH',
        'error_message', 'Importo addebito diverso dai crediti in hold.',
        'credits_held', v_booking.credits_held,
        'requested_debit', v_debit
      );
    END IF;

    INSERT INTO public.credit_transactions (
      member_id,
      amount,
      type,
      booking_id,
      reason,
      created_by
    )
    VALUES (
      v_booking.member_id,
      v_booking.credits_held,
      'release'::public.credit_transaction_type,
      p_booking_id,
      format('Release hold prima addebito prenotazione %s', p_booking_id),
      v_current_member
    );
  ELSE
    v_available := public.member_credit_available(v_booking.member_id);

    IF v_available < v_debit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INSUFFICIENT_CREDITS',
        'error_message', 'Saldo crediti insufficiente.',
        'available', v_available,
        'required', v_debit
      );
    END IF;
  END IF;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    booking_id,
    reason,
    created_by
  )
  VALUES (
    v_booking.member_id,
    -v_debit,
    'debit'::public.credit_transaction_type,
    p_booking_id,
    format('Addebito crediti prenotazione %s', p_booking_id),
    v_current_member
  );

  v_new_status := CASE
    WHEN v_booking.status = 'pending'::public.booking_status
      THEN 'confirmed'::public.booking_status
    ELSE v_booking.status
  END;

  v_new_payment := CASE
    WHEN v_booking.status IN (
      'pending'::public.booking_status,
      'confirmed'::public.booking_status
    ) THEN 'not_required'
    ELSE v_booking.payment_status
  END;

  UPDATE public.bookings
  SET
    credits_used = v_debit,
    credits_held = 0,
    payment_method = 'credits',
    status = v_new_status,
    payment_status = v_new_payment
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_used', v_debit,
    'status', v_new_status,
    'payment_status', v_new_payment,
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

COMMENT ON FUNCTION public.debit_booking_credits IS
  'Addebito definitivo crediti. Su booking pending: status=confirmed e payment_status=not_required.';

GRANT EXECUTE ON FUNCTION public.debit_booking_credits(UUID, INTEGER) TO authenticated, service_role;
