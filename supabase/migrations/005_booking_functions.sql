-- MusicPro School — safe booking creation with quota checks and friendly errors
-- Complements RLS on public.bookings (002_rls_policies.sql)

-- ---------------------------------------------------------------------------
-- create_booking_safe — atomic insert with authorization + UNIQUE handling
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking_id UUID;
  v_status public.booking_status;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso per prenotare.'
    );
  END IF;

  IF p_member_id IS DISTINCT FROM v_current_member
     AND NOT public.has_member_role('admin'::public.member_role) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MEMBER_MISMATCH',
      'error_message', 'Puoi prenotare solo per il tuo account.'
    );
  END IF;

  IF public.has_member_role('admin'::public.member_role)
     OR public.has_member_role('docente'::public.member_role) THEN
    NULL; -- authorized
  ELSIF public.has_member_role('associato'::public.member_role) THEN
    IF NOT public.member_quota_ok(p_member_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QUOTA_NOT_PAID',
        'error_message', 'Devi aver pagato la quota associativa per prenotare le sale.'
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per prenotare le sale prova.'
    );
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = p_room_id
      AND r.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  -- Associati: pending (future Stripe); admin/docente: confirmed without payment
  IF public.has_member_role('associato'::public.member_role)
     AND NOT public.has_member_role('admin'::public.member_role)
     AND NOT public.has_member_role('docente'::public.member_role) THEN
    v_status := 'pending'::public.booking_status;
  ELSE
    v_status := 'confirmed'::public.booking_status;
  END IF;

  BEGIN
    INSERT INTO public.bookings (room_id, member_id, start_at, end_at, status)
    VALUES (p_room_id, p_member_id, p_start_at, p_end_at, v_status)
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'status', v_status::TEXT
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;
END;
$$;

COMMENT ON FUNCTION public.create_booking_safe IS
  'Creates a room booking with quota/role checks. Returns JSON: success, booking_id, status | error_code, error_message. '
  'Error codes: NOT_AUTHENTICATED, MEMBER_MISMATCH, NOT_AUTHORIZED, QUOTA_NOT_PAID, INVALID_TIME, ROOM_NOT_FOUND, SLOT_TAKEN.';

GRANT EXECUTE ON FUNCTION public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- Tighten INSERT policy: callers should prefer create_booking_safe for friendly SLOT_TAKEN errors.
-- Direct INSERT remains allowed for admin tooling; UNIQUE still enforced at DB level.
COMMENT ON POLICY "bookings_insert_eligible" ON public.bookings IS
  'Eligible bookers may insert pending/confirmed bookings for themselves. Prefer create_booking_safe() for slot conflicts.';
