-- MusicPro School — Fase 3 Wave 3.1: webhook quota associativa + multi-pay
-- Depends on: 022_bands_and_quota_payments.sql

-- ---------------------------------------------------------------------------
-- Idempotency (webhook Stripe quota)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_quota_payment_receipts (
  stripe_event_id   TEXT PRIMARY KEY,
  payment_intent_id TEXT,
  flow              TEXT NOT NULL,
  enrollment_id     UUID REFERENCES public.enrollments (id) ON DELETE SET NULL,
  quota_payment_id  UUID REFERENCES public.quota_payments (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_quota_payment_receipts IS
  'Idempotenza webhook Stripe quota (associativa e multi-pay). Solo service_role.';

CREATE UNIQUE INDEX IF NOT EXISTS stripe_quota_payment_receipts_pi_idx
  ON public.stripe_quota_payment_receipts (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.stripe_quota_payment_receipts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper — promote band members when quota ok
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_band_members_on_quota(
  p_member_id UUID,
  p_fiscal_year INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
  v_rows INTEGER;
BEGIN
  IF p_member_id IS NULL THEN
    RETURN 0;
  END IF;

  v_year := COALESCE(p_fiscal_year, public.current_fiscal_year());

  IF NOT public.member_quota_ok(p_member_id, v_year) THEN
    RETURN 0;
  END IF;

  UPDATE public.band_members bm
  SET status = 'active'::public.band_member_status
  WHERE bm.member_id = p_member_id
    AND bm.status = 'pending_quota'::public.band_member_status;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.promote_band_members_on_quota(UUID, INTEGER) IS
  'Promuove pending_quota → active per un membro se la quota annuale risulta pagata.';

-- ---------------------------------------------------------------------------
-- Helper — annual quota amount for fiscal year
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_amount_eur_for_year(
  p_fiscal_year INTEGER DEFAULT NULL
)
RETURNS NUMERIC(10, 2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
  v_amount NUMERIC(10, 2);
BEGIN
  v_year := COALESCE(p_fiscal_year, public.current_fiscal_year());

  SELECT aqs.amount_eur
  INTO v_amount
  FROM public.annual_quota_settings aqs
  WHERE aqs.fiscal_year = v_year
  LIMIT 1;

  RETURN COALESCE(v_amount, 15.00);
END;
$$;

-- ---------------------------------------------------------------------------
-- create_quota_payment_checkout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_quota_payment_checkout(
  p_member_ids UUID[],
  p_fiscal_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_year           INTEGER;
  v_amount_eur     NUMERIC(10, 2);
  v_total_eur      NUMERIC(10, 2) := 0;
  v_member_id      UUID;
  v_quota_payment_id UUID;
  v_distinct_ids   UUID[];
  v_count          INTEGER;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBERS',
      'error_message', 'Seleziona almeno un membro.'
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT mid), ARRAY[]::UUID[])
  INTO v_distinct_ids
  FROM unnest(p_member_ids) AS mid
  WHERE mid IS NOT NULL;

  v_count := COALESCE(array_length(v_distinct_ids, 1), 0);

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBERS',
      'error_message', 'Seleziona almeno un membro valido.'
    );
  END IF;

  v_year := COALESCE(p_fiscal_year, public.current_fiscal_year());
  v_amount_eur := public.quota_amount_eur_for_year(v_year);

  FOREACH v_member_id IN ARRAY v_distinct_ids
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_member_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'MEMBER_NOT_FOUND',
        'error_message', 'Uno degli associati selezionati non esiste.'
      );
    END IF;

    IF public.member_quota_ok(v_member_id, v_year) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QUOTA_ALREADY_PAID',
        'error_message', 'Uno degli associati selezionati ha già pagato la quota.'
      );
    END IF;

    IF v_member_id <> v_current_member THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.band_members bm_self
        JOIN public.band_members bm_peer
          ON bm_peer.band_id = bm_self.band_id
        WHERE bm_self.member_id = v_current_member
          AND bm_peer.member_id = v_member_id
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'NOT_AUTHORIZED',
          'error_message', 'Puoi pagare la quota solo per te o per membri della tua band.'
        );
      END IF;
    END IF;
  END LOOP;

  v_total_eur := round(v_amount_eur * v_count, 2);

  INSERT INTO public.quota_payments (
    paid_by_member_id,
    total_amount_eur,
    fiscal_year
  )
  VALUES (
    v_current_member,
    v_total_eur,
    v_year
  )
  RETURNING id INTO v_quota_payment_id;

  FOREACH v_member_id IN ARRAY v_distinct_ids
  LOOP
    INSERT INTO public.quota_payment_items (
      quota_payment_id,
      member_id,
      amount_eur,
      fiscal_year,
      paid_by_member_id,
      status
    )
    VALUES (
      v_quota_payment_id,
      v_member_id,
      v_amount_eur,
      v_year,
      v_current_member,
      'pending'::public.quota_payment_item_status
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'quota_payment_id', v_quota_payment_id,
    'total_amount_eur', v_total_eur,
    'fiscal_year', v_year,
    'member_count', v_count
  );
