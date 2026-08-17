-- MusicPro School — Fase 3 Wave 3.1+3.2: BAND e pagamenti quota multipli
-- Depends on: 021 (another agent)

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.band_member_status AS ENUM (
  'pending_invite',
  'pending_quota',
  'active',
  'expired'
);

CREATE TYPE public.band_member_role AS ENUM (
  'founder',
  'member'
);

CREATE TYPE public.band_invite_status AS ENUM (
  'pending',
  'accepted',
  'expired',
  'revoked'
);

CREATE TYPE public.quota_payment_item_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'refunded'
);

-- ---------------------------------------------------------------------------
-- bands
-- ---------------------------------------------------------------------------
CREATE TABLE public.bands (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  founder_member_id  UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bands_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT bands_name_max_length CHECK (char_length(trim(name)) <= 120)
);

COMMENT ON TABLE public.bands IS
  'Band associati — gruppi di membri che prenotano insieme.';

CREATE INDEX idx_bands_founder_member
  ON public.bands (founder_member_id);

CREATE TRIGGER trg_bands_updated_at
  BEFORE UPDATE ON public.bands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- band_members
-- ---------------------------------------------------------------------------
CREATE TABLE public.band_members (
  band_id        UUID NOT NULL REFERENCES public.bands (id) ON DELETE CASCADE,
  member_id      UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  status         public.band_member_status NOT NULL DEFAULT 'pending_invite',
  role           public.band_member_role NOT NULL DEFAULT 'member',
  joined_at      TIMESTAMPTZ,
  invited_email  TEXT,

  PRIMARY KEY (band_id, member_id)
);

COMMENT ON TABLE public.band_members IS
  'Appartenenza band — stato conformità quota e ruolo founder/member.';

CREATE INDEX idx_band_members_member
  ON public.band_members (member_id);

CREATE INDEX idx_band_members_band_status
  ON public.band_members (band_id, status);

-- ---------------------------------------------------------------------------
-- band_invites
-- ---------------------------------------------------------------------------
CREATE TABLE public.band_invites (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id               UUID NOT NULL REFERENCES public.bands (id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  token                 TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  status                public.band_invite_status NOT NULL DEFAULT 'pending',
  expires_at            TIMESTAMPTZ NOT NULL,
  invited_by_member_id  UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT band_invites_email_not_blank CHECK (char_length(trim(email)) > 0)
);

COMMENT ON TABLE public.band_invites IS
  'Inviti band via link token — accettazione tramite accept_band_invite().';

CREATE INDEX idx_band_invites_band
  ON public.band_invites (band_id, status);

CREATE INDEX idx_band_invites_email_pending
  ON public.band_invites (lower(trim(email)), status)
  WHERE status = 'pending'::public.band_invite_status;

CREATE INDEX idx_band_invites_token
  ON public.band_invites (token);

-- ---------------------------------------------------------------------------
-- quota_payments — pagamento Stripe unico per più quote
-- ---------------------------------------------------------------------------
CREATE TABLE public.quota_payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_by_member_id        UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  stripe_payment_intent_id TEXT,
  total_amount_eur         NUMERIC(10, 2) NOT NULL,
  fiscal_year              INTEGER NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT quota_payments_total_non_negative CHECK (total_amount_eur >= 0),
  CONSTRAINT quota_payments_fiscal_year_valid CHECK (fiscal_year >= 2000)
);

COMMENT ON TABLE public.quota_payments IS
  'Pagamenti quota associativa multipli (un checkout Stripe, N beneficiari).';

CREATE INDEX idx_quota_payments_paid_by
  ON public.quota_payments (paid_by_member_id, created_at DESC);

CREATE INDEX idx_quota_payments_stripe_intent
  ON public.quota_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- quota_payment_items — riga per ogni membro coperto
-- ---------------------------------------------------------------------------
CREATE TABLE public.quota_payment_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_payment_id  UUID NOT NULL REFERENCES public.quota_payments (id) ON DELETE CASCADE,
  member_id         UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  amount_eur        NUMERIC(10, 2) NOT NULL,
  fiscal_year       INTEGER NOT NULL,
  paid_by_member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  status            public.quota_payment_item_status NOT NULL DEFAULT 'pending',

  CONSTRAINT quota_payment_items_amount_non_negative CHECK (amount_eur >= 0),
  CONSTRAINT quota_payment_items_fiscal_year_valid CHECK (fiscal_year >= 2000)
);

COMMENT ON TABLE public.quota_payment_items IS
  'Dettaglio quota per membro — riconciliazione da QuotaPayment Stripe.';

CREATE INDEX idx_quota_payment_items_payment
  ON public.quota_payment_items (quota_payment_id);

CREATE INDEX idx_quota_payment_items_member
  ON public.quota_payment_items (member_id, fiscal_year);

