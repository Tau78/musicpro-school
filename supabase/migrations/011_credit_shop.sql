-- MusicPro School — SHOP crediti (Fase 2)
-- 1 credito = 1 ora di prenotazione sala

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.credit_transaction_type AS ENUM (
  'purchase',
  'debit',
  'hold',
  'release',
  'refund',
  'adjustment',
  'penalty'
);

-- ---------------------------------------------------------------------------
-- credit_packages — pacchetti acquistabili in SHOP
-- ---------------------------------------------------------------------------
CREATE TABLE public.credit_packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  credits       INTEGER NOT NULL,
  price_eur     NUMERIC(10, 2) NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credit_packages_credits_positive CHECK (credits > 0),
  CONSTRAINT credit_packages_price_non_negative CHECK (price_eur >= 0)
);

COMMENT ON TABLE public.credit_packages IS
  'Pacchetti crediti SHOP — configurati da admin/segreteria. 1 credito = 1 ora sala.';

CREATE INDEX idx_credit_packages_enabled_sort
  ON public.credit_packages (enabled, sort_order, name)
  WHERE enabled = true;

CREATE TRIGGER trg_credit_packages_updated_at
  BEFORE UPDATE ON public.credit_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- credit_purchases — acquisti Stripe da SHOP
-- ---------------------------------------------------------------------------
CREATE TABLE public.credit_purchases (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  package_id               UUID NOT NULL REFERENCES public.credit_packages (id) ON DELETE RESTRICT,
  credits_granted          INTEGER NOT NULL,
  amount_paid_eur          NUMERIC(10, 2) NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_event_id          TEXT,
  payment_link_id          TEXT,
  payment_status           TEXT NOT NULL DEFAULT 'pending',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credit_purchases_credits_granted_positive CHECK (credits_granted > 0),
  CONSTRAINT credit_purchases_amount_non_negative CHECK (amount_paid_eur >= 0),
  CONSTRAINT credit_purchases_payment_status_check
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'))
);

COMMENT ON TABLE public.credit_purchases IS
  'Acquisti pacchetti crediti via Stripe SHOP.';

CREATE INDEX idx_credit_purchases_member_created
  ON public.credit_purchases (member_id, created_at DESC);

CREATE INDEX idx_credit_purchases_payment_intent
  ON public.credit_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- credit_transactions — ledger movimenti crediti
-- ---------------------------------------------------------------------------
CREATE TABLE public.credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  amount      INTEGER NOT NULL,
  type        public.credit_transaction_type NOT NULL,
  booking_id  UUID REFERENCES public.bookings (id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES public.credit_purchases (id) ON DELETE SET NULL,
  reason      TEXT,
  created_by  UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_transactions IS
  'Ledger crediti: amount positivo = accredito, negativo = addebito/hold.';

COMMENT ON COLUMN public.credit_transactions.amount IS
  'Positivo = accredito; negativo = addebito o hold temporaneo.';

CREATE INDEX idx_credit_transactions_member_created
  ON public.credit_transactions (member_id, created_at DESC);

CREATE INDEX idx_credit_transactions_booking
  ON public.credit_transactions (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX idx_credit_transactions_purchase
  ON public.credit_transactions (purchase_id)
  WHERE purchase_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- bookings — estensioni pagamento crediti
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS credits_used INTEGER,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS credits_held INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'credits'));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_credits_used_non_negative;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_credits_used_non_negative
  CHECK (credits_used IS NULL OR credits_used >= 0);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_credits_held_non_negative;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_credits_held_non_negative
  CHECK (credits_held >= 0);

COMMENT ON COLUMN public.bookings.credits_used IS
  'Crediti addebitati definitivamente per questa prenotazione (1 credito = 1 ora).';

COMMENT ON COLUMN public.bookings.credits_held IS
  'Crediti riservati (hold) fino ad approvazione admin o conferma.';

COMMENT ON COLUMN public.bookings.payment_method IS
  'stripe | credits — metodo di pagamento scelto dall''associato.';

