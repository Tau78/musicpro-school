-- Orari settimanali per sala, giorni speciali, blocco prenotazioni.

INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'booking_locked',
    'false',
    'Se true, gli associati non possono creare prenotazioni. Staff (admin/segreteria) può comunque prenotare.'
  ),
  (
    'booking_locked_message',
    'Le prenotazioni sono temporaneamente chiuse. Riprova più tardi o contatta la segreteria.',
    'Messaggio mostrato agli associati quando le prenotazioni sono chiuse.'
  )
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.room_opening_days (
  room_id UUID NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  mode TEXT NOT NULL CHECK (mode IN ('open', 'split', 'closed')),
  start_minute INTEGER NOT NULL DEFAULT 540 CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL DEFAULT 1440 CHECK (end_minute > 0 AND end_minute <= 2160),
  morning_start_minute INTEGER NOT NULL DEFAULT 660 CHECK (morning_start_minute >= 0 AND morning_start_minute < 1440),
  morning_end_minute INTEGER NOT NULL DEFAULT 840 CHECK (morning_end_minute > 0 AND morning_end_minute <= 2160),
  afternoon_start_minute INTEGER NOT NULL DEFAULT 960 CHECK (afternoon_start_minute >= 0 AND afternoon_start_minute < 1440),
  afternoon_end_minute INTEGER NOT NULL DEFAULT 1440 CHECK (afternoon_end_minute > 0 AND afternoon_end_minute <= 2160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, day_of_week)
);

CREATE TABLE public.room_special_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('open', 'split', 'closed')),
  title TEXT NOT NULL DEFAULT '',
  start_minute INTEGER NOT NULL DEFAULT 540 CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL DEFAULT 1440 CHECK (end_minute > 0 AND end_minute <= 2160),
  morning_start_minute INTEGER NOT NULL DEFAULT 660 CHECK (morning_start_minute >= 0 AND morning_start_minute < 1440),
  morning_end_minute INTEGER NOT NULL DEFAULT 840 CHECK (morning_end_minute > 0 AND morning_end_minute <= 2160),
  afternoon_start_minute INTEGER NOT NULL DEFAULT 960 CHECK (afternoon_start_minute >= 0 AND afternoon_start_minute < 1440),
  afternoon_end_minute INTEGER NOT NULL DEFAULT 1440 CHECK (afternoon_end_minute > 0 AND afternoon_end_minute <= 2160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_special_days_range CHECK (ends_on >= starts_on)
);

CREATE INDEX room_special_days_room_dates_idx
  ON public.room_special_days (room_id, starts_on, ends_on);

INSERT INTO public.room_opening_days (
  room_id,
  day_of_week,
  mode,
  start_minute,
  end_minute,
  morning_start_minute,
  morning_end_minute,
  afternoon_start_minute,
  afternoon_end_minute
)
SELECT
  r.id,
  d.dow,
  'open',
  COALESCE(r.open_minute, r.open_hour * 60),
  COALESCE(r.close_minute, r.close_hour * 60),
  660,
  840,
  960,
  1440
FROM public.rooms r
CROSS JOIN (VALUES (0), (1), (2), (3), (4), (5), (6)) AS d (dow);

ALTER TABLE public.room_opening_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_special_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_opening_days_select
  ON public.room_opening_days
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY room_opening_days_manage
  ON public.room_opening_days
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY room_special_days_select
  ON public.room_special_days
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY room_special_days_manage
  ON public.room_special_days
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE OR REPLACE FUNCTION public.booking_slot_within_room_hours(
  p_room_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_date DATE;
  v_dow INTEGER;
  v_start_min INTEGER;
  v_end_min INTEGER;
  v_mode TEXT;
  v_open_start INTEGER;
  v_open_end INTEGER;
  v_m_start INTEGER;
  v_m_end INTEGER;
  v_a_start INTEGER;
  v_a_end INTEGER;
  v_room public.rooms%ROWTYPE;
BEGIN
  IF p_end_at <= p_start_at THEN
    RETURN FALSE;
  END IF;

  v_date := (p_start_at AT TIME ZONE 'Europe/Rome')::date;
  v_dow := EXTRACT(DOW FROM (p_start_at AT TIME ZONE 'Europe/Rome'))::integer;
  v_start_min := (
    EXTRACT(HOUR FROM (p_start_at AT TIME ZONE 'Europe/Rome')) * 60
    + EXTRACT(MINUTE FROM (p_start_at AT TIME ZONE 'Europe/Rome'))
  )::integer;
  v_end_min := v_start_min + GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60.0)
  )::integer;

  SELECT
    sd.mode,
    sd.start_minute,
    sd.end_minute,
    sd.morning_start_minute,
    sd.morning_end_minute,
    sd.afternoon_start_minute,
    sd.afternoon_end_minute
  INTO
    v_mode,
    v_open_start,
    v_open_end,
    v_m_start,
    v_m_end,
    v_a_start,
    v_a_end
  FROM public.room_special_days sd
  WHERE sd.room_id = p_room_id
    AND sd.starts_on <= v_date
    AND sd.ends_on >= v_date
  ORDER BY sd.starts_on DESC
  LIMIT 1;

  IF v_mode IS NULL THEN
    SELECT
      od.mode,
      od.start_minute,
      od.end_minute,
      od.morning_start_minute,
      od.morning_end_minute,
      od.afternoon_start_minute,
      od.afternoon_end_minute
    INTO
      v_mode,
      v_open_start,
      v_open_end,
      v_m_start,
      v_m_end,
      v_a_start,
      v_a_end
    FROM public.room_opening_days od
    WHERE od.room_id = p_room_id
      AND od.day_of_week = v_dow;
  END IF;

  IF v_mode IS NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;
    v_mode := 'open';
    v_open_start := COALESCE(v_room.open_minute, v_room.open_hour * 60);
    v_open_end := COALESCE(v_room.close_minute, v_room.close_hour * 60);
  END IF;

  IF v_mode = 'closed' THEN
    RETURN FALSE;
  END IF;

  IF v_mode = 'open' THEN
    RETURN v_start_min >= v_open_start AND v_end_min <= v_open_end;
  END IF;

  RETURN
    (v_start_min >= v_m_start AND v_end_min <= v_m_end)
    OR (v_start_min >= v_a_start AND v_end_min <= v_a_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.bookings_guard_lock_and_hours()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_or_segreteria() THEN
    RETURN NEW;
  END IF;

  IF public.get_booking_setting_bool('booking_locked', false) THEN
    RAISE EXCEPTION 'BOOKING_LOCKED'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.booking_slot_within_room_hours(NEW.room_id, NEW.start_at, NEW.end_at) THEN
    RAISE EXCEPTION 'OUTSIDE_HOURS'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_guard_lock_and_hours ON public.bookings;
CREATE TRIGGER bookings_guard_lock_and_hours
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_guard_lock_and_hours();
