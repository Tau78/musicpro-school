-- MusicPro School — Fase 2: integrazione crediti prenotazione + penali cancellazione

-- ---------------------------------------------------------------------------
-- cancellation_penalty_rules — fasce penale configurabili (admin/segreteria)
-- ---------------------------------------------------------------------------
CREATE TABLE public.cancellation_penalty_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_hours       INTEGER NOT NULL,
  to_hours         INTEGER NOT NULL,
  penalty_percent  INTEGER NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cancellation_penalty_rules_hours_order
    CHECK (from_hours > to_hours),
  CONSTRAINT cancellation_penalty_rules_to_hours_non_negative
    CHECK (to_hours >= 0),
  CONSTRAINT cancellation_penalty_rules_penalty_percent_range
    CHECK (penalty_percent >= 0 AND penalty_percent <= 100)
);

COMMENT ON TABLE public.cancellation_penalty_rules IS
  'Fasce penale cancellazione: lead_time in (to_hours, from_hours] → penalty_percent.';

COMMENT ON COLUMN public.cancellation_penalty_rules.from_hours IS
  'Limite superiore fascia (es. 24 = fino a 24h prima).';

COMMENT ON COLUMN public.cancellation_penalty_rules.to_hours IS
  'Limite inferiore fascia escluso (es. 12 = oltre 12h prima).';

CREATE INDEX idx_cancellation_penalty_rules_enabled_sort
  ON public.cancellation_penalty_rules (enabled, sort_order, from_hours DESC);

CREATE TRIGGER trg_cancellation_penalty_rules_updated_at
  BEFORE UPDATE ON public.cancellation_penalty_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cancellation_penalty_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cancellation_penalty_rules_select_staff"
  ON public.cancellation_penalty_rules FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "cancellation_penalty_rules_manage_staff"
  ON public.cancellation_penalty_rules FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.cancellation_penalty_rules TO authenticated;

INSERT INTO public.cancellation_penalty_rules (
  from_hours,
  to_hours,
  penalty_percent,
  enabled,
  sort_order
)
VALUES
  (24, 12, 50, true, 1),
  (12, 6, 75, true, 2),
  (6, 0, 100, true, 3);

-- ---------------------------------------------------------------------------
-- release_booking_credits_internal — rilascio hold senza auth (RPC interne)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_booking_credits_internal(
  p_booking_id UUID,
  p_created_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_credits INTEGER;
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

  v_credits := v_booking.credits_held;

  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'credits_released', 0,
      'message', 'Nessun hold da rilasciare.'
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
    v_credits,
    'release'::public.credit_transaction_type,
    p_booking_id,
    COALESCE(
      p_reason,
      format('Release hold prenotazione %s', p_booking_id)
    ),
    p_created_by
  );

  UPDATE public.bookings
  SET credits_held = 0
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_released', v_credits,
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_booking_credits_internal(UUID, UUID, TEXT) FROM PUBLIC;

COMMENT ON FUNCTION public.release_booking_credits_internal IS
  'Rilascia hold crediti senza controllo auth. Usato da review_booking_safe e cancel_booking_safe.';

-- ---------------------------------------------------------------------------
-- release_booking_credits — wrapper autenticato
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_booking_credits(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT member_id INTO v_booking.member_id
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi gestire i crediti di questa prenotazione.'
    );
  END IF;

  RETURN public.release_booking_credits_internal(
    p_booking_id,
    v_current_member,
    format('Release hold prenotazione %s', p_booking_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- apply_cancellation_penalty_credits — penale + rimborso residuo
-- ---------------------------------------------------------------------------
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
  v_credits_used INTEGER;
  v_penalty_credits INTEGER;
  v_refund_credits INTEGER;
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

  IF v_booking.payment_method IS DISTINCT FROM 'credits'
     OR v_booking.credits_used IS NULL
     OR v_booking.credits_used <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'booking_id', p_booking_id,
      'message', 'Nessun addebito crediti da rimborsare o penalizzare.'
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
      'booking_id', p_booking_id,
      'message', 'Rimborso crediti gia applicato per questa prenotazione.'
    );
  END IF;

  v_credits_used := v_booking.credits_used;
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
    GREATEST(
      0,
      ROUND(v_credits_used * v_penalty_percent / 100.0)::INTEGER
    )
  );
  v_refund_credits := v_credits_used - v_penalty_credits;

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
      format(
        'Rimborso crediti cancellazione prenotazione %s (%s%% penale)',
        p_booking_id,
        v_penalty_percent
      ),
      p_created_by
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_used', v_credits_used,
    'penalty_percent', v_penalty_percent,
    'penalty_credits', v_penalty_credits,
    'refund_credits', v_refund_credits,
    'lead_hours', ROUND(v_lead_hours, 2),
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_cancellation_penalty_credits(UUID, INTEGER, UUID) FROM PUBLIC;

