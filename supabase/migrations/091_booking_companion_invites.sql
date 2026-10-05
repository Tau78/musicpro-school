-- Inviti compagni di prova (step intermedio prima del sistema BAND).
-- Autodichiarazione + email; non blocca create_booking_safe.

CREATE TABLE public.booking_companion_invites (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by_member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  booking_id           UUID REFERENCES public.bookings (id) ON DELETE SET NULL,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  email                TEXT NOT NULL,
  path                 TEXT NOT NULL CHECK (path IN ('existing_member', 'enrollment')),
  matched_member_id    UUID REFERENCES public.members (id) ON DELETE SET NULL,
  status               TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.booking_companion_invites IS
  'Inviti quota/iscrizione inviati dal prenotante per chi entra in struttura con lui.';

CREATE INDEX idx_booking_companion_invites_booker
  ON public.booking_companion_invites (invited_by_member_id, created_at DESC);

CREATE INDEX idx_booking_companion_invites_booking
  ON public.booking_companion_invites (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX idx_booking_companion_invites_email
  ON public.booking_companion_invites (invited_by_member_id, lower(email), created_at DESC);

ALTER TABLE public.booking_companion_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_companion_invites_select_own"
  ON public.booking_companion_invites FOR SELECT
  TO authenticated
  USING (invited_by_member_id = public.current_member_id());

CREATE POLICY "booking_companion_invites_select_staff"
  ON public.booking_companion_invites FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

GRANT SELECT ON TABLE public.booking_companion_invites TO authenticated;
