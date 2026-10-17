-- Collaboratore: copia sulle email della sala prove (prenotazione, modifica, annullo).

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS booking_email_cc boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.members.booking_email_cc IS
  'Se true e il membro ha il ruolo collaboratore attivo, la sua email va in copia sulle email della sala prove.';
