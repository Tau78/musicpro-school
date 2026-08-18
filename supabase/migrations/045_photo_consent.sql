-- Fetta 16: consenso foto/video (modulo iscrizione + scheda allievo).
-- Distinto da gdpr_consent (statuto / informativa). Default no.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS photo_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_consent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.members.photo_consent IS
  'Consenso all’uso di foto e video per attività istituzionali e canali associazione.';
COMMENT ON COLUMN public.members.photo_consent_at IS
  'Quando è stato registrato photo_consent = true.';
