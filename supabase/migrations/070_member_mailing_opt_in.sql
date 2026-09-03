-- Mailing / communications opt-in for associates (App Store Impostazioni).
-- Default true: existing members keep receiving school mailings until they opt out.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS mailing_opt_in BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mailing_opt_in_at TIMESTAMPTZ;

COMMENT ON COLUMN public.members.mailing_opt_in IS
  'Se false, l''associato ha opt-out dalle comunicazioni/mailing della scuola (Impostazioni app).';
COMMENT ON COLUMN public.members.mailing_opt_in_at IS
  'Ultimo cambio di mailing_opt_in.';

UPDATE public.members
SET mailing_opt_in_at = COALESCE(mailing_opt_in_at, now())
WHERE mailing_opt_in_at IS NULL;
