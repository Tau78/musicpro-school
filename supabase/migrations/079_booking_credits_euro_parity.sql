-- Crediti sala: 1 credito = 1 euro del prezzo finale della prenotazione.
-- Il catalogo sale attivo usa importi interi; il ledger continua quindi a
-- registrare crediti interi, calcolati dal prezzo e non dalla durata.

UPDATE public.credit_packages
SET
  name = 'Pacchetto 80 crediti',
  credits = 80,
  description = '80 crediti da usare nelle sale prova (1 credito = 1 €)'
WHERE name = 'Pacchetto 10 ore'
  AND credits = 10
  AND price_eur = 80;

UPDATE public.credit_packages
SET
  name = 'Pacchetto 150 crediti',
  credits = 150,
  description = '150 crediti da usare nelle sale prova (1 credito = 1 €)'
WHERE name = 'Pacchetto 20 ore'
  AND credits = 20
  AND price_eur = 150;

COMMENT ON TABLE public.credit_packages IS
  'Pacchetti crediti SHOP — configurati da admin/segreteria. 1 credito = 1 euro di spesa sala.';

COMMENT ON COLUMN public.bookings.credits_used IS
  'Crediti addebitati definitivamente: 1 credito = 1 euro del prezzo prenotazione.';

COMMENT ON COLUMN public.bookings.credits_held IS
  'Crediti riservati fino ad approvazione: 1 credito = 1 euro.';

DO $$
DECLARE
  src text;
  patched text;
BEGIN
  src := pg_get_functiondef(
    'public.debit_booking_credits(uuid,integer)'::regprocedure
  );
  patched := replace(
    src,
    'CEIL(v_booking.duration_minutes::NUMERIC / 60)::INTEGER',
    'ROUND(COALESCE(v_booking.total_price_eur, 0))::INTEGER'
  );
  IF patched = src THEN
    RAISE EXCEPTION 'debit_booking_credits: formula durata non trovata';
  END IF;
  EXECUTE patched;

  src := pg_get_functiondef(
    'public.modify_booking_safe(uuid,timestamp with time zone,timestamp with time zone,integer)'::regprocedure
  );
  patched := replace(
    src,
    'v_new_credit_hours := CEIL(v_duration::NUMERIC / 60.0)::INTEGER;',
    'v_new_credit_hours := ROUND(v_price)::INTEGER;'
  );
  IF patched = src THEN
    RAISE EXCEPTION 'modify_booking_safe: formula durata non trovata';
  END IF;
  EXECUTE patched;

  src := pg_get_functiondef(
    'public.admin_update_booking_safe(uuid,uuid,timestamp with time zone,timestamp with time zone,integer,text,text)'::regprocedure
  );
  patched := replace(
    src,
    'v_new_credit_hours := CEIL(p_duration_minutes::NUMERIC / 60.0)::INTEGER;',
    'v_new_credit_hours := ROUND(public.booking_total_price_eur(
      p_room_id,
      p_duration_minutes,
      COALESCE(v_booking.provi_da_solo, false),
      ARRAY(
        SELECT bo.room_option_id
        FROM public.booking_options bo
        WHERE bo.booking_id = p_booking_id
      )
    ))::INTEGER;'
  );
  IF patched = src THEN
    RAISE EXCEPTION 'admin_update_booking_safe: formula nuovo costo non trovata';
  END IF;
  src := patched;
  patched := replace(
    src,
    'v_old_credit_hours := CEIL(
        COALESCE(v_booking.duration_minutes, 0)::NUMERIC / 60.0
      )::INTEGER;',
    'v_old_credit_hours := ROUND(v_price_old)::INTEGER;'
  );
  IF patched = src THEN
    RAISE EXCEPTION 'admin_update_booking_safe: formula vecchio costo non trovata';
  END IF;
  EXECUTE patched;
END;
$$;

COMMENT ON FUNCTION public.debit_booking_credits(UUID, INTEGER) IS
  'Addebito crediti in rapporto 1:1 col prezzo in euro; gestisce anche hold e idempotenza.';