-- ---------------------------------------------------------------------------
-- Idempotency (webhook Stripe SHOP)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_credit_shop_payment_receipts (
  payment_intent_id TEXT PRIMARY KEY,
  purchase_id       UUID NOT NULL REFERENCES public.credit_purchases (id) ON DELETE CASCADE,
  stripe_event_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_credit_shop_payment_receipts IS
  'Idempotenza webhook Stripe SHOP crediti. Solo service_role.';

CREATE INDEX IF NOT EXISTS stripe_credit_shop_payment_receipts_purchase_id_idx
  ON public.stripe_credit_shop_payment_receipts (purchase_id);

-- ---------------------------------------------------------------------------
-- Internal balance helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_credit_held(p_member_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(b.credits_held)::INTEGER
      FROM public.bookings b
      WHERE b.member_id = p_member_id
        AND b.credits_held > 0
        AND b.status <> 'cancelled'::public.booking_status
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.member_credit_available(p_member_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(ct.amount)::INTEGER
      FROM public.credit_transactions ct
      WHERE ct.member_id = p_member_id
    ),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- get_member_credit_balance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_credit_balance(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available INTEGER;
  v_held INTEGER;
  v_total INTEGER;
BEGIN
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBER',
      'error_message', 'member_id obbligatorio.'
    );
  END IF;

  IF p_member_id IS DISTINCT FROM public.current_member_id()
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Puoi consultare solo il tuo saldo crediti.'
    );
  END IF;

  v_available := public.member_credit_available(p_member_id);
  v_held := public.member_credit_held(p_member_id);
  v_total := v_available + v_held;

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'available', v_available,
    'held', v_held,
    'total', v_total
  );
END;
$$;

COMMENT ON FUNCTION public.get_member_credit_balance IS
  'Saldo crediti associato: available (spendibili), held (riservati), total (available + held).';

GRANT EXECUTE ON FUNCTION public.get_member_credit_balance(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_active_credit_packages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_active_credit_packages()
RETURNS SETOF public.credit_packages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.*
  FROM public.credit_packages cp
  WHERE cp.enabled = true
  ORDER BY cp.sort_order ASC, cp.credits ASC, cp.name ASC;
$$;

COMMENT ON FUNCTION public.list_active_credit_packages IS
  'Pacchetti crediti attivi per SHOP, ordinati per sort_order.';

GRANT EXECUTE ON FUNCTION public.list_active_credit_packages() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- admin_adjust_member_credits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_member_credits(
  p_member_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance JSONB;
BEGIN
  IF public.current_member_id() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Solo admin/segreteria possono rettificare i crediti.'
    );
  END IF;

  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBER',
      'error_message', 'member_id obbligatorio.'
    );
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_AMOUNT',
      'error_message', 'Importo non valido (deve essere diverso da zero).'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Associato non trovato.'
    );
  END IF;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    reason,
    created_by
  )
  VALUES (
    p_member_id,
    p_amount,
    'adjustment'::public.credit_transaction_type,
    nullif(trim(coalesce(p_reason, '')), ''),
    public.current_member_id()
  );

  v_balance := public.get_member_credit_balance(p_member_id);

  RETURN jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'amount', p_amount,
    'available', v_balance -> 'available',
    'held', v_balance -> 'held',
    'total', v_balance -> 'total'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_adjust_member_credits IS
  'Admin/segreteria: rettifica manuale saldo crediti (ledger adjustment).';

