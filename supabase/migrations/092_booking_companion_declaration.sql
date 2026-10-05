-- Traccia autodichiarazione compagni sulla prenotazione (segreteria).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS companion_declaration TEXT;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_companion_declaration_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_companion_declaration_check
  CHECK (
    companion_declaration IS NULL
    OR companion_declaration IN ('all_ok', 'need_quota')
  );

COMMENT ON COLUMN public.bookings.companion_declaration IS
  'Autodichiarazione compagni: all_ok = tutti in regola; need_quota = inviti/Ok Quota. NULL = non applicabile (provi da solo, admin, storico).';
