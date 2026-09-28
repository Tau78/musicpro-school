-- Cancelled bookings must not block rebooking the same room+start.
-- create_booking_safe already ignores status = cancelled, but the table
-- constraint UNIQUE (room_id, start_at) still fired unique_violation → SLOT_TAKEN.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_unique_slot;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_active_slot
  ON public.bookings (room_id, start_at)
  WHERE status <> 'cancelled'::public.booking_status;

COMMENT ON INDEX public.idx_bookings_unique_active_slot IS
  'One active booking per room start; cancelled rows can free the slot.';
