-- Fix: ensure single create_booking_safe overload with optional band (booking_band_required).

UPDATE public.app_settings
SET value = 'false'
WHERE key = 'booking_band_required';

DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean);
DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean, UUID);

CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_provi_da_solo boolean DEFAULT false,
  p_band_id UUID DEFAULT NULL
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
  v_payment_status TEXT;
  v_room public.rooms%ROWTYPE;
  v_duration_minutes integer;
  v_price numeric(10, 2);
  v_lead_hours numeric;
  v_auto_hours integer;
  v_approval_hours integer;
  v_is_associato_only boolean;
  v_provi_da_solo boolean := COALESCE(p_provi_da_solo, false);
  v_band_required boolean;
  v_member_snapshot JSONB;
BEGIN
  v_current_member := public.current_member_id();
  v_band_required := public.get_booking_setting_bool('booking_band_required', false);

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

  IF v_provi_da_solo THEN
    IF p_band_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'BAND_REQUIRED',
        'error_message', 'PROVI DA SOLO non può essere associato a una band.'
      );
    END IF;

    IF public.has_member_role('admin'::public.member_role)
       OR public.has_member_role('docente'::public.member_role) THEN
      NULL;
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
  ELSIF p_band_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.band_members bm
      WHERE bm.band_id = p_band_id
        AND bm.member_id = v_current_member
        AND bm.status = 'active'::public.band_member_status
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_BAND_MEMBER',
        'error_message', 'Non sei membro attivo di questa band.'
      );
    END IF;

    IF NOT public.band_all_members_quota_ok(p_band_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'BAND_QUOTA_INCOMPLETE',
        'error_message', 'Non tutti i membri attivi della band hanno la quota in regola.'
      );
    END IF;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'member_id', m.id,
          'first_name', m.first_name,
          'last_name', m.last_name
        )
        ORDER BY m.last_name, m.first_name, m.id
      ),
      '[]'::jsonb
    )
    INTO v_member_snapshot
    FROM public.band_members bm
    JOIN public.members m ON m.id = bm.member_id
    WHERE bm.band_id = p_band_id
      AND bm.status = 'active'::public.band_member_status;

    IF NOT (
      public.has_member_role('admin'::public.member_role)
      OR public.has_member_role('docente'::public.member_role)
      OR public.has_member_role('associato'::public.member_role)
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_AUTHORIZED',
        'error_message', 'Non hai i permessi per prenotare le sale prova.'
      );
    END IF;
  ELSIF v_band_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BAND_REQUIRED',
      'error_message', 'Seleziona una band per questa prenotazione.'
    );
  ELSE
    IF public.has_member_role('admin'::public.member_role)
       OR public.has_member_role('docente'::public.member_role) THEN
      NULL;
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

    v_member_snapshot := NULL;
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
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

  v_duration_minutes := (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer;

  IF v_duration_minutes < v_room.min_duration_minutes
     OR v_duration_minutes > v_room.max_duration_minutes THEN
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

  IF v_provi_da_solo THEN
    IF NOT v_room.provi_da_solo_enabled THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_AUTHORIZED',
        'error_message', 'PROVI DA SOLO non è disponibile per questa sala.'
      );
    END IF;

    IF NOT public.slot_in_provi_schedule(p_room_id, p_start_at, p_end_at) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_TIME',
        'error_message', 'Lo slot selezionato non rientra negli orari PROVI DA SOLO.'
      );
    END IF;
  END IF;

  v_auto_hours := public.get_booking_setting_int('booking_auto_confirm_min_hours', 12);
  v_approval_hours := public.get_booking_setting_int('booking_approval_min_hours', 6);
  v_lead_hours := public.booking_lead_time_hours(p_start_at);

  v_is_associato_only :=
    public.has_member_role('associato'::public.member_role)
    AND NOT public.has_member_role('admin'::public.member_role)
    AND NOT public.has_member_role('docente'::public.member_role);

  IF v_is_associato_only AND v_lead_hours < v_approval_hours THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOO_LATE',
      'error_message', format(
        'Non è possibile prenotare a meno di %s ore dall''inizio.',
        v_approval_hours
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  v_price := public.booking_price_eur(v_room.hourly_rate_eur, v_duration_minutes);

  IF v_provi_da_solo AND v_room.provi_da_solo_discount_eur > 0 THEN
    v_price := GREATEST(0, v_price - v_room.provi_da_solo_discount_eur);
  END IF;

  IF v_is_associato_only THEN
    v_payment_status := 'unpaid';
    IF v_lead_hours >= v_auto_hours THEN
      v_status := 'pending'::public.booking_status;
    ELSE
      v_status := 'pending_approval'::public.booking_status;
    END IF;
  ELSE
    v_status := 'confirmed'::public.booking_status;
    v_payment_status := 'not_required';
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes,
      payment_status,
      provi_da_solo,
      band_id,
      member_snapshot
    )
    VALUES (
      p_room_id,
      p_member_id,
      p_start_at,
      p_end_at,
      v_status,
      v_price,
      v_duration_minutes,
      v_payment_status,
      v_provi_da_solo,
      CASE WHEN v_provi_da_solo THEN NULL ELSE p_band_id END,
      CASE WHEN v_provi_da_solo THEN NULL ELSE v_member_snapshot END
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'status', v_status::TEXT,
      'total_price_eur', v_price,
      'duration_minutes', v_duration_minutes,
      'requires_approval', (v_status = 'pending_approval'::public.booking_status),
      'requires_payment', (v_payment_status = 'unpaid'),
      'provi_da_solo', v_provi_da_solo,
      'band_id', CASE WHEN v_provi_da_solo THEN NULL ELSE p_band_id END
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

GRANT EXECUTE ON FUNCTION public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean, UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
