-- LM: slot ancorati in fascia operativa; prenotazioni > anchor = sconto solo sul blocco iniziale.

CREATE OR REPLACE FUNCTION public.booking_lm_anchor_duration_minutes(p_room_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(r.default_duration_minutes, 0), 120)
  FROM public.rooms r
  WHERE r.id = p_room_id;
$$;

CREATE OR REPLACE FUNCTION public.booking_is_lm_anchor_start(
  p_start_at timestamptz,
  p_room_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date;
  v_cfg record;
  v_anchor_min integer;
  v_start_min integer;
  v_band_start integer;
  v_band_end integer;
BEGIN
  v_day := public.booking_local_day(p_start_at);
  v_anchor_min := public.booking_lm_anchor_duration_minutes(p_room_id);

  SELECT *
  INTO v_cfg
  FROM public.booking_operational_day_config(v_day);

  IF NOT COALESCE(v_cfg.enabled, false) THEN
    RETURN false;
  END IF;

  v_band_start := v_cfg.band_start_minute;
  v_band_end := v_cfg.band_end_minute;
  v_start_min := public.booking_local_start_minute(p_start_at);

  IF v_start_min < v_band_start
     OR v_start_min + v_anchor_min > v_band_end THEN
    RETURN false;
  END IF;

  RETURN (v_start_min - v_band_start) % v_anchor_min = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_apply_last_minute_price(
  p_base numeric,
  p_room_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_member_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base numeric(10, 2);
  v_blocked timestamptz;
  v_pct integer;
  v_campaign_id uuid;
  v_anchor_min integer;
  v_total_min integer;
  v_anchor_end timestamptz;
  v_anchor_base numeric(10, 2);
  v_remainder numeric(10, 2);
BEGIN
  v_base := COALESCE(p_base, 0)::numeric(10, 2);
  IF v_base <= 0 THEN
    RETURN v_base;
  END IF;

  SELECT e.price_blocked_until
  INTO v_blocked
  FROM public.member_last_minute_eligibility e
  WHERE e.member_id = p_member_id;

  IF v_blocked IS NOT NULL AND v_blocked > now() THEN
    RETURN v_base;
  END IF;

  IF NOT public.booking_is_lm_anchor_start(p_start_at, p_room_id) THEN
    RETURN v_base;
  END IF;

  v_anchor_min := public.booking_lm_anchor_duration_minutes(p_room_id);
  v_total_min := GREATEST(
    1,
    (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer
  );
  v_anchor_end := p_start_at + make_interval(mins => v_anchor_min);

  SELECT c.id
  INTO v_campaign_id
  FROM public.last_minute_campaigns c
  WHERE c.room_id = p_room_id
    AND c.start_at = p_start_at
    AND c.end_at = v_anchor_end
    AND c.phase = 'phase2'
  LIMIT 1;

  IF v_campaign_id IS NULL THEN
    RETURN v_base;
  END IF;

  v_pct := public.booking_last_minute_discount_percent();

  IF v_total_min <= v_anchor_min THEN
    RETURN round(v_base * (1 - v_pct::numeric / 100), 2);
  END IF;

  v_anchor_base := round(v_base * (v_anchor_min::numeric / v_total_min), 2);
  v_remainder := v_base - v_anchor_base;
  RETURN round(v_anchor_base * (1 - v_pct::numeric / 100), 2) + v_remainder;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_lm_anchor_duration_minutes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_is_lm_anchor_start(timestamptz, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.booking_lm_anchor_duration_minutes(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_is_lm_anchor_start(timestamptz, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.booking_is_lm_anchor_start(timestamptz, uuid) IS
  'True se inizio slot è ancorato alla griglia LM nella fascia operativa del giorno.';
COMMENT ON FUNCTION public.booking_apply_last_minute_price(
  numeric, uuid, timestamptz, timestamptz, uuid
) IS
  'Sconto LM fase 2 sul blocco anchor; ore extra a listino (es. 3h = 2h LM + 1h piena).';

NOTIFY pgrst, 'reload schema';
