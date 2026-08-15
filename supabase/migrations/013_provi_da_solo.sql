-- MusicPro School — PROVI DA SOLO (Phase 2 basics)

-- ---------------------------------------------------------------------------
-- rooms — PROVI DA SOLO flag and discount
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS provi_da_solo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provi_da_solo_discount_eur numeric(10, 2) NOT NULL DEFAULT 0
    CHECK (provi_da_solo_discount_eur >= 0);

COMMENT ON COLUMN public.rooms.provi_da_solo_enabled IS
  'When true, associates may book without a band during configured PROVI DA SOLO hours.';
COMMENT ON COLUMN public.rooms.provi_da_solo_discount_eur IS
  'Fixed euro discount applied when provi_da_solo is selected (e.g. 2.00).';

-- ---------------------------------------------------------------------------
-- bookings — persist PROVI DA SOLO choice
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS provi_da_solo boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- room_provi_da_solo_schedule — weekly windows per room (day 0=Sun … 6=Sat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_provi_da_solo_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  enabled boolean NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, day_of_week, start_minute, end_minute)
);

CREATE INDEX IF NOT EXISTS room_provi_da_solo_schedule_room_id_idx
  ON public.room_provi_da_solo_schedule (room_id);

COMMENT ON TABLE public.room_provi_da_solo_schedule IS
  'Weekly time windows when PROVI DA SOLO is available for a room (Europe/Rome local time).';

-- ---------------------------------------------------------------------------
-- slot_in_provi_schedule — server-side validation helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slot_in_provi_schedule(
  p_room_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_provi_da_solo_schedule s
    WHERE s.room_id = p_room_id
      AND s.enabled = true
      AND s.day_of_week = EXTRACT(DOW FROM p_start_at AT TIME ZONE 'Europe/Rome')::integer
      AND (
        EXTRACT(HOUR FROM p_start_at AT TIME ZONE 'Europe/Rome') * 60
        + EXTRACT(MINUTE FROM p_start_at AT TIME ZONE 'Europe/Rome')
      )::integer >= s.start_minute
      AND (
        EXTRACT(HOUR FROM p_end_at AT TIME ZONE 'Europe/Rome') * 60
        + EXTRACT(MINUTE FROM p_end_at AT TIME ZONE 'Europe/Rome')
      )::integer <= s.end_minute
  );
$$;

COMMENT ON FUNCTION public.slot_in_provi_schedule IS
  'True when booking start/end (Rome local) fall inside an enabled PROVI DA SOLO window.';

-- ---------------------------------------------------------------------------
-- RLS — schedule readable by bookers; managed by admin
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_provi_da_solo_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_provi_schedule_select"
  ON public.room_provi_da_solo_schedule FOR SELECT
  TO authenticated
  USING (public.can_book_rooms() OR public.is_admin_or_segreteria());

CREATE POLICY "room_provi_schedule_manage_admin"
  ON public.room_provi_da_solo_schedule FOR ALL
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role))
  WITH CHECK (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- create_booking_safe — optional p_provi_da_solo + discount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_provi_da_solo boolean DEFAULT false
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
      provi_da_solo
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
      v_provi_da_solo
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
      'provi_da_solo', v_provi_da_solo
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

COMMENT ON FUNCTION public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean) IS
  'Creates booking with overlap check, pricing, lead-time, optional PROVI DA SOLO discount.';

GRANT EXECUTE ON FUNCTION public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean)
  TO authenticated;
