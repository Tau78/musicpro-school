-- MusicPro School — room booking config, pricing, lead-time thresholds
-- Requires 006 (pending_approval enum) applied first.

-- ---------------------------------------------------------------------------
-- rooms — pricing and slot config (admin-editable; defaults SuperSaaS-like)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS hourly_rate_eur numeric(10, 2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS slot_granularity_minutes integer NOT NULL DEFAULT 30
    CHECK (slot_granularity_minutes > 0 AND slot_granularity_minutes <= 120),
  ADD COLUMN IF NOT EXISTS default_duration_minutes integer NOT NULL DEFAULT 120
    CHECK (default_duration_minutes > 0),
  ADD COLUMN IF NOT EXISTS min_duration_minutes integer NOT NULL DEFAULT 60
    CHECK (min_duration_minutes > 0),
  ADD COLUMN IF NOT EXISTS max_duration_minutes integer NOT NULL DEFAULT 240
    CHECK (max_duration_minutes >= min_duration_minutes),
  ADD COLUMN IF NOT EXISTS open_hour integer NOT NULL DEFAULT 9
    CHECK (open_hour >= 0 AND open_hour <= 23),
  ADD COLUMN IF NOT EXISTS close_hour integer NOT NULL DEFAULT 22
    CHECK (close_hour >= 1 AND close_hour <= 24 AND close_hour > open_hour);

COMMENT ON COLUMN public.rooms.hourly_rate_eur IS 'Base hourly rate in euros';
COMMENT ON COLUMN public.rooms.slot_granularity_minutes IS 'Slot start increment in minutes (e.g. 30)';
COMMENT ON COLUMN public.rooms.default_duration_minutes IS 'Default booking duration in minutes (e.g. 120 = 2h)';

-- ---------------------------------------------------------------------------
-- bookings — stored price at booking time
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS total_price_eur numeric(10, 2),
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- ---------------------------------------------------------------------------
-- app_settings — lead-time and cancellation thresholds
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'booking_auto_confirm_min_hours',
    '12',
    'Hours before start: auto-confirm band (>= this value)'
  ),
  (
    'booking_approval_min_hours',
    '6',
    'Hours before start: minimum to allow booking with admin approval'
  ),
  (
    'booking_cancel_min_hours',
    '24',
    'Hours before start: minimum for associate self-service cancellation'
  )
ON CONFLICT (key) DO NOTHING;

-- Seed room names/rates (placeholder slugs sala-1..4)
UPDATE public.rooms SET
  name = 'Rossa',
  description = 'Sala prova — tariffa base',
  hourly_rate_eur = 10.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-1';

UPDATE public.rooms SET
  name = 'Verde',
  description = 'Sala prova secondaria',
  hourly_rate_eur = 15.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-2';

UPDATE public.rooms SET
  name = 'Arancio',
  description = 'Sala prova',
  hourly_rate_eur = 15.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-3';

UPDATE public.rooms SET
  name = 'Sala 4',
  hourly_rate_eur = 15.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-4';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (s.value)::integer FROM public.app_settings s WHERE s.key = p_key),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_lead_time_hours(p_start_at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(EPOCH FROM (p_start_at - now())) / 3600.0;
$$;

CREATE OR REPLACE FUNCTION public.booking_price_eur(
  p_hourly_rate numeric,
  p_duration_minutes integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND((p_hourly_rate * (p_duration_minutes::numeric / 60.0))::numeric, 2);
$$;

-- ---------------------------------------------------------------------------
-- create_booking_safe — overlap check, pricing, lead-time
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
  v_room public.rooms%ROWTYPE;
  v_duration_minutes integer;
  v_price numeric(10, 2);
  v_lead_hours numeric;
  v_auto_hours integer;
  v_approval_hours integer;
  v_is_associato_only boolean;
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

  IF v_is_associato_only THEN
    IF v_lead_hours >= v_auto_hours THEN
      v_status := 'pending'::public.booking_status;
    ELSE
      v_status := 'pending_approval'::public.booking_status;
    END IF;
  ELSE
    v_status := 'confirmed'::public.booking_status;
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes
    )
    VALUES (
      p_room_id,
      p_member_id,
      p_start_at,
      p_end_at,
      v_status,
      v_price,
      v_duration_minutes
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'status', v_status::TEXT,
      'total_price_eur', v_price,
      'duration_minutes', v_duration_minutes,
      'requires_approval', (v_status = 'pending_approval'::public.booking_status)
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
  'Creates booking with overlap check, pricing, lead-time. Status: pending (>=12h, pay later), pending_approval (6–12h), confirmed (admin/docente).';

-- ---------------------------------------------------------------------------
-- cancel_booking_safe — associate cancellation with lead-time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_safe(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_cancel_hours integer;
  v_lead_hours numeric;
  v_is_admin boolean;
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
  WHERE b.id = p_booking_id;

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

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    cancelled_by = v_current_member
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(UUID) TO authenticated;

-- Allow pending_approval in insert policy
DROP POLICY IF EXISTS "bookings_insert_eligible" ON public.bookings;
CREATE POLICY "bookings_insert_eligible"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_book_rooms()
    AND member_id = public.current_member_id()
    AND status IN (
      'pending'::public.booking_status,
      'pending_approval'::public.booking_status,
      'confirmed'::public.booking_status
    )
  );

-- Associates may cancel own non-cancelled bookings (RPC enforces lead-time)
DROP POLICY IF EXISTS "bookings_cancel_own" ON public.bookings;
CREATE POLICY "bookings_cancel_own"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND status <> 'cancelled'::public.booking_status
  )
  WITH CHECK (
    member_id = public.current_member_id()
    AND status = 'cancelled'::public.booking_status
  );
