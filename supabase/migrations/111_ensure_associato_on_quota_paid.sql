-- Dopo quota pagata: grant associato idempotente (anche bozze / onboarding app).
-- Chiusura bozza + enrolled_at restano a clear_enrollment_draft_on_quota (110)
-- e al path app completaInvio / finalizePaidEnrollmentFromMemberAnagrafica.

CREATE OR REPLACE FUNCTION public.ensure_associato_on_quota_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_id IS NULL OR NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.ensure_associato_role_for_member(NEW.member_id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_associato_on_quota_paid() IS
  'Su paid_at quota: grant associato idempotente (onboarding + rinnovi).';

DROP TRIGGER IF EXISTS member_annual_quotas_ensure_associato ON public.member_annual_quotas;
CREATE TRIGGER member_annual_quotas_ensure_associato
  AFTER INSERT OR UPDATE OF paid_at
  ON public.member_annual_quotas
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_associato_on_quota_paid();
