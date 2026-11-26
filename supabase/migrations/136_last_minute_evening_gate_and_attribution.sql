-- Gate LM: attribuzione prenotazioni → campagna; annulla campagne attive se sera non operativa.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS last_minute_campaign_id uuid
    REFERENCES public.last_minute_campaigns (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_last_minute_campaign_idx
  ON public.bookings (last_minute_campaign_id)
  WHERE last_minute_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.last_minute_campaign_id IS
  'Campagna last minute collegata se la prenotazione rientra nella finestra promozionale.';

CREATE OR REPLACE FUNCTION public.booking_resolve_last_minute_campaign_id(
  p_room_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked timestamptz;
  v_campaign_id uuid;
  v_anchor_min integer;
  v_anchor_end timestamptz;
BEGIN
  SELECT e.price_blocked_until
  INTO v_blocked
  FROM public.member_last_minute_eligibility e
  WHERE e.member_id = p_member_id;

  IF v_blocked IS NOT NULL AND v_blocked > now() THEN
    RETURN NULL;
  END IF;

  IF NOT public.booking_is_lm_anchor_start(p_start_at, p_room_id) THEN
    RETURN NULL;
  END IF;

  v_anchor_min := public.booking_lm_anchor_duration_minutes(p_room_id);
  v_anchor_end := p_start_at + make_interval(mins => v_anchor_min);

  SELECT c.id
  INTO v_campaign_id
  FROM public.last_minute_campaigns c
  WHERE c.room_id = p_room_id
    AND c.start_at = p_start_at
    AND c.end_at = v_anchor_end
    AND c.phase IN ('phase1', 'phase2')
  LIMIT 1;

  RETURN v_campaign_id;
END;
$$;

COMMENT ON FUNCTION public.booking_resolve_last_minute_campaign_id(
  uuid, timestamptz, timestamptz, uuid
) IS
  'Campagna LM attiva per slot ancorato (fase 1 o 2), se socio non in price block.';

CREATE OR REPLACE FUNCTION public.bookings_apply_last_minute_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  IF NEW.status = 'cancelled'::public.booking_status THEN
    RETURN NEW;
  END IF;

  v_campaign_id := public.booking_resolve_last_minute_campaign_id(
    NEW.room_id,
    NEW.start_at,
    NEW.end_at,
    NEW.member_id
  );

  IF v_campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.last_minute_campaign_id := v_campaign_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_last_minute_attribution_trg ON public.bookings;
CREATE TRIGGER bookings_last_minute_attribution_trg
  BEFORE INSERT OR UPDATE OF room_id, start_at, end_at, member_id, status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_apply_last_minute_attribution();

CREATE OR REPLACE FUNCTION public.bookings_mark_last_minute_campaign_filled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_minute_campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'::public.booking_status THEN
    RETURN NEW;
  END IF;

  UPDATE public.last_minute_campaigns
  SET
    phase = 'filled',
    filled_at = COALESCE(filled_at, now())
  WHERE id = NEW.last_minute_campaign_id
    AND phase IN ('phase1', 'phase2');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_last_minute_filled_trg ON public.bookings;
CREATE TRIGGER bookings_last_minute_filled_trg
  AFTER INSERT OR UPDATE OF last_minute_campaign_id, status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_mark_last_minute_campaign_filled();

CREATE OR REPLACE FUNCTION public.last_minute_cancel_active_for_local_day(p_day date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.last_minute_campaigns c
  SET phase = 'cancelled'
  WHERE c.phase IN ('phase1', 'phase2')
    AND public.booking_local_day(c.start_at) = p_day;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.last_minute_cancel_active_for_local_day(date) IS
  'Annulla campagne LM attive per il giorno Roma (es. sera ancora senza prenotazioni in fascia).';

REVOKE ALL ON FUNCTION public.booking_resolve_last_minute_campaign_id(
  uuid, timestamptz, timestamptz, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.last_minute_cancel_active_for_local_day(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.booking_resolve_last_minute_campaign_id(
  uuid, timestamptz, timestamptz, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.last_minute_cancel_active_for_local_day(date)
  TO service_role;

NOTIFY pgrst, 'reload schema';