COMMENT ON FUNCTION public.apply_cancellation_penalty_credits IS
  'Su prenotazione pagata con crediti: calcola penale da regole (o override), registra penale e rimborsa il residuo.';

-- ---------------------------------------------------------------------------
-- review_booking_safe — merge 009 (stripe pending) + crediti (hold/debit/release)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_booking_safe(
  p_booking_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_action TEXT;
  v_new_status public.booking_status;
  v_release_result JSONB;
  v_debit_result JSONB;
  v_requires_payment BOOLEAN;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per gestire le prenotazioni.'
    );
  END IF;

  v_action := lower(trim(p_action));

  IF v_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ACTION',
      'error_message', 'Azione non valida. Usa approve o reject.'
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

  IF v_booking.status <> 'pending_approval'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', 'Solo le prenotazioni in attesa di approvazione possono essere gestite da qui.'
    );
  END IF;

  IF v_action = 'reject' THEN
    IF COALESCE(v_booking.credits_held, 0) > 0 THEN
      v_release_result := public.release_booking_credits_internal(
        p_booking_id,
        v_current_member,
        format('Release hold per rifiuto admin prenotazione %s', p_booking_id)
      );

      IF NOT COALESCE((v_release_result->>'success')::BOOLEAN, false) THEN
        RETURN v_release_result;
      END IF;
    END IF;

    v_new_status := 'cancelled'::public.booking_status;

    UPDATE public.bookings
    SET
      status = v_new_status,
      cancelled_at = now(),
      cancelled_by = v_current_member,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;

    v_requires_payment := false;
  ELSE
    IF COALESCE(v_booking.credits_held, 0) > 0
       AND v_booking.payment_method = 'credits' THEN
      v_debit_result := public.debit_booking_credits(p_booking_id, NULL);

      IF NOT COALESCE((v_debit_result->>'success')::BOOLEAN, false) THEN
        RETURN v_debit_result;
      END IF;

      v_new_status := 'confirmed'::public.booking_status;

      UPDATE public.bookings
      SET
        status = v_new_status,
        payment_status = 'not_required',
        notes = CASE
          WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
          ELSE notes
        END
      WHERE id = p_booking_id;

      v_requires_payment := false;
    ELSE
      v_new_status := 'pending'::public.booking_status;

      UPDATE public.bookings
      SET
        status = v_new_status,
        payment_status = CASE
          WHEN payment_status = 'not_required' THEN payment_status
          ELSE 'unpaid'
        END,
        notes = CASE
          WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
          ELSE notes
        END
      WHERE id = p_booking_id;

      v_requires_payment := (v_new_status = 'pending'::public.booking_status);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', v_new_status::TEXT,
    'action', v_action,
    'requires_payment', v_requires_payment,
    'credits_debited', COALESCE((v_debit_result->>'credits_used')::INTEGER, 0),
    'credits_released', COALESCE((v_release_result->>'credits_released')::INTEGER, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.review_booking_safe IS
  'Admin/segreteria: reject (release hold + cancelled) o approve (debit crediti → confirmed, altrimenti pending/unpaid Stripe).';

GRANT EXECUTE ON FUNCTION public.review_booking_safe(UUID, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_booking_safe — penali crediti + release hold residuo
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_booking_safe(UUID);

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
  v_is_admin BOOLEAN;
  v_is_staff BOOLEAN;
  v_penalty_override INTEGER;
  v_credit_result JSONB;
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

  v_is_admin := public.has_member_role('admin'::public.member_role);
  v_is_staff := public.is_admin_or_segreteria();

  IF v_booking.member_id IS DISTINCT FROM v_current_member AND NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi annullare questa prenotazione.'
    );
  END IF;

  IF NOT v_is_admin THEN
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

  IF v_booking.payment_method = 'credits'
     AND COALESCE(v_booking.credits_used, 0) > 0 THEN
    v_penalty_override := CASE
      WHEN v_is_staff AND p_skip_penalty THEN 0
      ELSE NULL
    END;

    v_credit_result := public.apply_cancellation_penalty_credits(
      p_booking_id,
      v_penalty_override,
      v_current_member
    );

    IF NOT COALESCE((v_credit_result->>'success')::BOOLEAN, false) THEN
      RETURN v_credit_result;
    END IF;
  ELSIF COALESCE(v_booking.credits_held, 0) > 0 THEN
    v_credit_result := public.release_booking_credits_internal(
      p_booking_id,
      v_current_member,
      format('Release hold per cancellazione prenotazione %s', p_booking_id)
    );

    IF NOT COALESCE((v_credit_result->>'success')::BOOLEAN, false) THEN
      RETURN v_credit_result;
    END IF;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    cancelled_by = v_current_member
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'penalty_skipped', (v_is_staff AND p_skip_penalty),
    'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB)
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_booking_safe IS
  'Annullamento associato (con penale crediti) o admin (p_skip_penalty=true salta penale). Release hold se non addebitati.';

GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(UUID, BOOLEAN) TO authenticated;
