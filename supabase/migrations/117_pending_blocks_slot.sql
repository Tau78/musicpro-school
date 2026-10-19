-- Pending non pagato blocca lo slot per N ore (impostazione admin).
-- Default: attivo, 4 ore. Allo scadere la riga pending viene annullata
-- e lo slot torna libero. booking_occupies_slot resta IMMUTABLE per l'indice
-- unique sullo stesso start_at (i checkout unpaid non ci entrano).

INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'booking_pending_blocks_slot',
    'true',
    'Se true, un pending non pagato (link inviato, senza crediti) blocca la sala fino alla scadenza.'
  ),
  (
    'booking_pending_hold_hours',
    '4',
    'Ore di blocco dello slot per un pending non pagato. Valori: 1, 2, 4, 6, 8, 12, 24.'
  )
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.booking_pending_hold_hours()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
BEGIN
  v_hours := public.get_booking_setting_int('booking_pending_hold_hours', 4);
  IF v_hours NOT IN (1, 2, 4, 6, 8, 12, 24) THEN
    v_hours := 4;
  END IF;
  RETURN v_hours;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_pending_hold_hours() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_pending_hold_hours() TO authenticated, service_role;

-- True se la riga occupa la sala, incluso il pending non pagato ancora nel tempo di hold.
CREATE OR REPLACE FUNCTION public.booking_blocks_room(
  p_status public.booking_status,
  p_payment_status text,
  p_credits_held numeric,
  p_created_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF public.booking_occupies_slot(p_status, p_payment_status, p_credits_held) THEN
    RETURN true;
  END IF;

  IF p_status IS DISTINCT FROM 'pending'::public.booking_status THEN
    RETURN false;
  END IF;
  IF p_payment_status IS NULL OR p_payment_status NOT IN ('unpaid', 'link_sent') THEN
    RETURN false;
  END IF;
  IF COALESCE(p_credits_held, 0) <> 0 THEN
    RETURN false;
  END IF;
  IF NOT public.get_booking_setting_bool('booking_pending_blocks_slot', true) THEN
    RETURN false;
  END IF;
  IF p_created_at IS NULL THEN
    RETURN true;
  END IF;

  RETURN p_created_at + make_interval(hours => public.booking_pending_hold_hours()) > now();
END;
$$;

REVOKE ALL ON FUNCTION public.booking_blocks_room(public.booking_status, text, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_blocks_room(public.booking_status, text, numeric, timestamptz)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_expired_pending_bookings()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.get_booking_setting_bool('booking_pending_blocks_slot', true) THEN
    RETURN 0;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    updated_at = now()
  WHERE status = 'pending'::public.booking_status
    AND payment_status IN ('unpaid', 'link_sent')
    AND COALESCE(credits_held, 0) = 0
    AND created_at <= now() - make_interval(hours => public.booking_pending_hold_hours());

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.release_expired_pending_bookings() IS
  'Annulla i pending non pagati oltre booking_pending_hold_hours. No-op se il flag è spento.';

REVOKE ALL ON FUNCTION public.release_expired_pending_bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_pending_bookings() TO authenticated, service_role;

-- Allinea i controlli overlap (create, modify, conferma, admin) al pending a tempo.
DO $$
DECLARE
  r record;
  src text;
  patched text;
  old_admin text :=
$old$
      AND b.status <> 'cancelled'::public.booking_status
      AND b.id <> p_booking_id
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
$old$;
  new_admin text :=
$new$
      AND b.id <> p_booking_id
      AND public.booking_blocks_room(b.status, b.payment_status, b.credits_held, b.created_at)
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
$new$;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname <> 'booking_occupies_slot'
      AND p.proname <> 'booking_blocks_room'
      AND p.proname <> 'booking_pending_hold_hours'
      AND pg_get_functiondef(p.oid) LIKE '%booking_occupies_slot(%'
  LOOP
    src := pg_get_functiondef(r.oid);
    patched := regexp_replace(
      src,
      $re$booking_occupies_slot\(\s*([A-Za-z_][A-Za-z0-9_]*)\.status\s*,\s*\1\.payment_status\s*,\s*\1\.credits_held\s*\)$re$,
      $to$booking_blocks_room(\1.status, \1.payment_status, \1.credits_held, \1.created_at)$to$,
      'g'
    );

    IF position('booking_occupies_slot(' IN patched) > 0 THEN
      RAISE EXCEPTION '%: booking_occupies_slot rimasto dopo la sostituzione', r.proname;
    END IF;

    IF position('release_expired_pending_bookings()' IN patched) = 0 THEN
      patched := regexp_replace(
        patched,
        $re$(\$function\$\s*BEGIN)$re$,
        $to$\1
  PERFORM public.release_expired_pending_bookings();$to$
      );
    END IF;

    EXECUTE patched;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_update_booking_safe'
  ORDER BY p.oid DESC
  LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'admin_update_booking_safe mancante';
  END IF;

  IF position('booking_blocks_room' IN src) = 0 THEN
    IF position(old_admin IN src) = 0 THEN
      RAISE EXCEPTION 'admin_update_booking_safe: blocco overlap non trovato';
    END IF;
    patched := replace(src, old_admin, new_admin);
    IF position('release_expired_pending_bookings()' IN patched) = 0 THEN
      patched := regexp_replace(
        patched,
        $re$(\$function\$\s*BEGIN)$re$,
        $to$\1
  PERFORM public.release_expired_pending_bookings();$to$
      );
    END IF;
    EXECUTE patched;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.booking_confirm_blocked_by_slot(p_booking public.bookings)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  PERFORM public.release_expired_pending_bookings();
  PERFORM public.booking_room_slot_lock(p_booking.room_id);

  RETURN EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_booking.room_id
      AND b.id <> p_booking.id
      AND public.booking_blocks_room(b.status, b.payment_status, b.credits_held, b.created_at)
      AND b.start_at < p_booking.end_at
      AND b.end_at > p_booking.start_at
  );
END;
$$;

COMMENT ON FUNCTION public.booking_confirm_blocked_by_slot(public.bookings) IS
  'True se un''altra prenotazione occupa la finestra, pending non pagato incluso finché è nel hold.';

SELECT public.release_expired_pending_bookings();
