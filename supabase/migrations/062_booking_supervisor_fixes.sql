-- Fix supervisor: cross-midnight hours, lock/hours on UPDATE, docente bypass.

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
  v_ok BOOLEAN;
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

  -- Slot after midnight generated from previous calendar day's extended hours
  -- (UI uses startMinutes >= 1440 → next calendar day). Re-evaluate vs prior day.
  IF v_start_min < 360 THEN
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
      AND sd.starts_on <= (v_date - 1)
      AND sd.ends_on >= (v_date - 1)
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
        AND od.day_of_week = ((v_dow + 6) % 7);
    END IF;

    IF v_mode IS NULL THEN
      SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
      IF FOUND THEN
        v_mode := 'open';
        v_open_start := COALESCE(v_room.open_minute, v_room.open_hour * 60);
        v_open_end := COALESCE(v_room.close_minute, v_room.close_hour * 60);
      END IF;
    END IF;

    IF v_mode IS NOT NULL AND v_mode <> 'closed' THEN
      IF v_mode = 'open' AND v_open_end > 1440 THEN
        v_ok :=
          (v_start_min + 1440) >= v_open_start
          AND (v_end_min + 1440) <= v_open_end;
        IF v_ok THEN
          RETURN TRUE;
        END IF;
      ELSIF v_mode = 'split' AND v_a_end > 1440 THEN
        v_ok :=
          (v_start_min + 1440) >= v_a_start
          AND (v_end_min + 1440) <= v_a_end;
        IF v_ok THEN
          RETURN TRUE;
        END IF;
      END IF;
    END IF;

    v_mode := NULL;
  END IF;

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
  -- System / service_role (no JWT member): used by smoke, webhooks, SECURITY DEFINER jobs.
  IF public.current_member_id() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff (admin/segreteria) and docenti: lessons / admin calendar may book anytime.
  IF public.is_admin_or_segreteria()
     OR public.has_member_role('docente'::public.member_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.room_id IS NOT DISTINCT FROM OLD.room_id
     AND NEW.start_at IS NOT DISTINCT FROM OLD.start_at
     AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at THEN
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
  BEFORE INSERT OR UPDATE OF room_id, start_at, end_at ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_guard_lock_and_hours();
