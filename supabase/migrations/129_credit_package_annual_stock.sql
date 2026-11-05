-- Pacchetti shop: prezzo, crediti (sconto sul valore) e pezzi dell'anno.
-- Il 1° gennaio (Europe/Rome) i venduti tornano a zero e si ricaricano i pezzi per anno.
-- A pezzi finiti l'associato non compra. Admin e un pagamento Nexi già avviato scalano comunque.

ALTER TABLE public.credit_packages
  ADD COLUMN IF NOT EXISTS annual_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_year INTEGER NOT NULL
    DEFAULT (EXTRACT(YEAR FROM (timezone('Europe/Rome', now()))))::INTEGER,
  ADD COLUMN IF NOT EXISTS stock_sold INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.credit_packages
  DROP CONSTRAINT IF EXISTS credit_packages_annual_quantity_non_negative;

ALTER TABLE public.credit_packages
  ADD CONSTRAINT credit_packages_annual_quantity_non_negative
  CHECK (annual_quantity >= 0);

ALTER TABLE public.credit_packages
  DROP CONSTRAINT IF EXISTS credit_packages_stock_sold_non_negative;

ALTER TABLE public.credit_packages
  ADD CONSTRAINT credit_packages_stock_sold_non_negative
  CHECK (stock_sold >= 0);

COMMENT ON COLUMN public.credit_packages.annual_quantity IS
  'Pezzi messi in vendita ogni 1° gennaio (fuso Europe/Rome).';

COMMENT ON COLUMN public.credit_packages.stock_year IS
  'Anno civile Europe/Rome a cui si riferisce stock_sold.';

COMMENT ON COLUMN public.credit_packages.stock_sold IS
  'Pezzi venduti nell''anno stock_year. Può superare annual_quantity se vende l''admin o un pagamento già avviato.';

-- ---------------------------------------------------------------------------
-- roll_credit_package_stock — azzera i venduti quando cambia l'anno
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roll_credit_package_stock(p_package_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := (EXTRACT(YEAR FROM (timezone('Europe/Rome', now()))))::INTEGER;
BEGIN
  UPDATE public.credit_packages
  SET stock_sold = 0,
      stock_year = v_year
  WHERE stock_year IS DISTINCT FROM v_year
    AND (p_package_id IS NULL OR id = p_package_id);
END;
$$;

COMMENT ON FUNCTION public.roll_credit_package_stock(UUID) IS
  'All''anno nuovo (Europe/Rome) riporta stock_sold a 0. I pezzi per anno restano quelli configurati.';

REVOKE ALL ON FUNCTION public.roll_credit_package_stock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.roll_credit_package_stock(UUID) TO authenticated, service_role;

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
    AND cp.annual_quantity > cp.stock_sold
  ORDER BY cp.sort_order ASC, cp.credits ASC, cp.name ASC;
$$;

COMMENT ON FUNCTION public.list_active_credit_packages IS
  'Pacchetti shop attivi con pezzi ancora disponibili nell''anno corrente.';

-- ---------------------------------------------------------------------------
-- apply_stripe_credit_shop_payment — scala un pezzo a pagamento riuscito
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

  PERFORM public.roll_credit_package_stock(p_package_id);

  SELECT * INTO v_package
  FROM public.credit_packages cp
  WHERE cp.id = p_package_id
  FOR UPDATE;

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
    payment_status,
    payment_method,
    paid_on
  )
  VALUES (
    v_member_id,
    v_package.id,
    v_package.credits,
    v_amount_eur,
    nullif(trim(coalesce(p_payment_intent_id, '')), ''),
    p_stripe_event_id,
    nullif(trim(coalesce(p_payment_link_id, '')), ''),
    'paid',
    'nexi',
    (timezone('Europe/Rome', now()))::date
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

  UPDATE public.credit_packages
  SET stock_sold = stock_sold + 1
  WHERE id = v_package.id;

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

COMMENT ON FUNCTION public.apply_stripe_credit_shop_payment(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER
) IS
  'Webhook SHOP: accredita i crediti e scala un pezzo. Un pagamento già avviato scala anche se i pezzi sono finiti.';

-- ---------------------------------------------------------------------------
-- admin_record_manual_credit_purchase — pacchetto facoltativo, anche esaurito
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC);

