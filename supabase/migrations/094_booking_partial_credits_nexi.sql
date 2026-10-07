-- Pagamento misto sala: hold crediti parziali + carta (Nexi) sul residuo.
-- Alla conferma carta i crediti in hold diventano credits_used.

CREATE OR REPLACE FUNCTION public.hold_booking_credits_toward_payment(
  p_booking_id UUID,
  p_credits NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_available NUMERIC(12, 2);
  v_price NUMERIC(12, 2);
  v_hold NUMERIC(12, 2);
  v_already NUMERIC(12, 2);
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
      'error_message', 'Non puoi riservare crediti su questa prenotazione.'
    );
  END IF;

  IF v_booking.status NOT IN (
    'pending'::public.booking_status,
    'pending_approval'::public.booking_status
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', 'Stato prenotazione non valido per crediti parziali.'
    );
  END IF;

  IF v_booking.payment_status NOT IN ('unpaid', 'link_sent') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_PAID',
      'error_message', 'Questa prenotazione non è più da pagare.'
    );
  END IF;

  v_already := COALESCE(v_booking.credits_held, 0) + COALESCE(v_booking.credits_used, 0);
  IF v_already > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'booking_id', p_booking_id,
      'credits_held', v_booking.credits_held,
      'credits_used', v_booking.credits_used,
      'remaining_eur', GREATEST(
        ROUND(COALESCE(v_booking.total_price_eur, 0) - v_already, 2),
        0
      ),
      'message', 'Crediti già applicati su questa prenotazione.'
    );
  END IF;

  v_price := ROUND(COALESCE(v_booking.total_price_eur, 0), 2);
  IF v_price <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_PRICE',
      'error_message', 'Importo prenotazione non valido.'
    );
  END IF;

  v_available := ROUND(public.member_credit_available(v_booking.member_id), 2);
  IF v_available <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INSUFFICIENT_CREDITS',
      'error_message', 'Nessun credito disponibile.',
      'available', v_available
    );
  END IF;

  v_hold := ROUND(
    LEAST(
      v_available,
      v_price,
      COALESCE(NULLIF(p_credits, 0), v_available)
    ),
    2
  );

  IF v_hold <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_CREDITS',
      'error_message', 'Numero crediti non valido.'
    );
  END IF;

  -- Parziale: non coprire per intero (per quello serve debit_booking_credits).
  IF v_hold >= v_price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'FULL_COVERED',
      'error_message', 'I crediti coprono tutto: usa il pagamento solo con crediti.',
      'available', v_available,
      'required', v_price
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
    -v_hold,
    'hold'::public.credit_transaction_type,
    p_booking_id,
    format('Hold crediti (pagamento misto) prenotazione %s', p_booking_id),
    v_current_member
  );

  UPDATE public.bookings
  SET
    credits_held = v_hold,
    -- non impostare payment_method=credits: il saldo arriverà da carta
    payment_link_url = NULL,
    payment_link_id = NULL,
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_held', v_hold,
    'remaining_eur', ROUND(v_price - v_hold, 2),
    'available_after', public.member_credit_available(v_booking.member_id),
    'status', v_booking.status,
    'payment_status', v_booking.payment_status
  );
END;
$$;

COMMENT ON FUNCTION public.hold_booking_credits_toward_payment(UUID, NUMERIC) IS
  'Riserva crediti parziali verso pagamento carta (Nexi). Non marca la prenotazione come pagata.';

