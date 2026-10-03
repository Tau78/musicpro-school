-- Conferma pagamento / crediti: rifiuta se un'altra prenotazione occupa già lo slot.
-- 080 agganciava SLOT_TAKEN solo a apply_stripe_room_booking_payment(uuid, …),
-- overload non usato. Nexi e lo smoke chiamano (text, …, integer).
-- debit_booking_credits confermava senza lo stesso controllo.
-- Il lock sulla sala è preso prima del FOR UPDATE, così due conferme
-- sovrapposte non passano entrambe il controllo.

CREATE OR REPLACE FUNCTION public.booking_room_slot_lock(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id::text, 48021));
END;
$$;

COMMENT ON FUNCTION public.booking_room_slot_lock(uuid) IS
  'Serializza conferma, addebito crediti e controllo overlap per una sala.';

REVOKE ALL ON FUNCTION public.booking_room_slot_lock(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.booking_confirm_blocked_by_slot(p_booking public.bookings)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  PERFORM public.booking_room_slot_lock(p_booking.room_id);

  RETURN EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_booking.room_id
      AND b.id <> p_booking.id
      AND public.booking_occupies_slot(b.status, b.payment_status, b.credits_held)
      AND b.start_at < p_booking.end_at
      AND b.end_at > p_booking.start_at
  );
END;
$$;

COMMENT ON FUNCTION public.booking_confirm_blocked_by_slot(public.bookings) IS
  'True se un''altra prenotazione occupa già la finestra. Esclude la riga stessa.';

REVOKE ALL ON FUNCTION public.booking_confirm_blocked_by_slot(public.bookings) FROM PUBLIC;

-- apply_stripe_room_booking_payment(text, …) — percorso Nexi / smoke
DO $$
DECLARE
  src text;
  patched text;
  old_load text :=
$old$
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id::text = v_ref
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione non trovata.',
      'booking_ref', v_ref
    );
  END IF;

  IF v_booking.payment_status = 'paid' THEN
$old$;
  new_load text :=
$new$
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id::text = v_ref
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione non trovata.',
      'booking_ref', v_ref
    );
  END IF;

  PERFORM public.booking_room_slot_lock(v_booking.room_id);

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = v_booking.id
  FOR UPDATE;

  IF v_booking.payment_status = 'paid' THEN
$new$;
  old_before_update text :=
$old$
  END IF;

  IF v_booking.status NOT IN (
    'pending'::public.booking_status,
    'pending_approval'::public.booking_status
  ) AND v_booking.payment_status <> 'unpaid' AND v_booking.payment_status <> 'link_sent' THEN
$old$;
  new_before_update text :=
$new$
  END IF;

  IF public.booking_confirm_blocked_by_slot(v_booking) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Lo slot non è più disponibile: pagamento non applicabile.',
      'booking_id', v_booking.id,
      'error_code', 'SLOT_TAKEN'
    );
  END IF;

  IF v_booking.status NOT IN (
    'pending'::public.booking_status,
    'pending_approval'::public.booking_status
  ) AND v_booking.payment_status <> 'unpaid' AND v_booking.payment_status <> 'link_sent' THEN
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.apply_stripe_room_booking_payment(text,text,text,text,text,integer)'::regprocedure
  );

  IF position('booking_confirm_blocked_by_slot' IN src) > 0 THEN
    RAISE NOTICE 'apply_stripe_room_booking_payment(text) already patched — skip';
  ELSIF position(old_load IN src) = 0 THEN
    RAISE EXCEPTION 'apply_stripe_room_booking_payment(text): load block not found';
  ELSIF position(old_before_update IN src) = 0 THEN
    RAISE EXCEPTION 'apply_stripe_room_booking_payment(text): pre-update block not found';
  ELSE
    patched := replace(src, old_load, new_load);
    patched := replace(patched, old_before_update, new_before_update);
    EXECUTE patched;
  END IF;
END
$$;

-- debit_booking_credits — conferma con crediti
DO $$
DECLARE
  src text;
  patched text;
  old_lock text :=
$old$
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;
$old$;
  new_lock text :=
$new$
  PERFORM public.booking_room_slot_lock((
    SELECT room_id FROM public.bookings WHERE id = p_booking_id
  ));

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;
$new$;
  old_debit text :=
$old$
  IF v_booking.credits_used IS NOT NULL AND v_booking.credits_used > 0 THEN
$old$;
  new_debit text :=
$new$
  IF public.booking_confirm_blocked_by_slot(v_booking) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  IF v_booking.credits_used IS NOT NULL AND v_booking.credits_used > 0 THEN
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.debit_booking_credits(uuid,integer)'::regprocedure
  );

  IF position('booking_confirm_blocked_by_slot' IN src) > 0 THEN
    RAISE NOTICE 'debit_booking_credits already patched — skip';
  ELSIF position(old_lock IN src) = 0 THEN
    RAISE EXCEPTION 'debit_booking_credits: lock block not found';
  ELSIF position(old_debit IN src) = 0 THEN
    RAISE EXCEPTION 'debit_booking_credits: debit block not found';
  ELSE
    patched := replace(src, old_lock, new_lock);
    patched := replace(patched, old_debit, new_debit);
    EXECUTE patched;
  END IF;
END
$$;

-- Overload uuid (già con SLOT_TAKEN da 080): stesso lock, prima del FOR UPDATE.
DO $$
DECLARE
  src text;
  patched text;
  old_lock text :=
$old$
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;
$old$;
  new_lock text :=
$new$
  PERFORM public.booking_room_slot_lock((
    SELECT room_id FROM public.bookings WHERE id = p_booking_id
  ));

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.apply_stripe_room_booking_payment(uuid,text,text,text,text)'::regprocedure
  );

  IF position('booking_room_slot_lock' IN src) > 0 THEN
    RAISE NOTICE 'apply_stripe_room_booking_payment(uuid) already locked — skip';
  ELSIF position(old_lock IN src) = 0 THEN
    RAISE EXCEPTION 'apply_stripe_room_booking_payment(uuid): lock block not found';
  ELSE
    patched := replace(src, old_lock, new_lock);
    EXECUTE patched;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
