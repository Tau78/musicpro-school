-- MusicPro School — Auth hooks
-- Links auth.users to pre-migrated members by email (replaces GAS magic links)

-- ---------------------------------------------------------------------------
-- Link auth user → member on signup (auth.users INSERT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_member_on_auth_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.members
    SET user_id = NEW.id,
        updated_at = now()
    WHERE lower(trim(email)) = lower(trim(NEW.email))
      AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.link_member_on_auth_signup IS
  'On signup, match auth.users.email to members.email and set members.user_id';

DROP TRIGGER IF EXISTS trg_link_member_on_auth_signup ON auth.users;

CREATE TRIGGER trg_link_member_on_auth_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_member_on_auth_signup();

-- ---------------------------------------------------------------------------
-- Callable on login/session refresh — handles members imported after signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_member_linked()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id
  INTO v_member_id
  FROM public.members m
  WHERE m.user_id = auth.uid()
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    RETURN v_member_id;
  END IF;

  v_email := auth.jwt() ->> 'email';

  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.members
  SET user_id = auth.uid(),
      updated_at = now()
  WHERE lower(trim(email)) = lower(trim(v_email))
    AND user_id IS NULL
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_member_linked IS
  'Idempotent: link current auth user to members row by email; returns member id or NULL';

GRANT EXECUTE ON FUNCTION public.ensure_member_linked() TO authenticated;