GRANT EXECUTE ON FUNCTION public.admin_adjust_member_credits(UUID, INTEGER, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- apply_stripe_credit_shop_payment — webhook RPC (idempotente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stripe_credit_shop_payment(
  p_member_ref TEXT,
  p_package_id UUID,
  p_stripe_event_id TEXT DEFAULT NULL,
  p_stripe_event_type TEXT DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_payment_link_id TEXT DEFAULT NULL,
  p_amount_cents INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_ref TEXT := nullif(trim(coalesce(p_member_ref, '')), '');
  v_member_id UUID;
  v_package public.credit_packages%ROWTYPE;
  v_purchase public.credit_purchases%ROWTYPE;
  v_purchase_id UUID;
  v_amount_eur NUMERIC(10, 2);
BEGIN
  IF v_member_ref IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Riferimento associato mancante (mp_id_membro).'
    );
  END IF;

  IF p_package_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pacchetto crediti mancante (package_id).'
    );
  END IF;

  IF p_payment_intent_id IS NOT NULL AND trim(p_payment_intent_id) <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.stripe_credit_shop_payment_receipts r
      WHERE r.payment_intent_id = trim(p_payment_intent_id)
    ) THEN
      SELECT cp.* INTO v_purchase
      FROM public.stripe_credit_shop_payment_receipts r
      JOIN public.credit_purchases cp ON cp.id = r.purchase_id
      WHERE r.payment_intent_id = trim(p_payment_intent_id)
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'purchase_id', v_purchase.id,
        'member_id', v_purchase.member_id,
        'message', 'Pagamento SHOP gia elaborato (idempotenza Stripe).'
      );
    END IF;
  END IF;

  BEGIN
    v_member_id := v_member_ref::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Riferimento associato non valido.',
        'member_ref', v_member_ref
      );
  END;

  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_member_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Associato non trovato.',
      'member_ref', v_member_ref
    );
  END IF;

  SELECT * INTO v_package
  FROM public.credit_packages cp
  WHERE cp.id = p_package_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pacchetto crediti non trovato.',
      'package_id', p_package_id
    );
  END IF;

  IF NOT v_package.enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pacchetto crediti non attivo.',
      'package_id', p_package_id
    );
  END IF;

  v_amount_eur := CASE
    WHEN p_amount_cents IS NOT NULL AND p_amount_cents >= 0
      THEN round(p_amount_cents::NUMERIC / 100, 2)
    ELSE v_package.price_eur
  END;

  INSERT INTO public.credit_purchases (
    member_id,
    package_id,
    credits_granted,
    amount_paid_eur,
    stripe_payment_intent_id,
    stripe_event_id,
    payment_link_id,
    payment_status
  )
  VALUES (
    v_member_id,
    v_package.id,
    v_package.credits,
    v_amount_eur,
    nullif(trim(coalesce(p_payment_intent_id, '')), ''),
    p_stripe_event_id,
    nullif(trim(coalesce(p_payment_link_id, '')), ''),
    'paid'
  )
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    purchase_id,
    reason
  )
  VALUES (
    v_member_id,
    v_package.credits,
    'purchase'::public.credit_transaction_type,
    v_purchase_id,
    format('Acquisto pacchetto %s', v_package.name)
  );

  IF p_payment_intent_id IS NOT NULL AND trim(p_payment_intent_id) <> '' THEN
    INSERT INTO public.stripe_credit_shop_payment_receipts (
      payment_intent_id,
      purchase_id,
      stripe_event_id
    )
    VALUES (trim(p_payment_intent_id), v_purchase_id, p_stripe_event_id)
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'member_id', v_member_id,
    'package_id', v_package.id,
    'credits_granted', v_package.credits,
    'amount_paid_eur', v_amount_eur
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_credit_shop_payment(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_stripe_credit_shop_payment(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_credit_shop_payment IS
  'Webhook Stripe SHOP: accredita crediti da pacchetto. p_member_ref = members.id (uuid).';

-- ---------------------------------------------------------------------------
-- hold_booking_credits — riserva crediti (pending_approval)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_booking_credits(
  p_booking_id UUID,
  p_credits INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_available INTEGER;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_CREDITS',
      'error_message', 'Numero crediti non valido.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi gestire i crediti di questa prenotazione.'
    );
  END IF;

  IF v_booking.credits_held > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_HELD',
      'error_message', 'Crediti gia riservati su questa prenotazione.',
      'credits_held', v_booking.credits_held
    );
  END IF;

  v_available := public.member_credit_available(v_booking.member_id);

  IF v_available < p_credits THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INSUFFICIENT_CREDITS',
      'error_message', 'Saldo crediti insufficiente.',
      'available', v_available,
      'required', p_credits
    );
  END IF;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    booking_id,
    reason,
    created_by
  )
  VALUES (
    v_booking.member_id,
    -p_credits,
    'hold'::public.credit_transaction_type,
    p_booking_id,
    format('Hold crediti prenotazione %s', p_booking_id),
    v_current_member
  );

  UPDATE public.bookings
  SET
    credits_held = p_credits,
    payment_method = 'credits'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_held', p_credits,
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

COMMENT ON FUNCTION public.hold_booking_credits IS
  'Riserva crediti su prenotazione pending_approval. Integrazione completa con approve/reject in fase successiva.';

GRANT EXECUTE ON FUNCTION public.hold_booking_credits(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- release_booking_credits — annulla hold
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_booking_credits(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_credits INTEGER;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi gestire i crediti di questa prenotazione.'
    );
  END IF;

  v_credits := v_booking.credits_held;

  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'credits_released', 0,
      'message', 'Nessun hold da rilasciare.'
    );
  END IF;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    booking_id,
    reason,
    created_by
  )
  VALUES (
    v_booking.member_id,
    v_credits,
    'release'::public.credit_transaction_type,
    p_booking_id,
    format('Release hold prenotazione %s', p_booking_id),
    v_current_member
  );

  UPDATE public.bookings
  SET credits_held = 0
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_released', v_credits,
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

COMMENT ON FUNCTION public.release_booking_credits IS
  'Rilascia hold crediti (es. rifiuto admin). Chiamare prima di debit se hold attivo.';

