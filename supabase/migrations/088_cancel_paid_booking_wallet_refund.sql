-- Annullamento sala nei termini: gli euro pagati (Nexi/carta) tornano come crediti
-- sul wallet (1 credito = 1 €), meno l'eventuale penale. Niente rimborso carta.

CREATE OR REPLACE FUNCTION public.apply_cancellation_penalty_credits(
  p_booking_id UUID,
  p_penalty_percent_override INTEGER DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_lead_hours NUMERIC;
  v_penalty_percent INTEGER;
  v_credits_used NUMERIC(12, 2);
  v_penalty_credits NUMERIC(12, 2);
  v_refund_credits NUMERIC(12, 2);
  v_source TEXT;
  v_card_refunded INTEGER;
BEGIN
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

  IF EXISTS (
    SELECT 1
    FROM public.credit_transactions ct
    WHERE ct.booking_id = p_booking_id
      AND ct.type = 'refund'::public.credit_transaction_type
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'wallet_refund', true,
      'booking_id', p_booking_id,
      'message', 'Rimborso crediti gia applicato per questa prenotazione.'
    );
  END IF;

  IF v_booking.payment_method = 'credits'
     AND COALESCE(v_booking.credits_used, 0) > 0 THEN
    v_source := 'credits';
    v_credits_used := v_booking.credits_used;
  ELSIF v_booking.payment_status IN ('paid', 'refunded')
        AND COALESCE(v_booking.credits_used, 0) = 0
        AND COALESCE(v_booking.total_price_eur, 0) > 0
        AND (
          v_booking.payment_method IN ('stripe', 'nexi')
          OR nullif(trim(coalesce(v_booking.stripe_payment_intent_id, '')), '') IS NOT NULL
        ) THEN
    SELECT COALESCE(SUM(r.amount_cents), 0)::INTEGER
    INTO v_card_refunded
    FROM public.stripe_room_booking_refunds r
    WHERE r.booking_id = p_booking_id
      AND r.stripe_refund_id IS NOT NULL;

    IF v_card_refunded > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'skipped', true,
        'wallet_refund', false,
        'booking_id', p_booking_id,
        'message', 'Rimborso carta gia registrato; nessun accredito crediti.'
      );
    END IF;

    v_source := 'paid_eur';
    v_credits_used := ROUND(v_booking.total_price_eur, 2);
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'wallet_refund', false,
      'booking_id', p_booking_id,
      'message', 'Nessun addebito da rimborsare o penalizzare.'
    );
  END IF;

  v_lead_hours := public.booking_lead_time_hours(v_booking.start_at);

  IF p_penalty_percent_override IS NOT NULL THEN
    v_penalty_percent := GREATEST(0, LEAST(100, p_penalty_percent_override));
  ELSE
    SELECT r.penalty_percent
    INTO v_penalty_percent
    FROM public.cancellation_penalty_rules r
    WHERE r.enabled = true
      AND v_lead_hours <= r.from_hours
      AND v_lead_hours > r.to_hours
    ORDER BY r.sort_order, r.from_hours DESC
    LIMIT 1;

    v_penalty_percent := COALESCE(v_penalty_percent, 0);
  END IF;

  v_penalty_credits := LEAST(
    v_credits_used,
    GREATEST(0, ROUND(v_credits_used * v_penalty_percent / 100.0, 2))
  );
  v_refund_credits := ROUND(v_credits_used - v_penalty_credits, 2);

  IF v_penalty_credits > 0 THEN
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
      0,
      'penalty'::public.credit_transaction_type,
      p_booking_id,
      format(
        'Penale cancellazione %s%% (%s h prima): %s crediti trattenuti',
        v_penalty_percent,
        ROUND(v_lead_hours, 1),
        v_penalty_credits
      ),
      p_created_by
    );
  END IF;

  IF v_refund_credits > 0 THEN
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
      v_refund_credits,
      'refund'::public.credit_transaction_type,
      p_booking_id,
      CASE
        WHEN v_source = 'paid_eur' THEN format(
          'Riaccredito %s € pagati in crediti (cancellazione prenotazione %s, %s%% penale)',
          v_refund_credits,
          p_booking_id,
          v_penalty_percent
        )
        ELSE format(
          'Rimborso crediti cancellazione prenotazione %s (%s%% penale)',
          p_booking_id,
          v_penalty_percent
        )
      END,
      p_created_by
    );
  END IF;

  IF v_source = 'paid_eur' THEN
    UPDATE public.bookings
    SET payment_status = 'refunded'
    WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_used', v_credits_used,
    'penalty_percent', v_penalty_percent,
    'penalty_credits', v_penalty_credits,
    'refund_credits', v_refund_credits,
    'lead_hours', ROUND(v_lead_hours, 2),
    'available_after', public.member_credit_available(v_booking.member_id),
    'wallet_refund', true,
    'refund_source', v_source,
    'penalty_applied', (v_penalty_credits > 0)
  );