END;
$$;

COMMENT ON FUNCTION public.create_quota_payment_checkout(UUID[], INTEGER) IS
  'Crea checkout quota multi-membro (pending). Caller autenticato: self o peer band.';

GRANT EXECUTE ON FUNCTION public.create_quota_payment_checkout(UUID[], INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- apply_stripe_quota_payment — webhook RPC (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stripe_quota_payment(
  p_stripe_event_id TEXT,
  p_stripe_event_type TEXT,
  p_payment_intent_id TEXT,
  p_payment_link_id TEXT,
  p_amount_cents INTEGER,
  p_flow TEXT,
  p_enrollment_id UUID DEFAULT NULL,
  p_quota_payment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id       TEXT := nullif(trim(coalesce(p_stripe_event_id, '')), '');
  v_flow           TEXT := nullif(trim(coalesce(p_flow, '')), '');
  v_pi_id          TEXT := nullif(trim(coalesce(p_payment_intent_id, '')), '');
  v_amount_eur     NUMERIC(10, 2);
  v_enrollment     public.enrollments%ROWTYPE;
  v_quota_payment  public.quota_payments%ROWTYPE;
  v_item           public.quota_payment_items%ROWTYPE;
  v_member_id      UUID;
  v_rows           INTEGER;
BEGIN
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Evento Stripe mancante (stripe_event_id).'
    );
  END IF;

  IF v_flow IS NULL OR v_flow NOT IN ('quota_associativa', 'quota_multi_pay') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Flow quota non valido.',
      'flow', v_flow
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stripe_quota_payment_receipts r
    WHERE r.stripe_event_id = v_event_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'flow', v_flow,
      'message', 'Evento Stripe gia elaborato (idempotenza).'
    );
  END IF;

  IF v_pi_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.stripe_quota_payment_receipts r
    WHERE r.payment_intent_id = v_pi_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'flow', v_flow,
      'message', 'Pagamento quota gia elaborato (idempotenza payment_intent).'
    );
  END IF;

  v_amount_eur := CASE
    WHEN p_amount_cents IS NOT NULL AND p_amount_cents >= 0
      THEN round(p_amount_cents::NUMERIC / 100, 2)
    ELSE NULL
  END;

  IF v_flow = 'quota_associativa' THEN
    IF p_enrollment_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'ID iscrizione mancante (mp_id_iscrizione).'
      );
    END IF;

    SELECT *
    INTO v_enrollment
    FROM public.enrollments e
    WHERE e.id = p_enrollment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Iscrizione non trovata.',
        'enrollment_id', p_enrollment_id
      );
    END IF;

    v_member_id := v_enrollment.member_id;

    IF v_member_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Iscrizione senza associato collegato.',
        'enrollment_id', p_enrollment_id
      );
    END IF;

    IF upper(v_enrollment.payment_status) = 'PAGATO' THEN
      INSERT INTO public.stripe_quota_payment_receipts (
        stripe_event_id,
        payment_intent_id,
        flow,
        enrollment_id
      )
      VALUES (v_event_id, v_pi_id, v_flow, p_enrollment_id)
      ON CONFLICT (stripe_event_id) DO NOTHING;

      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'flow', v_flow,
        'enrollment_id', p_enrollment_id,
        'member_id', v_member_id,
        'message', 'Quota associativa gia registrata.'
      );
    END IF;

    IF v_amount_eur IS NULL THEN
      v_amount_eur := round(v_enrollment.amount_centesimi::NUMERIC / 100, 2);
    END IF;

    UPDATE public.enrollments
    SET
      payment_status = 'PAGATO',
      stripe_payment_intent_id = coalesce(v_pi_id, stripe_payment_intent_id),
      payment_link_id = coalesce(
        nullif(trim(coalesce(p_payment_link_id, '')), ''),
        payment_link_id
      ),
      paid_at = now(),
      payment_total_centesimi = coalesce(p_amount_cents, payment_total_centesimi),
      stripe_gross_centesimi = coalesce(p_amount_cents, stripe_gross_centesimi)
    WHERE id = v_enrollment.id;

    INSERT INTO public.member_annual_quotas (
      member_id,
      fiscal_year,
      paid_at,
      amount_paid_eur,
      amount_due_eur
    )
    VALUES (
      v_member_id,
      v_enrollment.fiscal_year,
      now(),
      v_amount_eur,
      round(v_enrollment.amount_centesimi::NUMERIC / 100, 2)
    )
    ON CONFLICT (member_id, fiscal_year)
    DO UPDATE SET
      paid_at = EXCLUDED.paid_at,
      amount_paid_eur = EXCLUDED.amount_paid_eur,
      amount_due_eur = COALESCE(
        public.member_annual_quotas.amount_due_eur,
        EXCLUDED.amount_due_eur
      ),
      updated_at = now();

    PERFORM public.promote_band_members_on_quota(v_member_id, v_enrollment.fiscal_year);

    INSERT INTO public.stripe_quota_payment_receipts (
      stripe_event_id,
      payment_intent_id,
      flow,
      enrollment_id
    )
    VALUES (v_event_id, v_pi_id, v_flow, p_enrollment_id);

    RETURN jsonb_build_object(
      'success', true,
      'flow', v_flow,
      'enrollment_id', p_enrollment_id,
      'member_id', v_member_id,
      'amount_paid_eur', v_amount_eur
    );
  END IF;

  -- quota_multi_pay
  IF p_quota_payment_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'ID pagamento quota mancante (mp_quota_payment_id).'
    );
  END IF;

  SELECT *
  INTO v_quota_payment
  FROM public.quota_payments qp
  WHERE qp.id = p_quota_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pagamento quota multi non trovato.',
      'quota_payment_id', p_quota_payment_id
    );
  END IF;

  IF v_pi_id IS NOT NULL AND v_quota_payment.stripe_payment_intent_id = v_pi_id THEN
    INSERT INTO public.stripe_quota_payment_receipts (
      stripe_event_id,
      payment_intent_id,
      flow,
      quota_payment_id
    )
    VALUES (v_event_id, v_pi_id, v_flow, p_quota_payment_id)
    ON CONFLICT (stripe_event_id) DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'flow', v_flow,
      'quota_payment_id', p_quota_payment_id,
      'message', 'Pagamento quota multi gia registrato.'
    );
  END IF;

  UPDATE public.quota_payments
  SET stripe_payment_intent_id = coalesce(v_pi_id, stripe_payment_intent_id)
  WHERE id = v_quota_payment.id;

  FOR v_item IN
    SELECT qpi.*
    FROM public.quota_payment_items qpi
    WHERE qpi.quota_payment_id = v_quota_payment.id
      AND qpi.status = 'pending'::public.quota_payment_item_status
  LOOP
    UPDATE public.quota_payment_items
    SET status = 'completed'::public.quota_payment_item_status
    WHERE id = v_item.id;

    INSERT INTO public.member_annual_quotas (
      member_id,
      fiscal_year,
      paid_at,
      amount_paid_eur,
      amount_due_eur
    )
    VALUES (
      v_item.member_id,
      v_item.fiscal_year,
      now(),
      v_item.amount_eur,
      v_item.amount_eur
    )
    ON CONFLICT (member_id, fiscal_year)
    DO UPDATE SET
      paid_at = EXCLUDED.paid_at,
      amount_paid_eur = EXCLUDED.amount_paid_eur,
      updated_at = now();

    PERFORM public.promote_band_members_on_quota(v_item.member_id, v_item.fiscal_year);
  END LOOP;

  INSERT INTO public.stripe_quota_payment_receipts (
    stripe_event_id,
    payment_intent_id,
    flow,
    quota_payment_id
  )
  VALUES (v_event_id, v_pi_id, v_flow, p_quota_payment_id);

  SELECT COUNT(*)::INTEGER
  INTO v_rows
  FROM public.quota_payment_items qpi
  WHERE qpi.quota_payment_id = v_quota_payment.id
    AND qpi.status = 'completed'::public.quota_payment_item_status;

  RETURN jsonb_build_object(
    'success', true,
    'flow', v_flow,
    'quota_payment_id', p_quota_payment_id,
    'items_completed', v_rows,
    'amount_paid_eur', coalesce(v_amount_eur, v_quota_payment.total_amount_eur)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_quota_payment(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_stripe_quota_payment(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_quota_payment IS
  'Webhook Stripe quota: quota_associativa (enrollment) o quota_multi_pay (band).';