GRANT EXECUTE ON FUNCTION public.release_booking_credits(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- debit_booking_credits — addebito definitivo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_booking_credits(
  p_booking_id UUID,
  p_credits INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_debit INTEGER;
  v_available INTEGER;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL
     AND current_setting('role', true) <> 'service_role' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_current_member IS NOT NULL
     AND v_booking.member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi addebitare crediti su questa prenotazione.'
    );
  END IF;

  v_debit := COALESCE(
    p_credits,
    v_booking.credits_held,
    v_booking.credits_used,
    CEIL(v_booking.duration_minutes::NUMERIC / 60)::INTEGER
  );

  IF v_debit IS NULL OR v_debit <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_CREDITS',
      'error_message', 'Numero crediti da addebitare non valido.'
    );
  END IF;

  IF v_booking.credits_used IS NOT NULL AND v_booking.credits_used > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'booking_id', p_booking_id,
      'credits_used', v_booking.credits_used,
      'message', 'Crediti gia addebitati su questa prenotazione.'
    );
  END IF;

  -- Se c''e un hold, convertilo: release contabile + debit (netto = addebito reale).
  IF v_booking.credits_held > 0 THEN
    IF v_booking.credits_held <> v_debit THEN
      -- TODO Fase 2: gestire differenza hold vs debit finale (modifica durata admin).
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'HOLD_MISMATCH',
        'error_message', 'Importo addebito diverso dai crediti in hold.',
        'credits_held', v_booking.credits_held,
        'requested_debit', v_debit
      );
    END IF;

    INSERT INTO public.credit_transactions (
      member_id,
      amount,
      type,
      booking_id,
      reason,
      created_by
    )
    VALUES (
      v_booking.member_id,
      v_booking.credits_held,
      'release'::public.credit_transaction_type,
      p_booking_id,
      format('Release hold prima addebito prenotazione %s', p_booking_id),
      v_current_member
    );
  ELSE
    v_available := public.member_credit_available(v_booking.member_id);

    IF v_available < v_debit THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INSUFFICIENT_CREDITS',
        'error_message', 'Saldo crediti insufficiente.',
        'available', v_available,
        'required', v_debit
      );
    END IF;
  END IF;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    booking_id,
    reason,
    created_by
  )
  VALUES (
    v_booking.member_id,
    -v_debit,
    'debit'::public.credit_transaction_type,
    p_booking_id,
    format('Addebito crediti prenotazione %s', p_booking_id),
    v_current_member
  );

  UPDATE public.bookings
  SET
    credits_used = v_debit,
    credits_held = 0,
    payment_method = 'credits'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_used', v_debit,
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

COMMENT ON FUNCTION public.debit_booking_credits IS
  'Addebito definitivo crediti su prenotazione confermata. Con hold attivo: release+debit atomico.';

GRANT EXECUTE ON FUNCTION public.debit_booking_credits(UUID, INTEGER) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_credit_shop_payment_receipts ENABLE ROW LEVEL SECURITY;

-- credit_packages: lettura pubblica pacchetti attivi; CRUD admin/segreteria
CREATE POLICY "credit_packages_select_enabled"
  ON public.credit_packages FOR SELECT
  TO authenticated, anon
  USING (enabled = true);

CREATE POLICY "credit_packages_select_staff"
  ON public.credit_packages FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "credit_packages_manage_staff"
  ON public.credit_packages FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- credit_purchases: associato legge i propri acquisti
CREATE POLICY "credit_purchases_select_own"
  ON public.credit_purchases FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY "credit_purchases_select_staff"
  ON public.credit_purchases FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

-- credit_transactions: associato legge i propri movimenti
CREATE POLICY "credit_transactions_select_own"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY "credit_transactions_select_staff"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

-- Webhook idempotency — solo service_role
REVOKE ALL ON TABLE public.stripe_credit_shop_payment_receipts FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stripe_credit_shop_payment_receipts TO service_role;

-- Inserts su purchases/transactions via RPC SECURITY DEFINER (no policy INSERT per authenticated)

GRANT SELECT ON TABLE public.credit_packages TO authenticated, anon;
GRANT SELECT ON TABLE public.credit_purchases TO authenticated;
GRANT SELECT ON TABLE public.credit_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed — pacchetti esempio (disabilitabile in admin)
-- ---------------------------------------------------------------------------
INSERT INTO public.credit_packages (name, credits, price_eur, enabled, sort_order, description)
VALUES
  (
    'Pacchetto 5 ore',
    5,
    45.00,
    true,
    1,
    '5 crediti (5 ore sala). Risparmio vs tariffa oraria piena.'
  ),
  (
    'Pacchetto 10 ore',
    10,
    80.00,
    true,
    2,
    '10 crediti (10 ore sala). Pacchetto consigliato.'
  ),
  (
    'Pacchetto 20 ore',
    20,
    150.00,
    false,
    3,
    '20 crediti (20 ore sala). Attivare in admin quando disponibile.'
  );
