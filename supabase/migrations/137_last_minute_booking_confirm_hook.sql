-- Hook LM: ogni confirmed/cancel in fascia → Edge → sync campagne + digest.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.app_setting_text(p_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(TRIM(value), '')
  FROM public.app_settings
  WHERE key = p_key
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.app_setting_text(text) IS
  'Lettura testo da app_settings (service/definer).';

CREATE OR REPLACE FUNCTION public.bookings_request_lm_sync_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_day date;
  v_fire boolean := false;
  v_url text;
  v_secret text;
  v_headers jsonb;
  v_body jsonb;
BEGIN
  IF NEW.status = 'confirmed'::public.booking_status THEN
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
      v_fire := true;
    END IF;
  ELSIF TG_OP = 'UPDATE'
     AND NEW.status = 'cancelled'::public.booking_status
     AND OLD.status = 'confirmed'::public.booking_status THEN
    v_fire := true;
  END IF;

  IF NOT v_fire THEN
    RETURN NEW;
  END IF;

  v_day := public.booking_local_day(NEW.start_at);
  IF NOT public.booking_start_in_operational_band(NEW.start_at, v_day) THEN
    RETURN NEW;
  END IF;

  v_url := COALESCE(
    public.app_setting_text('last_minute_sync_edge_url'),
    'https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/last-minute-on-booking'
  );

  v_secret := public.app_setting_text('last_minute_hook_secret');
  IF v_secret IS NULL THEN
    RAISE LOG 'last_minute_hook_secret mancante in app_settings — sync solo email/cron';
    RETURN NEW;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-lm-hook-secret', v_secret
  );
  v_body := jsonb_build_object('booking_id', NEW.id::text);

  PERFORM net.http_post(
    url := v_url,
    headers := v_headers,
    body := v_body
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bookings_request_lm_sync_on_change() IS
  'Dopo confirmed (o cancel di un confirmed) in fascia serata, invoca Edge last-minute-on-booking.';

DROP TRIGGER IF EXISTS bookings_lm_sync_on_change_trg ON public.bookings;
CREATE TRIGGER bookings_lm_sync_on_change_trg
  AFTER INSERT OR UPDATE OF status, start_at, room_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_request_lm_sync_on_change();

REVOKE ALL ON FUNCTION public.app_setting_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_setting_text(text) TO service_role;

NOTIFY pgrst, 'reload schema';