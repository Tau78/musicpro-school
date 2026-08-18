-- PROVI DA SOLO: lo sconto è orario (€/h), non a prenotazione.

COMMENT ON COLUMN public.rooms.provi_da_solo_discount_eur IS
  'Sconto orario (€/h) applicato quando provi_da_solo è selezionato (es. 2.00). Totale = importo × ore.';

CREATE OR REPLACE FUNCTION public.booking_provi_discount_total_eur(
  p_hourly_discount numeric,
  p_duration_minutes integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    (GREATEST(0, COALESCE(p_hourly_discount, 0)) * (GREATEST(0, p_duration_minutes)::numeric / 60.0))::numeric,
    2
  );
$$;

GRANT EXECUTE ON FUNCTION public.booking_provi_discount_total_eur(numeric, integer)
  TO authenticated;

DO $$
DECLARE
  src text;
  patched text;
  old_line text :=
    'v_price := GREATEST(0, v_price - v_room.provi_da_solo_discount_eur);';
  new_line text :=
    'v_price := GREATEST(0, v_price - public.booking_provi_discount_total_eur(v_room.provi_da_solo_discount_eur, v_duration_minutes));';
BEGIN
  src := pg_get_functiondef(
    'public.create_booking_safe(uuid, uuid, timestamptz, timestamptz, boolean, uuid)'::regprocedure
  );
  patched := replace(src, old_line, new_line);
  IF patched = src THEN
    RAISE EXCEPTION
      'create_booking_safe: riga sconto PROVI DA SOLO non trovata, aggiornare a mano.';
  END IF;
  EXECUTE patched;
END
$$;

DO $$
DECLARE
  src text;
  patched text;
  old_line text :=
    'v_price_new := GREATEST(0, v_price_new - v_room.provi_da_solo_discount_eur);';
  new_line text :=
    'v_price_new := GREATEST(0, v_price_new - public.booking_provi_discount_total_eur(v_room.provi_da_solo_discount_eur, p_duration_minutes));';
BEGIN
  src := pg_get_functiondef(
    'public.admin_update_booking_safe(uuid, uuid, timestamptz, timestamptz, integer, text, text)'::regprocedure
  );
  patched := replace(src, old_line, new_line);
  IF patched = src THEN
    RAISE EXCEPTION
      'admin_update_booking_safe: riga sconto PROVI DA SOLO non trovata, aggiornare a mano.';
  END IF;
  EXECUTE patched;
END
$$;

NOTIFY pgrst, 'reload schema';