-- ---------------------------------------------------------------------------
-- Helpers — band membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_band_member(
  p_band_id UUID,
  p_member_id UUID DEFAULT public.current_member_id()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.band_members bm
    WHERE bm.band_id = p_band_id
      AND bm.member_id = p_member_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_band_founder(
  p_band_id UUID,
  p_member_id UUID DEFAULT public.current_member_id()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.band_members bm
    WHERE bm.band_id = p_band_id
      AND bm.member_id = p_member_id
      AND bm.role = 'founder'::public.band_member_role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_fiscal_year()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Rome'))::INTEGER;
$$;

-- ---------------------------------------------------------------------------
-- band_all_members_quota_ok
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.band_all_members_quota_ok(
  p_band_id UUID,
  p_fiscal_year INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  IF p_band_id IS NULL THEN
    RETURN false;
  END IF;

  v_year := COALESCE(p_fiscal_year, public.current_fiscal_year());

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.band_members bm
    WHERE bm.band_id = p_band_id
      AND bm.status = 'active'::public.band_member_status
      AND NOT public.member_quota_ok(bm.member_id, v_year)
  );
END;
$$;

COMMENT ON FUNCTION public.band_all_members_quota_ok(UUID, INTEGER) IS
  'True se tutti i membri active della band hanno quota pagata per l''anno fiscale.';

GRANT EXECUTE ON FUNCTION public.band_all_members_quota_ok(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_band_safe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_band_safe(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_name           TEXT;
  v_band_id        UUID;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso per creare una band.'
    );
  END IF;

  v_name := trim(p_name);

  IF v_name IS NULL OR char_length(v_name) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_NAME',
      'error_message', 'Inserisci un nome per la band.'
    );
  END IF;

  IF char_length(v_name) > 120 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_NAME',
      'error_message', 'Il nome della band non può superare 120 caratteri.'
    );
  END IF;

  IF NOT public.member_quota_ok(v_current_member) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'QUOTA_NOT_PAID',
      'error_message', 'Devi aver pagato la quota associativa per creare una band.'
    );
  END IF;

  INSERT INTO public.bands (name, founder_member_id)
  VALUES (v_name, v_current_member)
  RETURNING id INTO v_band_id;

  INSERT INTO public.band_members (
    band_id,
    member_id,
    status,
    role,
    joined_at
  )
  VALUES (
    v_band_id,
    v_current_member,
    'active'::public.band_member_status,
    'founder'::public.band_member_role,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'band_id', v_band_id,
    'name', v_name
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNKNOWN',
      'error_message', 'Impossibile creare la band.'
    );
END;
$$;

COMMENT ON FUNCTION public.create_band_safe(TEXT) IS
  'Crea band per l''associato autenticato in regola con quota; diventa founder active.';

GRANT EXECUTE ON FUNCTION public.create_band_safe(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_band_invite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_band_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_member_email   TEXT;
  v_invite         public.band_invites%ROWTYPE;
  v_status         public.band_member_status;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso per accettare l''invito.'
    );
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TOKEN',
      'error_message', 'Link invito non valido.'
    );
  END IF;

  SELECT *
  INTO v_invite
  FROM public.band_invites bi
  WHERE bi.token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_NOT_FOUND',
      'error_message', 'Invito non trovato o già utilizzato.'
    );
  END IF;

  IF v_invite.status = 'accepted'::public.band_invite_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_ALREADY_ACCEPTED',
      'error_message', 'Questo invito è già stato accettato.'
    );
  END IF;

  IF v_invite.status = 'revoked'::public.band_invite_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_REVOKED',
      'error_message', 'Questo invito è stato revocato.'
    );
  END IF;

  IF v_invite.status = 'expired'::public.band_invite_status
     OR v_invite.expires_at < now() THEN
    UPDATE public.band_invites
    SET status = 'expired'::public.band_invite_status
    WHERE id = v_invite.id
      AND status = 'pending'::public.band_invite_status;

    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITE_EXPIRED',
      'error_message', 'Questo invito è scaduto. Chiedi un nuovo link al founder.'
    );
  END IF;

  SELECT lower(trim(m.email))
  INTO v_member_email
  FROM public.members m
  WHERE m.id = v_current_member;

  IF v_member_email IS NULL
     OR v_member_email IS DISTINCT FROM lower(trim(v_invite.email)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'EMAIL_MISMATCH',
      'error_message', 'L''invito è stato inviato a un''altra email. Accedi con l''account corretto.'
    );
  END IF;

  IF public.is_band_member(v_invite.band_id, v_current_member) THEN
    UPDATE public.band_invites
    SET status = 'accepted'::public.band_invite_status
    WHERE id = v_invite.id;

    RETURN jsonb_build_object(
      'success', true,
      'band_id', v_invite.band_id,
      'member_status', (
        SELECT bm.status
        FROM public.band_members bm
        WHERE bm.band_id = v_invite.band_id
          AND bm.member_id = v_current_member
      ),
      'already_member', true
    );
  END IF;

  IF public.member_quota_ok(v_current_member) THEN
    v_status := 'active'::public.band_member_status;
  ELSE
    v_status := 'pending_quota'::public.band_member_status;
  END IF;

  INSERT INTO public.band_members (
    band_id,
    member_id,
    status,
    role,
    joined_at,
    invited_email
  )
  VALUES (
    v_invite.band_id,
    v_current_member,
    v_status,
    'member'::public.band_member_role,
    now(),
    lower(trim(v_invite.email))
  );

  UPDATE public.band_invites
  SET status = 'accepted'::public.band_invite_status
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'success', true,
    'band_id', v_invite.band_id,
    'member_status', v_status,
    'already_member', false
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_MEMBER',
      'error_message', 'Sei già membro di questa band.'
    );
