-- Import idempotente da SuperSaaS e specchio anonimo degli slot ancora lì.
-- Lo specchio non ha member_id: non attribuisce la prenotazione all'associato sbagliato.
-- Le nuove occupazioni che si sovrappongono allo specchio vengono rifiutate.
-- Se il refresh ha più di 30 minuti e l'enforcement è acceso, ogni nuova
-- occupazione non annullata viene rifiutata (niente doppio booking su dati vecchi).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_external_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_external_source_check
  CHECK (external_source IS NULL OR external_source IN ('supersaas'));

COMMENT ON COLUMN public.bookings.external_source IS
  'Origine esterna. supersaas = prenotazione confermata importata, payment_method nullo, senza checkout.';

COMMENT ON COLUMN public.bookings.external_id IS
  'ID nel sistema esterno. Univoco insieme a external_source.';

CREATE UNIQUE INDEX IF NOT EXISTS bookings_external_source_id_uidx
  ON public.bookings (external_source, external_id)
  WHERE external_source IS NOT NULL
    AND external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.supersaas_slot_mirrors (
  external_id TEXT PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supersaas_slot_mirrors_time_order CHECK (end_at > start_at)
);

COMMENT ON TABLE public.supersaas_slot_mirrors IS
  'Slot futuro letto da SuperSaaS, senza associato. Occupa la sala finché la prenotazione non è importata.';

CREATE INDEX IF NOT EXISTS idx_supersaas_slot_mirrors_room_range
  ON public.supersaas_slot_mirrors (room_id, start_at, end_at);

ALTER TABLE public.supersaas_slot_mirrors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supersaas_slot_mirrors_select_bookers"
  ON public.supersaas_slot_mirrors;

CREATE POLICY "supersaas_slot_mirrors_select_bookers"
  ON public.supersaas_slot_mirrors
  FOR SELECT
  TO authenticated
  USING (public.can_book_rooms() OR public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.supersaas_slot_mirrors TO authenticated;
GRANT ALL ON TABLE public.supersaas_slot_mirrors TO service_role;

INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'supersaas_mirror_enforce',
    '0',
    '1 = rifiuta le nuove occupazioni sala se lo specchio SuperSaaS manca o ha più di 30 minuti'
  ),
  (
    'supersaas_mirror_synced_at',
    '',
    'Timestamp ISO dell''ultimo refresh completo dello specchio SuperSaaS'
  )
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bookings_reject_supersaas_mirror_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw TEXT;
  v_at TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'cancelled'::public.booking_status THEN
    RETURN NEW;
  END IF;

  IF public.get_booking_setting_bool('supersaas_mirror_enforce', false) THEN
    SELECT s.value INTO v_raw
    FROM public.app_settings s
    WHERE s.key = 'supersaas_mirror_synced_at';

    BEGIN
      v_at := nullif(btrim(coalesce(v_raw, '')), '')::timestamptz;
    EXCEPTION
      WHEN others THEN
        v_at := NULL;
    END;

    IF v_at IS NULL OR v_at < now() - interval '30 minutes' THEN
      RAISE EXCEPTION 'SUPERSAAS_MIRROR_STALE'
        USING ERRCODE = 'P0001';
    END IF;
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
  'Blocca le occupazioni sala che si sovrappongono allo specchio SuperSaaS. L''import di servizio può scrivere la riga con lo stesso external_id.';

DROP TRIGGER IF EXISTS bookings_reject_supersaas_mirror_overlap ON public.bookings;

CREATE TRIGGER bookings_reject_supersaas_mirror_overlap
  BEFORE INSERT OR UPDATE OF room_id, start_at, end_at, status, payment_status, credits_held
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_reject_supersaas_mirror_overlap();

NOTIFY pgrst, 'reload schema';
