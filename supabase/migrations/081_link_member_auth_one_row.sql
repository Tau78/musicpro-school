-- Link Auth → members: una sola anagrafica per email (user_id UNIQUE).
-- Prima il trigger aggiornava TUTTE le righe con la stessa email → 23505 e createUser falliva.

CREATE OR REPLACE FUNCTION public.link_member_on_auth_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
BEGIN
  IF NEW.email IS NOT NULL THEN
    SELECT m.id
      INTO v_member_id
      FROM public.members m
     WHERE lower(trim(m.email)) = lower(trim(NEW.email))
       AND m.user_id IS NULL
     ORDER BY m.created_at ASC NULLS LAST, m.id ASC
     LIMIT 1;

    IF v_member_id IS NOT NULL THEN
      UPDATE public.members
         SET user_id = NEW.id,
             updated_at = now()
       WHERE id = v_member_id
         AND user_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.link_member_on_auth_signup IS
  'On signup, link auth.users to at most one members row with matching email and null user_id';
