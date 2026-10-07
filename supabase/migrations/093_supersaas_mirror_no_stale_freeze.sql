-- Lo specchio SuperSaaS va aggiornato da GitHub Actions, ma lo schedule */30
-- ritarda (spesso ore). Con enforce + STALE ogni modifica/nuova prenotazione
-- falliva. Restano bloccati solo gli overlap con righe reali nello specchio.

UPDATE public.app_settings
SET value = '0'
WHERE key = 'supersaas_mirror_enforce';

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
  'Blocca le occupazioni sala che si sovrappongono allo specchio SuperSaaS. Non congela il calendario se lo specchio è vecchio.';

NOTIFY pgrst, 'reload schema';
