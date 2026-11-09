-- Approvazione prenotazione: i crediti sala sono NUMERIC(12,2) (1 credito = 1 euro).
-- debit_booking_credits restituisce credits_used come numero JSON "8.00".
-- review_booking_safe (016, non toccata da 084) faceva ->>::INTEGER e Postgres
-- rifiuta il testo "8.00". La firma resta (uuid, text, text).
-- Il controllo staff resta is_front_desk(), come patchato in 103.

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

  IF NOT public.is_front_desk() THEN
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
      'credits_debited', COALESCE((v_debit_result->>'credits_used')::NUMERIC(12,2), 0),
      'credits_released', COALESCE((v_release_result->>'credits_released')::NUMERIC(12,2), 0)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', v_new_status::TEXT,
    'action', v_action,
    'requires_payment', v_requires_payment,
    'credits_debited', COALESCE((v_debit_result->>'credits_used')::NUMERIC(12,2), 0),
    'credits_released', COALESCE((v_release_result->>'credits_released')::NUMERIC(12,2), 0),
    'audit_id', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION public.review_booking_safe(UUID, TEXT, TEXT) IS
  'Admin/segreteria/collaboratore: reject (release hold + cancelled) o approve (debit crediti NUMERIC(12,2) → confirmed, altrimenti pending/unpaid). Con audit log.';

GRANT EXECUTE ON FUNCTION public.review_booking_safe(UUID, TEXT, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
