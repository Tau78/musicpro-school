-- Cutover SuperSaaS → MusicPro: spegne import/specchio e libera gli slot.
-- ScuolaSemplice resta attivo fino al suo cutover (non toccato qui).

INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'supersaas_import_enabled',
    '0',
    '1 = import/specchio SuperSaaS attivo. 0 = cutover fatto: niente cron, niente overlap hold.'
  )
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

UPDATE public.app_settings
SET value = '0'
WHERE key = 'supersaas_mirror_enforce';

UPDATE public.app_settings
SET value = ''
WHERE key = 'supersaas_mirror_synced_at';

-- Libera gli slot fantasma (prenotazioni cancellate su SuperSaaS ma ancora nello specchio).
DELETE FROM public.supersaas_slot_mirrors;

-- Disattiva i feed Google Import di SuperSaaS (@import.calendar.google.com).
-- Resta attivo il calendario MusicPro «Tutte» (group.calendar.google.com).
UPDATE public.room_external_calendars
SET
  enabled = false,
  updated_at = now()
WHERE enabled = true
  AND google_calendar_id ILIKE '%@import.calendar.google.com';

DELETE FROM public.external_calendar_events e
USING public.room_external_calendars c
WHERE e.external_calendar_id = c.id
  AND c.google_calendar_id ILIKE '%@import.calendar.google.com';

-- Trigger: no-op finché l'import è disabilitato (default post-cutover).
CREATE OR REPLACE FUNCTION public.bookings_reject_supersaas_mirror_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'::public.booking_status THEN
    RETURN NEW;
  END IF;

  -- Cutover: se l'import è spento, non bloccare le sale.
  IF NOT public.get_booking_setting_bool('supersaas_import_enabled', false) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supersaas_slot_mirrors m
    WHERE m.room_id = NEW.room_id
      AND m.start_at < NEW.end_at
      AND m.end_at > NEW.start_at
      AND NOT (
        public.current_member_id() IS NULL
        AND NEW.external_source = 'supersaas'
        AND NEW.external_id = m.external_id
      )
  ) THEN
    RAISE EXCEPTION 'SUPERSAAS_SLOT_HELD'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bookings_reject_supersaas_mirror_overlap() IS
  'Blocca overlap con lo specchio SuperSaaS solo se supersaas_import_enabled=1. Post-cutover è spento.';

COMMENT ON TABLE public.supersaas_slot_mirrors IS
  'Specchio SuperSaaS (obsoleto post-cutover). Vuoto e non aggiornato quando supersaas_import_enabled=0.';

NOTIFY pgrst, 'reload schema';
