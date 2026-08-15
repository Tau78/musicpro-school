-- MusicPro School — Phase 2.4: admin booking edit, audit log, price adjustments

-- ---------------------------------------------------------------------------
-- app_settings — minimum lead time for associate self-service modify (admin UI)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'booking_modify_min_hours',
  '24',
  'Hours before start: minimum for associate self-service booking modification'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- booking_audit_log — immutable trail of booking actions
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  actor_member_id  UUID REFERENCES public.members (id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  changes          JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.booking_audit_log IS
  'Audit trail for booking lifecycle actions (review, cancel, admin edit).';

CREATE INDEX idx_booking_audit_log_booking_created
  ON public.booking_audit_log (booking_id, created_at DESC);

CREATE INDEX idx_booking_audit_log_actor
  ON public.booking_audit_log (actor_member_id, created_at DESC)
  WHERE actor_member_id IS NOT NULL;

ALTER TABLE public.booking_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_audit_log_select_staff"
  ON public.booking_audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.booking_audit_log TO authenticated;

-- ---------------------------------------------------------------------------
-- booking_adjustments — admin settlement of price deltas on edit
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  admin_member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  amount_eur        NUMERIC(10, 2) NOT NULL CHECK (amount_eur >= 0),
  direction         TEXT NOT NULL CHECK (direction IN ('increase', 'decrease')),
  settlement_method TEXT NOT NULL CHECK (settlement_method IN ('credits', 'cash', 'original_method')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.booking_adjustments IS
  'Admin-recorded price adjustments when editing a booking (EUR delta + settlement choice).';

CREATE INDEX idx_booking_adjustments_booking_created
  ON public.booking_adjustments (booking_id, created_at DESC);

ALTER TABLE public.booking_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_adjustments_select_staff"
  ON public.booking_adjustments FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.booking_adjustments TO authenticated;

-- ---------------------------------------------------------------------------
-- log_booking_audit — internal helper (SECURITY DEFINER RPCs only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_booking_audit(
  p_booking_id UUID,
  p_actor_member_id UUID,
  p_action TEXT,
  p_changes JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.booking_audit_log (
    booking_id,
    actor_member_id,
    action,
    changes
  )
  VALUES (
    p_booking_id,
    p_actor_member_id,
    p_action,
    COALESCE(p_changes, '{}'::JSONB)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_booking_audit(UUID, UUID, TEXT, JSONB) FROM PUBLIC;

COMMENT ON FUNCTION public.log_booking_audit IS
  'Inserts a booking_audit_log row. Called from SECURITY DEFINER booking RPCs only.';

-- ---------------------------------------------------------------------------
-- admin_update_booking_safe — admin edit with overlap, reprice, settlement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_booking_safe(
  p_booking_id UUID,
  p_room_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_duration_minutes INTEGER,
  p_notes TEXT,
  p_settlement_method TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_room public.rooms%ROWTYPE;
  v_old JSONB;
  v_new JSONB;
  v_price_old NUMERIC(10, 2);
  v_price_new NUMERIC(10, 2);
  v_price_delta NUMERIC(10, 2);
  v_computed_duration INTEGER;
  v_settlement TEXT;
  v_effective_settlement TEXT;
  v_direction TEXT;
  v_old_credit_hours INTEGER;
  v_new_credit_hours INTEGER;
  v_credit_delta INTEGER;
  v_available INTEGER;
  v_adjustment_id UUID;
  v_audit_id UUID;
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
      'error_message', 'Non hai i permessi per modificare le prenotazioni.'
    );
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  v_computed_duration := (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::INTEGER;

  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DURATION',
      'error_message', 'Durata non valida.'
    );
  END IF;

  IF v_computed_duration <> p_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DURATION_MISMATCH',
      'error_message', 'Durata indicata non coerente con inizio e fine.'
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
      'error_code', 'INVALID_STATUS',
      'error_message', 'Non è possibile modificare una prenotazione annullata.'
    );
  END IF;

  SELECT * INTO v_room
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  IF p_duration_minutes < v_room.min_duration_minutes
     OR p_duration_minutes > v_room.max_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DURATION',
      'error_message', format(
        'Durata non valida per questa sala (%s–%s minuti).',
        v_room.min_duration_minutes,
        v_room.max_duration_minutes
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.id <> p_booking_id
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  v_price_old := COALESCE(v_booking.total_price_eur, 0);
  v_price_new := public.booking_price_eur(v_room.hourly_rate_eur, p_duration_minutes);

  IF v_booking.provi_da_solo AND v_room.provi_da_solo_discount_eur > 0 THEN
    v_price_new := GREATEST(0, v_price_new - v_room.provi_da_solo_discount_eur);
  END IF;

  v_price_delta := ROUND((v_price_new - v_price_old)::NUMERIC, 2);

  v_settlement := nullif(lower(trim(coalesce(p_settlement_method, ''))), '');

  IF v_settlement IS NOT NULL
     AND v_settlement NOT IN ('credits', 'cash', 'original_method') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_SETTLEMENT',
      'error_message', 'Metodo di settlement non valido. Usa credits, cash o original_method.'
    );
  END IF;

  IF ABS(v_price_delta) >= 0.01 AND v_settlement IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SETTLEMENT_REQUIRED',
      'error_message', 'Specificare settlement_method per differenze di prezzo.',
      'price_delta', v_price_delta
    );
  END IF;

  v_old := jsonb_build_object(
    'room_id', v_booking.room_id,
    'start_at', v_booking.start_at,
    'end_at', v_booking.end_at,
    'duration_minutes', v_booking.duration_minutes,
    'total_price_eur', v_price_old,
    'notes', v_booking.notes
  );

  v_effective_settlement := CASE v_settlement
    WHEN 'credits' THEN 'credits'
    WHEN 'cash' THEN 'cash'
    WHEN 'original_method' THEN CASE v_booking.payment_method
      WHEN 'credits' THEN 'credits'
      ELSE 'cash'
    END
    ELSE NULL
  END;

  IF ABS(v_price_delta) >= 0.01 AND v_settlement IS NOT NULL THEN
    v_direction := CASE WHEN v_price_delta > 0 THEN 'increase' ELSE 'decrease' END;

    INSERT INTO public.booking_adjustments (
      booking_id,
      admin_member_id,
      amount_eur,
      direction,
      settlement_method,
      notes
    )
    VALUES (
      p_booking_id,
      v_current_member,
      ABS(v_price_delta),
      v_direction,
      v_settlement,
      nullif(trim(coalesce(p_notes, '')), '')
    )
    RETURNING id INTO v_adjustment_id;

    IF v_effective_settlement = 'credits' THEN
      v_old_credit_hours := CEIL(
        COALESCE(v_booking.duration_minutes, 0)::NUMERIC / 60.0
      )::INTEGER;
      v_new_credit_hours := CEIL(p_duration_minutes::NUMERIC / 60.0)::INTEGER;
      v_credit_delta := v_new_credit_hours - v_old_credit_hours;

      IF v_credit_delta <> 0 THEN
        IF COALESCE(v_booking.credits_used, 0) > 0 THEN
          IF v_credit_delta > 0 THEN
            v_available := public.member_credit_available(v_booking.member_id);

            IF v_available < v_credit_delta THEN
              RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INSUFFICIENT_CREDITS',
                'error_message', 'Saldo crediti insufficiente per la maggiorazione.',
                'available', v_available,
                'required', v_credit_delta
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
              -v_credit_delta,
              'debit'::public.credit_transaction_type,
              p_booking_id,
              format(
                'Addebito crediti modifica admin prenotazione %s (+%s h)',
                p_booking_id,
                v_credit_delta
              ),
              v_current_member
            );

            UPDATE public.bookings
            SET credits_used = v_new_credit_hours
            WHERE id = p_booking_id;

            v_booking.credits_used := v_new_credit_hours;
          ELSE
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
              ABS(v_credit_delta),
              'refund'::public.credit_transaction_type,
              p_booking_id,
              format(
                'Rimborso crediti modifica admin prenotazione %s (%s h)',
                p_booking_id,
                ABS(v_credit_delta)
              ),
              v_current_member
            );

            UPDATE public.bookings
            SET credits_used = v_new_credit_hours
            WHERE id = p_booking_id;

            v_booking.credits_used := v_new_credit_hours;
          END IF;
        ELSIF COALESCE(v_booking.credits_held, 0) > 0 THEN
          IF v_credit_delta > 0 THEN
            v_available := public.member_credit_available(v_booking.member_id);

            IF v_available < v_credit_delta THEN
              RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INSUFFICIENT_CREDITS',
                'error_message', 'Saldo crediti insufficiente per aumentare l''hold.',
                'available', v_available,
                'required', v_credit_delta
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
              -v_credit_delta,
              'hold'::public.credit_transaction_type,
              p_booking_id,
              format(
                'Hold aggiuntivo modifica admin prenotazione %s (+%s h)',
                p_booking_id,
                v_credit_delta
              ),
              v_current_member
            );

            UPDATE public.bookings
            SET credits_held = v_new_credit_hours
            WHERE id = p_booking_id;

            v_booking.credits_held := v_new_credit_hours;
          ELSE
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
              ABS(v_credit_delta),
              'release'::public.credit_transaction_type,
              p_booking_id,
              format(
                'Release hold modifica admin prenotazione %s (%s h)',
                p_booking_id,
                ABS(v_credit_delta)
              ),
              v_current_member
            );

            UPDATE public.bookings
            SET credits_held = v_new_credit_hours
            WHERE id = p_booking_id;

            v_booking.credits_held := v_new_credit_hours;
          END IF;
        ELSIF v_credit_delta > 0 THEN
          v_available := public.member_credit_available(v_booking.member_id);

          IF v_available < v_credit_delta THEN
            RETURN jsonb_build_object(
              'success', false,
              'error_code', 'INSUFFICIENT_CREDITS',
              'error_message', 'Saldo crediti insufficiente per la maggiorazione.',
              'available', v_available,
              'required', v_credit_delta
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
            -v_credit_delta,
            'debit'::public.credit_transaction_type,
            p_booking_id,
            format(
              'Addebito crediti modifica admin prenotazione %s (+%s h)',
              p_booking_id,
              v_credit_delta
            ),
            v_current_member
          );

          UPDATE public.bookings
          SET
            credits_used = v_new_credit_hours,
            payment_method = 'credits'
          WHERE id = p_booking_id;
        END IF;
      END IF;
    END IF;
  END IF;

  BEGIN
    UPDATE public.bookings
    SET
      room_id = p_room_id,
      start_at = p_start_at,
      end_at = p_end_at,
      duration_minutes = p_duration_minutes,
      total_price_eur = v_price_new,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;

  v_new := jsonb_build_object(
    'room_id', p_room_id,
    'start_at', p_start_at,
    'end_at', p_end_at,
    'duration_minutes', p_duration_minutes,
    'total_price_eur', v_price_new,
    'notes', CASE
      WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
      ELSE v_booking.notes
    END
  );

  v_audit_id := public.log_booking_audit(
    p_booking_id,
    v_current_member,
    'admin_update',
    jsonb_build_object(
      'old', v_old,
      'new', v_new,
      'price_delta', v_price_delta,
      'settlement_method', v_settlement,
      'adjustment_id', v_adjustment_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'audit_id', v_audit_id,
    'adjustment_id', v_adjustment_id,
    'old', v_old,
    'new', v_new,
    'price_delta', v_price_delta
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_booking_safe IS
  'Admin/segreteria: modifica sala/orari/durata/note, ricalcola prezzo (PROVI DA SOLO), settlement differenza, audit log.';

GRANT EXECUTE ON FUNCTION public.admin_update_booking_safe(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT
) TO authenticated;

-- ---------------------------------------------------------------------------
-- review_booking_safe — add booking_audit_log entries
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
  v_audit_id UUID;
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

  v_audit_id := public.log_booking_audit(
    p_booking_id,
    v_current_member,
    v_action,
    jsonb_build_object(
      'previous_status', v_booking.status::TEXT,
      'new_status', v_new_status::TEXT,
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'credits_debited', COALESCE((v_debit_result->>'credits_used')::INTEGER, 0),
      'credits_released', COALESCE((v_release_result->>'credits_released')::INTEGER, 0)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', v_new_status::TEXT,
    'action', v_action,
    'requires_payment', v_requires_payment,
    'credits_debited', COALESCE((v_debit_result->>'credits_used')::INTEGER, 0),
    'credits_released', COALESCE((v_release_result->>'credits_released')::INTEGER, 0),
    'audit_id', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION public.review_booking_safe IS
  'Admin/segreteria: reject (release hold + cancelled) o approve (debit crediti → confirmed, altrimenti pending/unpaid Stripe). Con audit log.';

GRANT EXECUTE ON FUNCTION public.review_booking_safe(UUID, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_booking_safe — add booking_audit_log entries
-- ---------------------------------------------------------------------------
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
  v_audit_id UUID;
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

  v_audit_id := public.log_booking_audit(
    p_booking_id,
    v_current_member,
    'cancel',
    jsonb_build_object(
      'previous_status', v_booking.status::TEXT,
      'new_status', 'cancelled',
      'penalty_skipped', (v_is_staff AND p_skip_penalty),
      'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'penalty_skipped', (v_is_staff AND p_skip_penalty),
    'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB),
    'audit_id', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_booking_safe IS
  'Annullamento associato (con penale crediti) o admin (p_skip_penalty=true salta penale). Release hold se non addebitati. Con audit log.';

GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(UUID, BOOLEAN) TO authenticated;
