-- Quota pagata NON sblocca più la bozza da sola.
-- clear_enrollment_draft_on_quota (037) toglieva is_enrollment_draft e impostava
-- enrolled_at al solo paid_at → sportello contanti iscritto al corso senza CF+firma.
-- Allineato a salvaAggiornamentoAssociatoIscrizione / completaInvioIscrizione:
-- chiudi bozza solo se anagrafica già completa (CF + consenso GDPR/firma).

CREATE OR REPLACE FUNCTION public.clear_enrollment_draft_on_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.members
  SET
    is_enrollment_draft = false,
    draft_expires_at = NULL,
    enrolled_at = COALESCE(enrolled_at, now())
  WHERE id = NEW.member_id
    AND is_enrollment_draft = true
    AND NULLIF(btrim(tax_code), '') IS NOT NULL
    AND gdpr_consent IS TRUE;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.clear_enrollment_draft_on_quota() IS
  'Chiude bozza iscrizione solo se quota pagata E form completo (CF + GDPR). '
  'La quota contanti da sola non promuove l''associato.';