CREATE FUNCTION public.admin_record_manual_credit_purchase(
  p_member_id UUID,
  p_paid_on DATE,
  p_amount_eur NUMERIC,
  p_method TEXT,
  p_credits NUMERIC,
  p_package_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(10, 2);
  v_credits NUMERIC(12, 2);
  v_method TEXT;
  v_reason TEXT;
  v_purchase_id UUID;
  v_balance JSONB;
  v_available NUMERIC(12, 2);
  v_package public.credit_packages%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
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
        'error_message', 'Solo admin/segreteria possono registrare un acquisto crediti.'
      );
    END IF;
  END IF;

  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBER',
      'error_message', 'member_id obbligatorio.'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Associato non trovato.'
    );
  END IF;

  IF p_paid_on IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DATE',
      'error_message', 'Data di pagamento obbligatoria.'
    );
  END IF;

  v_method := nullif(trim(coalesce(p_method, '')), '');
  IF v_method IS NULL OR v_method NOT IN ('contanti', 'bonifico') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_METHOD',
      'error_message', 'Metodo di pagamento non valido (solo contanti o bonifico).'
    );
  END IF;

  IF p_package_id IS NOT NULL THEN
    PERFORM public.roll_credit_package_stock(p_package_id);

    SELECT * INTO v_package
    FROM public.credit_packages
    WHERE id = p_package_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_FOUND',
        'error_message', 'Pacchetto crediti non trovato.'
      );
    END IF;

    IF NOT v_package.enabled THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_ACTIVE',
        'error_message', 'Pacchetto crediti non attivo.'
      );
    END IF;

    v_amount := v_package.price_eur;
    v_credits := v_package.credits;
  ELSE
    v_amount := round(p_amount_eur, 2);
    IF v_amount IS NULL OR v_amount < 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_AMOUNT',
        'error_message', 'Importo non valido (deve essere maggiore o uguale a zero).'
      );
    END IF;

    v_credits := round(p_credits, 2);
    IF v_credits IS NULL OR v_credits <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_CREDITS',
        'error_message', 'Numero crediti non valido (deve essere maggiore di zero).'
      );
    END IF;
  END IF;

  v_reason := CASE v_method
    WHEN 'contanti' THEN 'Acquisto crediti (contanti)'
    WHEN 'bonifico' THEN 'Acquisto crediti (bonifico)'
  END;

  IF p_package_id IS NOT NULL THEN
    v_reason := v_reason || format(' — %s', v_package.name);
  END IF;

  INSERT INTO public.credit_purchases (
    member_id,
    package_id,
    credits_granted,
    amount_paid_eur,
    stripe_payment_intent_id,
    stripe_event_id,
    payment_link_id,
    payment_status,
    payment_method,
    paid_on
  )
  VALUES (
    p_member_id,
    p_package_id,
    v_credits,
    v_amount,
    NULL,
    NULL,
    NULL,
    'paid',
    v_method,
    p_paid_on
  )
  RETURNING id INTO v_purchase_id;

  INSERT INTO public.credit_transactions (
    member_id,
    amount,
    type,
    purchase_id,
    reason,
    created_by
  )
  VALUES (
    p_member_id,
    v_credits,
    'purchase'::public.credit_transaction_type,
    v_purchase_id,
    v_reason,
    public.current_member_id()
  );

  IF p_package_id IS NOT NULL THEN
    UPDATE public.credit_packages
    SET stock_sold = stock_sold + 1
    WHERE id = p_package_id;
  END IF;

  v_balance := public.get_member_credit_balance(p_member_id);
  v_available := (v_balance ->> 'available')::NUMERIC;
  IF v_available IS NULL THEN
    v_available := public.member_credit_available(p_member_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'member_id', p_member_id,
    'package_id', p_package_id,
    'credits_granted', v_credits,
    'amount_paid_eur', v_amount,
    'payment_method', v_method,
    'paid_on', p_paid_on,
    'available', v_available
  );
END;
$$;

COMMENT ON FUNCTION public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC, UUID) IS
  'Admin/segreteria: carico contanti o bonifico. Con pacchetto usa prezzo e crediti del listino e scala un pezzo anche se è esaurito.';

REVOKE ALL ON FUNCTION public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC, UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Listino 2026. I pacchetti attivi precedenti restano spenti (storico acquisti).
-- Crediti = prezzo / (1 − sconto). Arrotondamento a 2 decimali.
-- 80 / 0,95 = 84,21 · 150 / 0,90 = 166,67 · 250 / 0,85 = 294,12 · 350 / 0,80 = 437,50
-- ---------------------------------------------------------------------------
UPDATE public.credit_packages
SET enabled = false
WHERE enabled = true;

INSERT INTO public.credit_packages (
  name,
  credits,
  price_eur,
  enabled,
  sort_order,
  description,
  annual_quantity,
  stock_year,
  stock_sold
)
SELECT
  v.name,
  v.credits,
  v.price_eur,
  true,
  v.sort_order,
  v.description,
  v.annual_quantity,
  (EXTRACT(YEAR FROM (timezone('Europe/Rome', now()))))::INTEGER,
  0
FROM (
  VALUES
    (
      'Pacchetto 80 €'::TEXT,
      84.21::NUMERIC,
      80.00::NUMERIC,
      1,
      'Paghi 80 € e ricevi 84,21 crediti. Sconto 5%.'::TEXT,
      15
    ),
    (
      'Pacchetto 150 €',
      166.67,
      150.00,
      2,
      'Paghi 150 € e ricevi 166,67 crediti. Sconto 10%.',
      15
    ),
    (
      'Pacchetto 250 €',
      294.12,
      250.00,
      3,
      'Paghi 250 € e ricevi 294,12 crediti. Sconto 15%.',
      10
    ),
    (
      'Pacchetto 350 €',
      437.50,
      350.00,
      4,
      'Paghi 350 € e ricevi 437,50 crediti. Sconto 20%.',
      5
    )
) AS v(name, credits, price_eur, sort_order, description, annual_quantity)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.credit_packages existing
  WHERE existing.name = v.name
);
