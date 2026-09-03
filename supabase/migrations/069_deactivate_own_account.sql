-- Soft-disable own app access (Apple 5.1.1).
-- Keeps members row; secretariat reactivates via is_active = true.

CREATE OR REPLACE FUNCTION public.deactivate_own_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid UUID;
BEGIN
  mid := public.current_member_id();
  IF mid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.members
  SET is_active = false,
      updated_at = now()
  WHERE id = mid;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.deactivate_own_account() IS
  'App Review / GDPR: user disables own login. Member anagrafica stays; segreteria sets is_active=true to reactivate.';

GRANT EXECUTE ON FUNCTION public.deactivate_own_account() TO authenticated;
