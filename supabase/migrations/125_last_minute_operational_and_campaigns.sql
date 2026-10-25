-- Last minute: serata operativa (lead-time 0 in fascia), campagne LM, eleggibilità soci.

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'booking_operational_week_schedule',
  '{
    "mon": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0},
    "tue": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0},
    "wed": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0},
    "thu": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0},
    "fri": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0},
    "sat": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0},
    "sun": {"enabled": false, "bandStart": "18:00", "bandEnd": "24:00", "approvalMinHoursOperational": 0, "autoConfirmMinHoursOperational": 0}
  }',
  'Fascia serata operativa per giorno (Europe/Rome): lead-time associato in override quando c''è almeno una prenotazione confermata in fascia.'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpers — schedule JSON + fascia serata
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_operational_weekday_key(p_day date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE EXTRACT(DOW FROM p_day)::integer
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    WHEN 0 THEN 'sun'
    ELSE 'mon'
  END;
$$;

CREATE OR REPLACE FUNCTION public.booking_hhmm_to_minutes(p_hhmm text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts text[];
  v_h integer;
  v_m integer;
BEGIN
  IF p_hhmm IS NULL OR btrim(p_hhmm) = '' THEN
    RETURN NULL;
  END IF;

  v_parts := regexp_split_to_array(btrim(p_hhmm), ':');
  IF array_length(v_parts, 1) < 2 THEN
    RETURN NULL;
  END IF;

  v_h := v_parts[1]::integer;
  v_m := v_parts[2]::integer;

  IF v_h = 24 AND v_m = 0 THEN
    RETURN 1440;
  END IF;

  IF v_h < 0 OR v_h > 23 OR v_m < 0 OR v_m > 59 THEN
    RETURN NULL;
  END IF;

  RETURN v_h * 60 + v_m;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_operational_week_schedule()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.value::jsonb
      FROM public.app_settings s
      WHERE s.key = 'booking_operational_week_schedule'
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_operational_day_config(p_day date)
RETURNS TABLE (
  weekday_key text,
  enabled boolean,
  band_start_minute integer,
  band_end_minute integer,
  approval_min_hours_operational integer,
  auto_confirm_min_hours_operational integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_node jsonb;
  v_band_start text;
  v_band_end text;
  v_start_min integer;
  v_end_min integer;
BEGIN
  v_key := public.booking_operational_weekday_key(p_day);
  v_node := public.booking_operational_week_schedule() -> v_key;

  enabled := COALESCE((v_node ->> 'enabled')::boolean, false);
  v_band_start := COALESCE(v_node ->> 'bandStart', '18:00');
  v_band_end := COALESCE(v_node ->> 'bandEnd', '24:00');
  v_start_min := public.booking_hhmm_to_minutes(v_band_start);
  v_end_min := public.booking_hhmm_to_minutes(v_band_end);

  IF v_start_min IS NULL OR v_end_min IS NULL OR v_end_min <= v_start_min THEN
    v_start_min := 18 * 60;
    v_end_min := 24 * 60;
  END IF;

  weekday_key := v_key;
  band_start_minute := v_start_min;
  band_end_minute := v_end_min;
  approval_min_hours_operational :=
    COALESCE((v_node ->> 'approvalMinHoursOperational')::integer, 0);
  auto_confirm_min_hours_operational :=
    COALESCE((v_node ->> 'autoConfirmMinHoursOperational')::integer, 0);

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_local_start_minute(p_at timestamptz)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    EXTRACT(HOUR FROM (p_at AT TIME ZONE 'Europe/Rome')) * 60
    + EXTRACT(MINUTE FROM (p_at AT TIME ZONE 'Europe/Rome'))
  )::integer;
$$;

CREATE OR REPLACE FUNCTION public.booking_local_day(p_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_at AT TIME ZONE 'Europe/Rome')::date;
$$;

CREATE OR REPLACE FUNCTION public.booking_start_in_operational_band(
  p_start_at timestamptz,
  p_day date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg record;
  v_start_min integer;
BEGIN
  IF public.booking_local_day(p_start_at) IS DISTINCT FROM p_day THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.booking_operational_day_config(p_day);

  IF NOT COALESCE(v_cfg.enabled, false) THEN
    RETURN false;
  END IF;

  v_start_min := public.booking_local_start_minute(p_start_at);
  RETURN v_start_min >= v_cfg.band_start_minute
    AND v_start_min < v_cfg.band_end_minute;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_evening_operational_active(p_day date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg record;
BEGIN
  SELECT *
  INTO v_cfg
  FROM public.booking_operational_day_config(p_day);

  IF NOT COALESCE(v_cfg.enabled, false) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status = 'confirmed'::public.booking_status
      AND public.booking_local_day(b.start_at) = p_day
      AND public.booking_local_start_minute(b.start_at) >= v_cfg.band_start_minute
      AND public.booking_local_start_minute(b.start_at) < v_cfg.band_end_minute
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_resolve_lead_hours(p_start_at timestamptz)
RETURNS TABLE (
  approval_min_hours integer,
  auto_confirm_min_hours integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date;
  v_cfg record;
BEGIN
  approval_min_hours := public.get_booking_setting_int('booking_approval_min_hours', 6);
  auto_confirm_min_hours := public.get_booking_setting_int('booking_auto_confirm_min_hours', 12);

  v_day := public.booking_local_day(p_start_at);

  IF public.booking_evening_operational_active(v_day)
     AND public.booking_start_in_operational_band(p_start_at, v_day) THEN
    SELECT *
    INTO v_cfg
    FROM public.booking_operational_day_config(v_day);

    approval_min_hours := COALESCE(v_cfg.approval_min_hours_operational, 0);
    auto_confirm_min_hours := COALESCE(v_cfg.auto_confirm_min_hours_operational, 0);
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_operational_weekday_key(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_hhmm_to_minutes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_operational_week_schedule() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_operational_day_config(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_local_start_minute(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_local_day(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_start_in_operational_band(timestamptz, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_evening_operational_active(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_resolve_lead_hours(timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.booking_operational_weekday_key(date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_hhmm_to_minutes(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_operational_week_schedule()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_operational_day_config(date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_local_start_minute(timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_local_day(timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_start_in_operational_band(timestamptz, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_evening_operational_active(date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_resolve_lead_hours(timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.booking_evening_operational_active(date) IS
  'True se il giorno (Europe/Rome) ha almeno una prenotazione confermata con inizio in fascia serata operativa.';
COMMENT ON FUNCTION public.booking_resolve_lead_hours(timestamptz) IS
  'Soglie approval/auto_confirm globali, con override serata operativa quando attiva e lo slot cade in fascia.';

-- ---------------------------------------------------------------------------
-- last_minute_campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE public.last_minute_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  phase text NOT NULL DEFAULT 'phase1',
  phase1_started_at timestamptz,
  phase2_started_at timestamptz,
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT last_minute_campaigns_time_range CHECK (end_at > start_at),
  CONSTRAINT last_minute_campaigns_phase_check CHECK (
    phase IN ('phase1', 'phase2', 'filled', 'cancelled')
  )
);

COMMENT ON TABLE public.last_minute_campaigns IS
  'Campagne last minute a due fasi per slot sala libero.';

CREATE INDEX last_minute_campaigns_room_start_idx
  ON public.last_minute_campaigns (room_id, start_at);

CREATE INDEX last_minute_campaigns_active_phase_idx
  ON public.last_minute_campaigns (room_id, phase)
  WHERE phase IN ('phase1', 'phase2');

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.last_minute_campaigns
  ADD CONSTRAINT last_minute_campaigns_no_active_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (phase IN ('phase1', 'phase2'));

-- ---------------------------------------------------------------------------
-- member_last_minute_eligibility
-- ---------------------------------------------------------------------------

CREATE TABLE public.member_last_minute_eligibility (
  member_id uuid PRIMARY KEY REFERENCES public.members (id) ON DELETE CASCADE,
  price_blocked_until timestamptz,
  discounted_count_window integer NOT NULL DEFAULT 0,
  last_discounted_at timestamptz,
  last_early_booking_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_last_minute_eligibility_discounted_nonneg CHECK (
    discounted_count_window >= 0
  )
);

COMMENT ON TABLE public.member_last_minute_eligibility IS
  'Stato LM per socio: blocchi prezzo, conteggi sconti, ultima prenotazione anticipata (outreach).';

CREATE TRIGGER trg_member_last_minute_eligibility_updated_at
  BEFORE UPDATE ON public.member_last_minute_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.last_minute_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_last_minute_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY last_minute_campaigns_select_bookers
  ON public.last_minute_campaigns
  FOR SELECT
  TO authenticated
  USING (public.can_book_rooms());

CREATE POLICY member_last_minute_eligibility_select_own
  ON public.member_last_minute_eligibility
  FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

GRANT SELECT ON public.last_minute_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.last_minute_campaigns TO service_role;

GRANT SELECT ON public.member_last_minute_eligibility TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_last_minute_eligibility TO service_role;

-- ---------------------------------------------------------------------------
-- create_booking_safe — lead hours via booking_resolve_lead_hours
-- (Corpo live da migration chain 078→080→089→117; 119 aggiorna solo max_duration sale.)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  src text;
  patched text;
  old_lead text :=
$old$
  v_auto_hours := public.get_booking_setting_int('booking_auto_confirm_min_hours', 12);
  v_approval_hours := public.get_booking_setting_int('booking_approval_min_hours', 6);
$old$;
  new_lead text :=
$new$
  SELECT
    lh.approval_min_hours,
    lh.auto_confirm_min_hours
  INTO
    v_approval_hours,
    v_auto_hours
  FROM public.booking_resolve_lead_hours(p_start_at) AS lh;
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.create_booking_safe(uuid, uuid, timestamptz, timestamptz, boolean, uuid, uuid[], text, integer)'::regprocedure
  );

  IF position('booking_resolve_lead_hours' IN src) > 0 THEN
    RAISE NOTICE 'create_booking_safe: lead hours già patchato — skip';
  ELSIF position(old_lead IN src) = 0 THEN
    RAISE EXCEPTION 'create_booking_safe: blocco lead hours atteso non trovato';
  ELSE
    patched := replace(src, old_lead, new_lead);
    EXECUTE patched;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
