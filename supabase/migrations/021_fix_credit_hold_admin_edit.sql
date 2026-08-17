-- Fix credit hold mismatch after admin edit (Fase 2 residual)
-- 1. debit_booking_credits: adjust hold when credits_held <> debit amount
-- 2. admin_update_booking_safe: recalculate credits_held on duration change (pending_approval + credits)

-- ---------------------------------------------------------------------------
-- debit_booking_credits — release old hold + debit new amount on mismatch
-- ---------------------------------------------------------------------------
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
  v_hold_delta INTEGER;
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
      -- Release old hold, then debit new amount (net adjustment via ledger).
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
        format(
          'Release hold per rettifica addebito prenotazione %s (%s → %s crediti)',
          p_booking_id,
          v_booking.credits_held,
          v_debit
        ),
        v_current_member
      );

      v_hold_delta := v_debit - v_booking.credits_held;
      v_available := public.member_credit_available(v_booking.member_id);

      IF v_hold_delta > 0 AND v_available < v_hold_delta THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'INSUFFICIENT_CREDITS',
          'error_message', 'Saldo crediti insufficiente per l''addebito rettificato.',
          'available', v_available,
          'required', v_hold_delta
        );
      END IF;
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
        v_booking.credits_held,
        'release'::public.credit_transaction_type,
        p_booking_id,
        format('Release hold prima addebito prenotazione %s', p_booking_id),
        v_current_member
      );
    END IF;
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
  'Addebito definitivo crediti. Con hold attivo: release+debit atomico; se hold <> debit, rettifica netta via ledger.';

GRANT EXECUTE ON FUNCTION public.debit_booking_credits(UUID, INTEGER) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin_update_booking_safe — always sync credits_held on duration change
-- (pending_approval + payment_method credits), indipendentemente dal settlement
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

  -- Pending approval + credits: sync credits_held to new duration (always).
  IF v_booking.payment_method = 'credits'
     AND v_booking.status = 'pending_approval'::public.booking_status
     AND p_duration_minutes IS DISTINCT FROM v_booking.duration_minutes THEN
    v_new_credit_hours := CEIL(p_duration_minutes::NUMERIC / 60.0)::INTEGER;
    v_old_credit_hours := COALESCE(v_booking.credits_held, 0);
    v_credit_delta := v_new_credit_hours - v_old_credit_hours;

    IF v_credit_delta <> 0 THEN
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
            'Hold aggiuntivo modifica durata prenotazione %s (+%s h)',
            p_booking_id,
            v_credit_delta
          ),
          v_current_member
        );
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
            'Release hold modifica durata prenotazione %s (%s h)',
            p_booking_id,
            ABS(v_credit_delta)
          ),
          v_current_member
        );
      END IF;

      UPDATE public.bookings
      SET credits_held = v_new_credit_hours
      WHERE id = p_booking_id;

      v_booking.credits_held := v_new_credit_hours;
    ELSIF v_old_credit_hours <> v_new_credit_hours THEN
      UPDATE public.bookings
      SET credits_held = v_new_credit_hours
      WHERE id = p_booking_id;

      v_booking.credits_held := v_new_credit_hours;
    END IF;
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
        ELSIF COALESCE(v_booking.credits_held, 0) > 0
              AND NOT (
                v_booking.payment_method = 'credits'
                AND v_booking.status = 'pending_approval'::public.booking_status
              ) THEN
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
  'Admin/segreteria: modifica sala/orari/durata/note, ricalcola prezzo, sync credits_held (pending_approval+credits), settlement differenza, audit log.';

GRANT EXECUTE ON FUNCTION public.admin_update_booking_safe(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT
) TO authenticated;
