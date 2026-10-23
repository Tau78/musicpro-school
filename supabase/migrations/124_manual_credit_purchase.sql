-- Carico manuale crediti shop (contanti / bonifico).
-- Le righe storiche restano con payment_method e paid_on NULL: niente backfill.
-- Nexi continua ad accreditare da solo, ma la riga purchase porta metodo e data.

ALTER TABLE public.credit_purchases
  ALTER COLUMN package_id DROP NOT NULL;

ALTER TABLE public.credit_purchases
  ADD COLUMN payment_method TEXT,
  ADD COLUMN paid_on DATE;

ALTER TABLE public.credit_purchases
  DROP CONSTRAINT IF EXISTS credit_purchases_payment_method_check;

ALTER TABLE public.credit_purchases
  ADD CONSTRAINT credit_purchases_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('contanti', 'bonifico', 'nexi'));

COMMENT ON COLUMN public.credit_purchases.package_id IS
  'Pacchetto SHOP. NULL per un carico manuale senza pacchetto. La FK resta.';

COMMENT ON COLUMN public.credit_purchases.payment_method IS
  'contanti | bonifico | nexi. NULL sulle righe storiche non backfillate.';

COMMENT ON COLUMN public.credit_purchases.paid_on IS
  'Data di pagamento (fuso Europe/Rome per Nexi). NULL sulle righe storiche.';

-- ---------------------------------------------------------------------------
-- admin_record_manual_credit_purchase
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_record_manual_credit_purchase(
  p_member_id UUID,
  p_paid_on DATE,
  p_amount_eur NUMERIC,
  p_method TEXT,
  p_credits NUMERIC
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

  v_amount := round(p_amount_eur, 2);
  IF v_amount IS NULL OR v_amount < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_AMOUNT',
      'error_message', 'Importo non valido (deve essere maggiore o uguale a zero).'
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

  v_credits := round(p_credits, 2);
  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_CREDITS',
      'error_message', 'Numero crediti non valido (deve essere maggiore di zero).'
    );
  END IF;

  v_reason := CASE v_method
    WHEN 'contanti' THEN 'Acquisto crediti (contanti)'
    WHEN 'bonifico' THEN 'Acquisto crediti (bonifico)'
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
    p_member_id,
    NULL,
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

  -- Chiave "available" di get_member_credit_balance (saldo spendibile).
  -- Quella funzione nega il service_role: in quel caso lo stesso numero
  -- è member_credit_available, che è ciò che "available" contiene.
  v_balance := public.get_member_credit_balance(p_member_id);
  v_available := (v_balance ->> 'available')::NUMERIC;
  IF v_available IS NULL THEN
    v_available := public.member_credit_available(p_member_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'member_id', p_member_id,
    'credits_granted', v_credits,
    'amount_paid_eur', v_amount,
    'payment_method', v_method,
    'paid_on', p_paid_on,
    'available', v_available
  );
END;
$$;

COMMENT ON FUNCTION public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC) IS
  'Admin/segreteria o service_role: registra un acquisto crediti pagato in contanti o bonifico, senza pacchetto.';

REVOKE ALL ON FUNCTION public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_manual_credit_purchase(UUID, DATE, NUMERIC, TEXT, NUMERIC)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_stripe_credit_shop_payment — stessa firma di 011.
-- Nexi scrive payment_method e paid_on. Idempotenza e pacchetto enabled invariati.
-- credits del pacchetto è NUMERIC(12,2): l'INSERT lo accetta così com'è.
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

COMMENT ON FUNCTION public.apply_stripe_credit_shop_payment(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER
) IS
  'Webhook SHOP (Nexi riusa questa RPC): accredita i crediti del pacchetto. payment_method nexi, paid_on in Europe/Rome. p_member_ref = members.id (uuid).';
