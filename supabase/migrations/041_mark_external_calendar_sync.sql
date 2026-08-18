-- Stato sync calendari esterni (mancava: la Edge Function la chiamava già)

CREATE OR REPLACE FUNCTION public.mark_external_calendar_sync(
  p_calendar_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.room_external_calendars
  SET
    last_synced_at = now(),
    last_sync_error = nullif(btrim(coalesce(p_error, '')), '')
  WHERE id = p_calendar_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_external_calendar_sync(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_external_calendar_sync(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_external_calendar_sync(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.mark_external_calendar_sync(uuid, text) IS
  'Aggiorna last_synced_at / last_sync_error dopo un import calendari esterni.';
