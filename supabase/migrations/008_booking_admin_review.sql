-- MusicPro School — admin approve/reject pending_approval bookings

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
  WHERE b.id = p_booking_id;

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

  IF v_action = 'approve' THEN
    v_new_status := 'confirmed'::public.booking_status;

    UPDATE public.bookings
    SET
      status = v_new_status,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;
  ELSE
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', v_new_status::TEXT,
    'action', v_action
  );
END;
$$;

COMMENT ON FUNCTION public.review_booking_safe IS
  'Admin/segreteria: approve (confirmed) or reject (cancelled) a pending_approval booking.';

GRANT EXECUTE ON FUNCTION public.review_booking_safe(UUID, TEXT, TEXT)
  TO authenticated;

-- Segreteria may update bookings (was admin-only)
DROP POLICY IF EXISTS "bookings_update_admin" ON public.bookings;
CREATE POLICY "bookings_update_admin"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
