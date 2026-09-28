-- Every non-draft member is an associato. Backfill missing roles and keep
-- member_roles in sync when an anagrafica is created or promoted from draft.

CREATE OR REPLACE FUNCTION public.ensure_associato_role_for_member(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_member_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.member_roles (member_id, role, granted_at)
  VALUES (p_member_id, 'associato'::public.member_role, now())
  ON CONFLICT (member_id, role) DO UPDATE
    SET revoked_at = NULL,
        granted_at = COALESCE(public.member_roles.granted_at, EXCLUDED.granted_at)
  WHERE public.member_roles.revoked_at IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.ensure_associato_role_for_member(UUID) IS
  'Garantisce il ruolo associato attivo per un membro (insert o un-revoke).';

CREATE OR REPLACE FUNCTION public.members_ensure_associato_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_enrollment_draft = false THEN
    PERFORM public.ensure_associato_role_for_member(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_ensure_associato_role ON public.members;
CREATE TRIGGER members_ensure_associato_role
  AFTER INSERT OR UPDATE OF is_enrollment_draft
  ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.members_ensure_associato_role();

-- Backfill: tutti i non-bozza sono associati.
SELECT public.ensure_associato_role_for_member(m.id)
FROM public.members m
WHERE m.is_enrollment_draft = false;
