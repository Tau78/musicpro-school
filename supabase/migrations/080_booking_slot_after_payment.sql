-- Slot occupancy: unpaid checkout (pending + unpaid/link_sent, no credit hold)
-- must NOT block the room. Occupied only after payment confirmed (or credit hold /
-- pending_approval / confirmed).

CREATE OR REPLACE FUNCTION public.booking_occupies_slot(
  p_status public.booking_status,
  p_payment_status TEXT,
  p_credits_held INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_status IS DISTINCT FROM 'cancelled'::public.booking_status
    AND NOT (
      p_status = 'pending'::public.booking_status
      AND p_payment_status IN ('unpaid', 'link_sent')
      AND COALESCE(p_credits_held, 0) = 0
    );
$$;

COMMENT ON FUNCTION public.booking_occupies_slot(public.booking_status, TEXT, INTEGER) IS
  'True when a booking blocks the room slot. Unpaid pending checkouts do not.';

GRANT EXECUTE ON FUNCTION public.booking_occupies_slot(public.booking_status, TEXT, INTEGER)
  TO authenticated, service_role;

-- Unique active slot: only occupying bookings
DROP INDEX IF EXISTS public.idx_bookings_unique_active_slot;

CREATE UNIQUE INDEX idx_bookings_unique_active_slot
  ON public.bookings (room_id, start_at)
  WHERE public.booking_occupies_slot(status, payment_status, credits_held);

-- Patch create_booking_safe overlap + cancel own abandoned unpaid on same slot
-- Signature after 078_booking_notes_microphones: + notes text + microphone integer
DO $$
DECLARE
  src text;
  patched text;
  old_overlap text :=
$old$
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
$old$;
  new_overlap text :=
$new$
  -- Free abandoned unpaid checkouts by the same member on this overlap
  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    updated_at = now()
  WHERE member_id = p_member_id
    AND room_id = p_room_id
    AND status = 'pending'::public.booking_status
    AND payment_status IN ('unpaid', 'link_sent')
    AND COALESCE(credits_held, 0) = 0
    AND start_at < p_end_at
    AND end_at > p_start_at;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND public.booking_occupies_slot(b.status, b.payment_status, b.credits_held)
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.create_booking_safe(uuid, uuid, timestamptz, timestamptz, boolean, uuid, uuid[], text, integer)'::regprocedure
  );
  IF position('booking_occupies_slot' IN src) > 0 THEN
    RAISE NOTICE 'create_booking_safe already patched — skip';
  ELSIF position(old_overlap IN src) = 0 THEN
    RAISE EXCEPTION 'create_booking_safe: overlap block not found — refuse silent skip';
  ELSE
    patched := replace(src, old_overlap, new_overlap);
    EXECUTE patched;
  END IF;
END
$$;

-- Patch modify_booking_safe overlap
DO $$
DECLARE
  src text;
  patched text;
  old_overlap text :=
$old$
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = v_booking.room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.id <> p_booking_id
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
$old$;
  new_overlap text :=
$new$
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = v_booking.room_id
      AND public.booking_occupies_slot(b.status, b.payment_status, b.credits_held)
      AND b.id <> p_booking_id
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.modify_booking_safe(uuid, timestamptz, timestamptz, integer)'::regprocedure
  );
  IF position('booking_occupies_slot' IN src) > 0 THEN
    RAISE NOTICE 'modify_booking_safe already patched — skip';
  ELSIF position(old_overlap IN src) = 0 THEN
    RAISE EXCEPTION 'modify_booking_safe: overlap block not found — refuse silent skip';
  ELSE
    patched := replace(src, old_overlap, new_overlap);
    EXECUTE patched;
  END IF;
END
$$;

-- Before confirming payment, refuse if another occupying booking took the slot
DO $$
DECLARE
  src text;
  patched text;
  old_block text :=
$old$
  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione annullata — pagamento non applicabile.',
      'booking_id', v_booking.id
    );
  END IF;

  UPDATE public.bookings
$old$;
  new_block text :=
$new$
  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione annullata — pagamento non applicabile.',
      'booking_id', v_booking.id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = v_booking.room_id
      AND b.id <> v_booking.id
      AND public.booking_occupies_slot(b.status, b.payment_status, b.credits_held)
      AND b.start_at < v_booking.end_at
      AND b.end_at > v_booking.start_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Lo slot non è più disponibile: pagamento non applicabile.',
      'booking_id', v_booking.id,
      'error_code', 'SLOT_TAKEN'
    );
  END IF;

  UPDATE public.bookings
$new$;
BEGIN
  src := pg_get_functiondef(
    'public.apply_stripe_room_booking_payment(uuid, text, text, text, text)'::regprocedure
  );
  IF position('SLOT_TAKEN' IN src) > 0 AND position('booking_occupies_slot' IN src) > 0 THEN
    RAISE NOTICE 'apply_stripe_room_booking_payment already patched — skip';
  ELSIF position(old_block IN src) = 0 THEN
    RAISE EXCEPTION 'apply_stripe_room_booking_payment: cancel guard not found';
  ELSE
    patched := replace(src, old_block, new_block);
    EXECUTE patched;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