END;
$$;

COMMENT ON FUNCTION public.apply_cancellation_penalty_credits IS
  'Cancellazione: rimborsa crediti usati, oppure converte gli euro pagati (Nexi/carta) in crediti, meno la penale.';

REVOKE ALL ON FUNCTION public.apply_cancellation_penalty_credits(UUID, INTEGER, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cancel_booking_safe(
  p_booking_id UUID,
  p_skip_penalty BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_cancel_hours INTEGER;
  v_lead_hours NUMERIC;
  v_is_staff BOOLEAN;
  v_penalty_override INTEGER;
  v_credit_result JSONB;
  v_audit_id UUID;
  v_stripe_plan JSONB;
  v_wallet_refund BOOLEAN;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
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

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CANCELLED',
      'error_message', 'Prenotazione già annullata.'
    );
  END IF;

  v_is_staff := public.is_admin_or_segreteria();

  IF v_booking.member_id IS DISTINCT FROM v_current_member AND NOT v_is_staff THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi annullare questa prenotazione.'
    );
  END IF;

  IF NOT v_is_staff THEN
    v_cancel_hours := public.get_booking_setting_int('booking_cancel_min_hours', 24);
    v_lead_hours := public.booking_lead_time_hours(v_booking.start_at);

    IF v_lead_hours < v_cancel_hours THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'CANCEL_TOO_LATE',
        'error_message', format(
          'Annullamento non consentito a meno di %s ore dall''inizio. Contatta la segreteria.',
          v_cancel_hours
        )
      );
    END IF;
  END IF;

  v_penalty_override := CASE
    WHEN v_is_staff AND p_skip_penalty THEN 0
    ELSE NULL
  END;

  v_credit_result := NULL;

  IF (
        v_booking.payment_method = 'credits'
        AND COALESCE(v_booking.credits_used, 0) > 0
      )
      OR COALESCE(v_booking.credits_held, 0) > 0
      OR (
        v_booking.payment_status IN ('paid', 'refunded')
        AND COALESCE(v_booking.credits_used, 0) = 0
        AND COALESCE(v_booking.total_price_eur, 0) > 0
        AND (
          v_booking.payment_method IN ('stripe', 'nexi')
          OR nullif(trim(coalesce(v_booking.stripe_payment_intent_id, '')), '') IS NOT NULL
        )
      )
  THEN
    IF COALESCE(v_booking.credits_held, 0) > 0
       AND NOT (
         v_booking.payment_method = 'credits'
         AND COALESCE(v_booking.credits_used, 0) > 0
       )
       AND v_booking.payment_status IS DISTINCT FROM 'paid'
       AND v_booking.payment_status IS DISTINCT FROM 'refunded'
    THEN
      v_credit_result := public.release_booking_credits_internal(
        p_booking_id,
        v_current_member,
        format('Release hold per cancellazione prenotazione %s', p_booking_id)
      );
    ELSE
      v_credit_result := public.apply_cancellation_penalty_credits(
        p_booking_id,
        v_penalty_override,
        v_current_member
      );
    END IF;

    IF NOT COALESCE((v_credit_result->>'success')::BOOLEAN, false) THEN
      RETURN v_credit_result;
    END IF;
  END IF;

  v_wallet_refund := COALESCE((v_credit_result->>'wallet_refund')::BOOLEAN, false)
    AND COALESCE((v_credit_result->>'refund_source'), '') = 'paid_eur';

  IF v_wallet_refund THEN
    v_stripe_plan := jsonb_build_object(
      'needed', false,
      'wallet_credits', true
    );
  ELSE
    v_stripe_plan := public.booking_stripe_refund_plan(
      p_booking_id,
      (v_is_staff AND p_skip_penalty)
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    cancelled_by = v_current_member
  WHERE id = p_booking_id;

  v_audit_id := public.log_booking_audit(
    p_booking_id,
    v_current_member,
    'cancel',
    jsonb_build_object(
      'previous_status', v_booking.status::TEXT,
      'new_status', 'cancelled',
      'penalty_skipped', (v_is_staff AND p_skip_penalty),
      'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB),
      'stripe_refund', COALESCE(v_stripe_plan, '{}'::JSONB)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'penalty_skipped', (v_is_staff AND p_skip_penalty),
    'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB),
    'credits_penalty', (v_credit_result->>'penalty_credits')::NUMERIC,
    'penalty_percent', (v_credit_result->>'penalty_percent')::INTEGER,
    'credits_refunded', (v_credit_result->>'refund_credits')::NUMERIC,
    'penalty_applied', COALESCE((v_credit_result->>'penalty_applied')::BOOLEAN, false),
    'stripe_refund', COALESCE(v_stripe_plan, '{}'::JSONB),
    'audit_id', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_booking_safe IS
  'Annullamento: penale crediti, riaccredito euro pagati sul wallet, piano rimborso carta solo se gli euro non sono già crediti.';

GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
