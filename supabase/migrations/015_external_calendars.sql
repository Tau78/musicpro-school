-- MusicPro School — Fase 2.3: calendari esterni per blocchi disponibilità sala

-- ---------------------------------------------------------------------------
-- room_external_calendars — calendari Google/iCal collegati a una sala
-- ---------------------------------------------------------------------------
CREATE TABLE public.room_external_calendars (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             UUID NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  google_calendar_id  TEXT,
  ical_url            TEXT,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  last_synced_at      TIMESTAMPTZ,
  last_sync_error     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT room_external_calendars_source_check
    CHECK (
      nullif(trim(coalesce(google_calendar_id, '')), '') IS NOT NULL
      OR nullif(trim(coalesce(ical_url, '')), '') IS NOT NULL
    )
);

COMMENT ON TABLE public.room_external_calendars IS
  'Calendari esterni (scuola/aule) collegati a una sala; sync in sola lettura.';

COMMENT ON COLUMN public.room_external_calendars.google_calendar_id IS
  'Google Calendar ID pubblico o condiviso con service account.';

COMMENT ON COLUMN public.room_external_calendars.ical_url IS
  'URL iCal alternativo (sync futuro); almeno uno tra google_calendar_id e ical_url.';

CREATE INDEX idx_room_external_calendars_room_enabled
  ON public.room_external_calendars (room_id, enabled);

CREATE TRIGGER trg_room_external_calendars_updated_at
  BEFORE UPDATE ON public.room_external_calendars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- external_calendar_events — cache eventi importati
-- ---------------------------------------------------------------------------
CREATE TABLE public.external_calendar_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_calendar_id  UUID NOT NULL
    REFERENCES public.room_external_calendars (id) ON DELETE CASCADE,
  external_event_id     TEXT NOT NULL,
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  summary               TEXT,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT external_calendar_events_unique_event
    UNIQUE (external_calendar_id, external_event_id),
  CONSTRAINT external_calendar_events_time_order
    CHECK (end_at > start_at)
);

COMMENT ON TABLE public.external_calendar_events IS
  'Eventi importati da calendari esterni; usati per bloccare slot in availability.';

CREATE INDEX idx_external_calendar_events_calendar_start
  ON public.external_calendar_events (external_calendar_id, start_at);

CREATE INDEX idx_external_calendar_events_range
  ON public.external_calendar_events (start_at, end_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_external_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_external_calendars_select_staff"
  ON public.room_external_calendars FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "room_external_calendars_select_enabled"
  ON public.room_external_calendars FOR SELECT
  TO authenticated
  USING (enabled = true AND public.can_book_rooms());

CREATE POLICY "room_external_calendars_manage_staff"
  ON public.room_external_calendars FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "external_calendar_events_select_staff"
  ON public.external_calendar_events FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "external_calendar_events_select_availability"
  ON public.external_calendar_events FOR SELECT
  TO authenticated
  USING (
    public.can_book_rooms()
    AND EXISTS (
      SELECT 1
      FROM public.room_external_calendars c
      WHERE c.id = external_calendar_id
        AND c.enabled = true
    )
  );

CREATE POLICY "external_calendar_events_manage_staff"
  ON public.external_calendar_events FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.room_external_calendars TO authenticated;
GRANT SELECT ON TABLE public.external_calendar_events TO authenticated;
