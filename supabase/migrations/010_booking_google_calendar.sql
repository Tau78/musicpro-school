-- MusicPro School — Google Calendar sync for room bookings

-- ---------------------------------------------------------------------------
-- Settings — main calendar (MusicPro sale prova)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'booking_google_calendar_id',
  '17ktlmh2cg7bsiklkhf04sdt7c@group.calendar.google.com',
  'Google Calendar ID principale per prenotazioni sale'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- rooms — Google Calendar color per sala
-- Google colorId: 11=Tomato, 10=Basil, 6=Tangerine, 7=Peacock
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS google_calendar_color_id TEXT;

UPDATE public.rooms SET google_calendar_color_id = '11' WHERE slug = 'sala-1';
UPDATE public.rooms SET google_calendar_color_id = '10' WHERE slug = 'sala-2';
UPDATE public.rooms SET google_calendar_color_id = '6' WHERE slug = 'sala-3';
UPDATE public.rooms SET google_calendar_color_id = '7' WHERE slug = 'sala-4';

COMMENT ON COLUMN public.rooms.google_calendar_color_id IS
  'Google Calendar API colorId (1–11) for events in the main booking calendar';

-- ---------------------------------------------------------------------------
-- bookings — Google Calendar event tracking
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_calendar_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_google_calendar_event
  ON public.bookings (google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.google_calendar_event_id IS
  'Google Calendar event id on booking_google_calendar_id calendar';

-- ---------------------------------------------------------------------------
-- mark_booking_calendar_sync — service_role only (Edge Function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_booking_calendar_sync(
  p_booking_id UUID,
  p_google_event_id TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET
    google_calendar_event_id = CASE
      WHEN p_error IS NULL THEN nullif(trim(coalesce(p_google_event_id, '')), '')
      ELSE google_calendar_event_id
    END,
    google_calendar_synced_at = CASE WHEN p_error IS NULL THEN now() ELSE google_calendar_synced_at END,
    google_calendar_sync_error = nullif(trim(coalesce(p_error, '')), '')
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Prenotazione non trovata.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'google_calendar_event_id', p_google_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_booking_calendar_sync(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_booking_calendar_sync(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.mark_booking_calendar_sync IS
  'Aggiorna google_calendar_event_id / errore sync dopo Edge booking-calendar-sync.';

-- ---------------------------------------------------------------------------
-- clear_booking_calendar_event_id — dopo delete su Google
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_booking_calendar_event(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings
  SET
    google_calendar_event_id = NULL,
    google_calendar_synced_at = now(),
    google_calendar_sync_error = NULL
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_booking_calendar_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_booking_calendar_event(UUID) TO service_role;
