-- Ruolo Collaboratore: sconto sulla prenotazione sala (percentuale in Impostazioni).
-- Default 50%. Assegnato a Facciolo, Petralia, Roberti.

ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'collaboratore';

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'booking_collaborator_discount_percent',
  '50',
  'Sconto % sul totale sala per chi ha il ruolo Collaboratore (0–100).'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.booking_price_after_member_discount(
  p_price NUMERIC,
  p_member_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_percent INTEGER;
  v_is_collaborator BOOLEAN;
BEGIN
  IF p_price IS NULL OR p_price <= 0 OR p_member_id IS NULL THEN
    RETURN ROUND(COALESCE(p_price, 0)::NUMERIC, 2);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.member_roles r
    WHERE r.member_id = p_member_id
      AND r.role = 'collaboratore'::public.member_role
      AND r.revoked_at IS NULL
  )
  INTO v_is_collaborator;

  IF NOT COALESCE(v_is_collaborator, false) THEN
    RETURN ROUND(p_price::NUMERIC, 2);
  END IF;

  v_percent := GREATEST(
    0,
    LEAST(100, public.get_booking_setting_int('booking_collaborator_discount_percent', 50))
  );

  IF v_percent <= 0 THEN
    RETURN ROUND(p_price::NUMERIC, 2);
  END IF;

  RETURN ROUND((p_price * (100 - v_percent) / 100.0)::NUMERIC, 2);
END;
$$;

COMMENT ON FUNCTION public.booking_price_after_member_discount(NUMERIC, UUID) IS
  'Applica lo sconto Collaboratore al prezzo sala già calcolato.';

GRANT EXECUTE ON FUNCTION public.booking_price_after_member_discount(NUMERIC, UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._wrap_booking_total_price_with_member_discount(
  p_src TEXT,
  p_member_expr TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  needle TEXT := 'public.booking_total_price_eur(';
  out TEXT := p_src;
  pos INTEGER := 1;
  found INTEGER;
  abs_i INTEGER;
  prefix TEXT;
  p INTEGER;
  depth INTEGER;
  ch TEXT;
  call_text TEXT;
  replacement TEXT;
BEGIN
  IF position('booking_price_after_member_discount' IN out) > 0
     AND position('public.booking_total_price_eur(' IN out) = 0 THEN
    RETURN out;
  END IF;

  LOOP
    found := position(needle IN substr(out, pos));
    EXIT WHEN found = 0;
    abs_i := pos + found - 1;
    prefix := substr(out, GREATEST(1, abs_i - 48), LEAST(48, abs_i - 1));
    IF position('booking_price_after_member_discount(' IN prefix) > 0 THEN
      pos := abs_i + length(needle);
      CONTINUE;
    END IF;

    p := abs_i + length(needle);
    depth := 1;
    WHILE p <= length(out) AND depth > 0 LOOP
      ch := substr(out, p, 1);
      IF ch = '(' THEN
        depth := depth + 1;
      ELSIF ch = ')' THEN
        depth := depth - 1;
      END IF;
      p := p + 1;
    END LOOP;

    call_text := substr(out, abs_i, p - abs_i);
    replacement := format(
      'public.booking_price_after_member_discount(%s, %s)',
      call_text,
      p_member_expr
    );
    out := substr(out, 1, abs_i - 1) || replacement || substr(out, p);
    pos := abs_i + length(replacement);
  END LOOP;

  RETURN out;
END;
$$;

DO $$
DECLARE
  r record;
  src text;
  patched text;
  member_expr text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_booking_safe',
        'modify_booking_safe',
        'admin_update_booking_safe'
      )
  LOOP
    src := pg_get_functiondef(r.sig);
    member_expr := CASE
      WHEN r.proname = 'create_booking_safe' THEN 'p_member_id'
      ELSE 'v_booking.member_id'
    END;
    patched := public._wrap_booking_total_price_with_member_discount(src, member_expr);
    IF patched IS DISTINCT FROM src THEN
      EXECUTE patched;
    ELSIF position('booking_price_after_member_discount' IN src) = 0 THEN
      RAISE EXCEPTION '%: chiamata booking_total_price_eur non wrappata', r.proname;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION public._wrap_booking_total_price_with_member_discount(TEXT, TEXT);

INSERT INTO public.member_roles (member_id, role, granted_at)
SELECT m.id, 'collaboratore'::public.member_role, now()
FROM public.members m
WHERE m.id IN (
  'dd097d26-ce62-4d74-86ec-d6e36faab460', -- Marco Facciolo
  '609412bc-bbfe-4d8b-9718-77b2d5c270e7', -- Alessandro Petralia
  '8ff30ee4-23fe-4336-934b-a12e7be9a363'  -- Aldo Roberti
)
ON CONFLICT (member_id, role) DO UPDATE
SET revoked_at = NULL,
    granted_at = COALESCE(public.member_roles.granted_at, EXCLUDED.granted_at);

NOTIFY pgrst, 'reload schema';
