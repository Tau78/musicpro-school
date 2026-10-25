-- Prezzo last minute fase 2 allineato al wizard (default 30% su tariffa slot).

CREATE OR REPLACE FUNCTION public.booking_last_minute_discount_percent()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(
    0,
    LEAST(90, public.get_booking_setting_int('last_minute_discount_percent', 30))
  );
$$;

COMMENT ON FUNCTION public.booking_last_minute_discount_percent() IS
  'Percentuale sconto LM fase 2 (default 30).';

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

  SELECT c.id
  INTO v_campaign_id
  FROM public.last_minute_campaigns c
  WHERE c.room_id = p_room_id
    AND c.start_at = p_start_at
    AND c.end_at = p_end_at
    AND c.phase = 'phase2'
  LIMIT 1;

  IF v_campaign_id IS NULL THEN
    RETURN v_base;
  END IF;

  v_pct := public.booking_last_minute_discount_percent();
  RETURN round(v_base * (1 - v_pct::numeric / 100), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.booking_last_minute_discount_percent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_apply_last_minute_price(
  numeric, uuid, timestamptz, timestamptz, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.booking_last_minute_discount_percent()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_apply_last_minute_price(
  numeric, uuid, timestamptz, timestamptz, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.booking_apply_last_minute_price(
  numeric, uuid, timestamptz, timestamptz, uuid
) IS
  'Applica sconto LM fase 2 se campagna attiva e socio non in price block.';

-- ---------------------------------------------------------------------------
-- create_booking_safe — prezzo dopo sconto socio
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  src text;
  patched text;
  anchor text := E'  IF v_is_associato_only THEN';
  inject text :=
$inj$
  v_price := public.booking_apply_last_minute_price(
    v_price,
    p_room_id,
    p_start_at,
    p_end_at,
    p_member_id
  );

$inj$;
BEGIN
  src := pg_get_functiondef(
    'public.create_booking_safe(uuid, uuid, timestamptz, timestamptz, boolean, uuid, uuid[], text, integer)'::regprocedure
  );

  IF position('booking_apply_last_minute_price' IN src) > 0 THEN
    RAISE NOTICE 'create_booking_safe: last minute price già patchato — skip';
  ELSIF position(anchor IN src) = 0 THEN
    RAISE EXCEPTION 'create_booking_safe: anchor IF v_is_associato_only non trovato';
  ELSE
    patched := replace(src, anchor, inject || anchor);
    EXECUTE patched;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