END;
$$;

COMMENT ON FUNCTION public.accept_band_invite(TEXT) IS
  'Accetta invito band via token; imposta active se quota ok altrimenti pending_quota.';

GRANT EXECUTE ON FUNCTION public.accept_band_invite(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_my_bands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_bands()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_bands          JSONB;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'band_id', b.id,
        'name', b.name,
        'founder_member_id', b.founder_member_id,
        'created_at', b.created_at,
        'updated_at', b.updated_at,
        'my_role', bm.role,
        'my_status', bm.status,
        'member_count', stats.member_count,
        'active_member_count', stats.active_member_count,
        'all_quota_ok', public.band_all_members_quota_ok(b.id)
      )
      ORDER BY b.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_bands
  FROM public.band_members bm
  JOIN public.bands b ON b.id = bm.band_id
  JOIN LATERAL (
    SELECT
      COUNT(*)::INTEGER AS member_count,
      COUNT(*) FILTER (
        WHERE bm2.status = 'active'::public.band_member_status
      )::INTEGER AS active_member_count
    FROM public.band_members bm2
    WHERE bm2.band_id = b.id
  ) stats ON true
  WHERE bm.member_id = v_current_member;

  RETURN jsonb_build_object(
    'success', true,
    'bands', v_bands
  );
END;
$$;

COMMENT ON FUNCTION public.list_my_bands() IS
  'Band dell''associato corrente con conteggi membri e stato quota collettivo.';

GRANT EXECUTE ON FUNCTION public.list_my_bands() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_payment_items ENABLE ROW LEVEL SECURITY;

-- bands
CREATE POLICY "bands_select_member"
  ON public.bands FOR SELECT
  TO authenticated
  USING (public.is_band_member(id));

CREATE POLICY "bands_select_staff"
  ON public.bands FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "bands_update_founder"
  ON public.bands FOR UPDATE
  TO authenticated
  USING (public.is_band_founder(id))
  WITH CHECK (public.is_band_founder(id));

CREATE POLICY "bands_select_staff_manage"
  ON public.bands FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- band_members
CREATE POLICY "band_members_select_own_band"
  ON public.band_members FOR SELECT
  TO authenticated
  USING (public.is_band_member(band_id));

CREATE POLICY "band_members_select_staff"
  ON public.band_members FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "band_members_insert_founder"
  ON public.band_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_band_founder(band_id));

CREATE POLICY "band_members_update_founder"
  ON public.band_members FOR UPDATE
  TO authenticated
  USING (public.is_band_founder(band_id))
  WITH CHECK (public.is_band_founder(band_id));

CREATE POLICY "band_members_delete_own"
  ON public.band_members FOR DELETE
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND role <> 'founder'::public.band_member_role
  );

CREATE POLICY "band_members_delete_founder"
  ON public.band_members FOR DELETE
  TO authenticated
  USING (public.is_band_founder(band_id));

CREATE POLICY "band_members_manage_staff"
  ON public.band_members FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- band_invites
CREATE POLICY "band_invites_select_founder"
  ON public.band_invites FOR SELECT
  TO authenticated
  USING (
    public.is_band_founder(band_id)
    OR invited_by_member_id = public.current_member_id()
  );

CREATE POLICY "band_invites_select_staff"
  ON public.band_invites FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "band_invites_insert_founder"
  ON public.band_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_band_founder(band_id)
    AND invited_by_member_id = public.current_member_id()
  );

CREATE POLICY "band_invites_update_founder"
  ON public.band_invites FOR UPDATE
  TO authenticated
  USING (public.is_band_founder(band_id))
  WITH CHECK (public.is_band_founder(band_id));

CREATE POLICY "band_invites_manage_staff"
  ON public.band_invites FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- quota_payments
CREATE POLICY "quota_payments_select_own"
  ON public.quota_payments FOR SELECT
  TO authenticated
  USING (paid_by_member_id = public.current_member_id());

CREATE POLICY "quota_payments_select_staff"
  ON public.quota_payments FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

-- quota_payment_items
CREATE POLICY "quota_payment_items_select_beneficiary"
  ON public.quota_payment_items FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    OR paid_by_member_id = public.current_member_id()
  );

CREATE POLICY "quota_payment_items_select_staff"
  ON public.quota_payment_items FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

-- Inserts on quota tables via SECURITY DEFINER RPCs (future Stripe webhook)