REVOKE ALL ON FUNCTION public.hold_booking_credits_toward_payment(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hold_booking_credits_toward_payment(UUID, NUMERIC)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalize_held_credits_on_booking_payment(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_hold NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Prenotazione non trovata.');
  END IF;

  v_hold := COALESCE(v_booking.credits_held, 0);
  IF v_hold <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'credits_used', COALESCE(v_booking.credits_used, 0)
    );
  END IF;

  -- Release hold contabile + addebito definitivo (stesso schema di debit_booking_credits).
  INSERT INTO public.credit_transactions (
    member_id, amount, type, booking_id, reason, created_by
  )
  VALUES (
    v_booking.member_id,
    v_hold,
    'release'::public.credit_transaction_type,
    p_booking_id,
    format('Release hold dopo pagamento carta prenotazione %s', p_booking_id),
    NULL
  );

  INSERT INTO public.credit_transactions (
    member_id, amount, type, booking_id, reason, created_by
  )
  VALUES (
    v_booking.member_id,
    -v_hold,
    'debit'::public.credit_transaction_type,
    p_booking_id,
    format('Addebito crediti (pagamento misto) prenotazione %s', p_booking_id),
    NULL
  );

  UPDATE public.bookings
  SET
    credits_used = COALESCE(credits_used, 0) + v_hold,
    credits_held = 0,
    updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'credits_used', COALESCE(v_booking.credits_used, 0) + v_hold,
    'credits_finalized', v_hold
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_held_credits_on_booking_payment(UUID) IS
  'Converte credits_held in credits_used dopo pagamento carta riuscito.';

REVOKE ALL ON FUNCTION public.finalize_held_credits_on_booking_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_held_credits_on_booking_payment(UUID)
  TO service_role;

-- Dopo apply room via Nexi: finalizza eventuali crediti in hold.
CREATE OR REPLACE FUNCTION public.apply_nexi_payment(
  p_cod_trans text,
  p_cod_aut text DEFAULT NULL,
  p_esito text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cod text := nullif(trim(coalesce(p_cod_trans, '')), '');
  v_esito text := upper(nullif(trim(coalesce(p_esito, '')), ''));
  v_order public.nexi_payment_orders%ROWTYPE;
  v_receipt public.nexi_payment_receipts%ROWTYPE;
  v_event_id text;
  v_inner jsonb;
  v_amount integer;
  v_credit_fin jsonb;
BEGIN
  IF v_cod IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'codTrans mancante.');
  END IF;

  IF v_esito IS DISTINCT FROM 'OK' THEN
    RETURN jsonb_build_object('success', false, 'message', 'esito non OK.', 'esito', v_esito);
  END IF;

  SELECT * INTO v_receipt
  FROM public.nexi_payment_receipts
  WHERE cod_trans = v_cod;

  IF FOUND THEN
    SELECT * INTO v_order FROM public.nexi_payment_orders WHERE id = v_receipt.order_id;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'flow', coalesce(v_order.flow, v_receipt.flow),
      'order_id', v_receipt.order_id,
      'enrollment_id', v_order.enrollment_id,
      'quota_payment_id', v_order.quota_payment_id,
      'booking_id', v_order.booking_id,
      'member_id', v_order.member_id,
      'lesson_pack_payment_id', v_order.lesson_pack_payment_id
    );
  END IF;

  SELECT * INTO v_order
  FROM public.nexi_payment_orders
  WHERE provider_payment_id = v_cod;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordine Nexi non trovato.');
  END IF;

  v_amount := coalesce(p_amount_cents, v_order.amount_cents);
  v_event_id := 'nexi:' || v_cod;

  IF v_order.flow = 'quota_associativa' THEN
    v_inner := public.apply_stripe_quota_payment(
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount,
      'quota_associativa',
      v_order.enrollment_id,
      NULL
    );
  ELSIF v_order.flow = 'quota_multi_pay' THEN
    v_inner := public.apply_stripe_quota_payment(
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount,
      'quota_multi_pay',
      NULL,
      v_order.quota_payment_id
    );
  ELSIF v_order.flow = 'room_booking' THEN
    v_inner := public.apply_stripe_room_booking_payment(
      v_order.booking_id::text,
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount
    );
  ELSIF v_order.flow = 'shop_credit_package' THEN
    v_inner := public.apply_stripe_credit_shop_payment(
      v_order.member_id::text,
      v_order.package_id,
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount
    );
  ELSIF v_order.flow = 'lesson_pack' THEN
    v_inner := public.apply_stripe_lesson_pack_payment(
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount,
      v_order.lesson_pack_payment_id
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Flusso pagamento sconosciuto.');
  END IF;

  IF coalesce(v_inner->>'success', 'false') <> 'true' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', coalesce(v_inner->>'message', 'Applicazione pagamento fallita.'),
      'flow', v_order.flow,
      'inner', v_inner
    );
  END IF;

  INSERT INTO public.nexi_payment_receipts (cod_trans, order_id, flow, esito, importo, cod_aut)
  VALUES (
    v_cod,
    v_order.id,
    v_order.flow,
    v_esito,
    v_amount,
    nullif(trim(coalesce(p_cod_aut, '')), '')
  );

  UPDATE public.nexi_payment_orders
  SET
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'paid_amount_cents', v_amount,
      'cod_aut', nullif(trim(coalesce(p_cod_aut, '')), '')
    )
  WHERE id = v_order.id;

  IF v_order.flow = 'room_booking' AND v_order.booking_id IS NOT NULL THEN
    -- Pezzo carta: sempre nexi (anche con crediti in hold sul misto).
    UPDATE public.bookings
    SET payment_method = 'nexi'
    WHERE id = v_order.booking_id;

    v_credit_fin := public.finalize_held_credits_on_booking_payment(v_order.booking_id);
  END IF;

  IF v_order.flow = 'lesson_pack' AND v_order.lesson_pack_payment_id IS NOT NULL THEN
    UPDATE public.lesson_pack_payments
    SET method = 'nexi'
    WHERE id = v_order.lesson_pack_payment_id
      AND method = 'stripe';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', coalesce((v_inner->>'duplicate')::boolean, false),
    'flow', v_order.flow,
    'order_id', v_order.id,
    'enrollment_id', v_order.enrollment_id,
    'quota_payment_id', v_order.quota_payment_id,
    'booking_id', coalesce(v_order.booking_id, (v_inner->>'booking_id')::uuid),
    'member_id', v_order.member_id,
    'lesson_pack_payment_id', v_order.lesson_pack_payment_id,
    'credits_finalized', v_credit_fin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_nexi_payment(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_nexi_payment(text, text, text, integer) TO service_role;
