-- Market: strumenti e oggetti usati dell'associazione.
-- Vetrina pubblica sul sito, gestione in amministrazione.
-- Ritiro in sede. Pagamento: bonifico anticipato, contanti, Nexi.

CREATE TABLE public.market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'bozza',
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_listings_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT market_listings_description_len CHECK (char_length(description) <= 2000),
  CONSTRAINT market_listings_price_non_negative CHECK (price_cents >= 0),
  CONSTRAINT market_listings_status_check CHECK (
    status IN ('bozza', 'in_vendita', 'riservato', 'venduto')
  )
);

COMMENT ON TABLE public.market_listings IS
  'Oggetti usati in vendita. in_vendita è pubblico; riservato aspetta il ritiro.';

CREATE INDEX market_listings_status_created_idx
  ON public.market_listings (status, created_at DESC);

CREATE TRIGGER trg_market_listings_updated_at
  BEFORE UPDATE ON public.market_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.market_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.market_listings (id) ON DELETE RESTRICT,
  buyer_name text NOT NULL,
  buyer_email text,
  buyer_phone text,
  method text NOT NULL,
  status text NOT NULL DEFAULT 'richiesto',
  amount_cents integer NOT NULL,
  nexi_cod_trans text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_orders_method_check CHECK (method IN ('bonifico', 'contanti', 'nexi')),
  CONSTRAINT market_orders_status_check CHECK (
    status IN ('richiesto', 'in_attesa', 'pagato', 'ritirato', 'annullato')
  ),
  CONSTRAINT market_orders_amount_non_negative CHECK (amount_cents >= 0),
  CONSTRAINT market_orders_buyer_name_len CHECK (char_length(btrim(buyer_name)) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.market_orders IS
  'Richieste Market. Niente spedizione: il ritiro è in sede.';

CREATE INDEX market_orders_listing_idx
  ON public.market_orders (listing_id, created_at DESC);

CREATE INDEX market_orders_status_idx
  ON public.market_orders (status, created_at DESC);

CREATE TRIGGER trg_market_orders_updated_at
  BEFORE UPDATE ON public.market_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_listings_staff
  ON public.market_listings
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY market_orders_staff
  ON public.market_orders
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_listings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_orders TO authenticated, service_role;

INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'market_iban',
    '',
    'IBAN per i bonifici anticipati del Market'
  ),
  (
    'market_iban_holder',
    'Associazione Culturale M.P. – Il Cervellone Genova',
    'Intestatario del bonifico Market'
  )
ON CONFLICT (key) DO NOTHING;

-- Flusso Nexi dedicato: il notify segna l'ordine pagato, l'oggetto resta riservato fino al ritiro.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'nexi_payment_orders'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%quota_associativa%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.nexi_payment_orders DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.nexi_payment_orders
  ADD CONSTRAINT nexi_payment_orders_flow_check
  CHECK (flow IN (
    'quota_associativa',
    'quota_multi_pay',
    'room_booking',
    'shop_credit_package',
    'lesson_pack',
    'market'
  ));

CREATE OR REPLACE FUNCTION public.apply_market_nexi_payment(
  p_order_id uuid,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.market_orders%ROWTYPE;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordine Market mancante.');
  END IF;

  SELECT * INTO v_order
  FROM public.market_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordine Market non trovato.');
  END IF;

  IF v_order.status IN ('pagato', 'ritirato') THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  IF v_order.status = 'annullato' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordine Market annullato.');
  END IF;

  IF p_amount_cents IS NOT NULL AND p_amount_cents <> v_order.amount_cents THEN
    RETURN jsonb_build_object('success', false, 'message', 'Importo Market non coincide.');
  END IF;

  UPDATE public.market_orders
  SET status = 'pagato', updated_at = now()
  WHERE id = v_order.id;

  RETURN jsonb_build_object('success', true, 'duplicate', false);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_market_nexi_payment(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_market_nexi_payment(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_nexi_payment(
  p_cod_trans text,
  p_cod_aut text DEFAULT NULL,
  p_esito text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cod text := nullif(trim(coalesce(p_cod_trans, '')), '');
  v_esito text := upper(nullif(trim(coalesce(p_esito, '')), ''));
  v_order public.nexi_payment_orders%ROWTYPE;
  v_receipt public.nexi_payment_receipts%ROWTYPE;
  v_event_id text;
  v_inner jsonb;
  v_amount integer;
  v_credit_fin jsonb;
  v_market_order_id uuid;
BEGIN
  IF v_cod IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'codTrans mancante.');
  END IF;

  IF v_esito IS DISTINCT FROM 'OK' THEN
    RETURN jsonb_build_object('success', false, 'message', 'esito non OK.', 'esito', v_esito);
  END IF;

  SELECT * INTO v_receipt
  FROM public.nexi_payment_receipts
  WHERE cod_trans = v_cod;

  IF FOUND THEN
    SELECT * INTO v_order FROM public.nexi_payment_orders WHERE id = v_receipt.order_id;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'flow', coalesce(v_order.flow, v_receipt.flow),
      'order_id', v_receipt.order_id,
      'enrollment_id', v_order.enrollment_id,
      'quota_payment_id', v_order.quota_payment_id,
      'booking_id', v_order.booking_id,
      'member_id', v_order.member_id,
      'lesson_pack_payment_id', v_order.lesson_pack_payment_id
    );
  END IF;

  SELECT * INTO v_order
  FROM public.nexi_payment_orders
  WHERE provider_payment_id = v_cod;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordine Nexi non trovato.');
  END IF;

  v_amount := coalesce(p_amount_cents, v_order.amount_cents);
  v_event_id := 'nexi:' || v_cod;

  IF v_order.flow = 'quota_associativa' THEN
    v_inner := public.apply_stripe_quota_payment(
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount,
      'quota_associativa',
      v_order.enrollment_id,
      NULL
    );
  ELSIF v_order.flow = 'quota_multi_pay' THEN
    v_inner := public.apply_stripe_quota_payment(
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount,
      'quota_multi_pay',
      NULL,
      v_order.quota_payment_id
    );
  ELSIF v_order.flow = 'room_booking' THEN
    v_inner := public.apply_stripe_room_booking_payment(
      v_order.booking_id::text,
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount
    );
  ELSIF v_order.flow = 'shop_credit_package' THEN
    v_inner := public.apply_stripe_credit_shop_payment(
      v_order.member_id::text,
      v_order.package_id,
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount
    );
  ELSIF v_order.flow = 'lesson_pack' THEN
    v_inner := public.apply_stripe_lesson_pack_payment(
      v_event_id,
      'nexi.xpay.notify',
      v_cod,
      v_cod,
      v_amount,
      v_order.lesson_pack_payment_id
    );
  ELSIF v_order.flow = 'market' THEN
    BEGIN
      v_market_order_id := nullif(v_order.metadata->>'market_order_id', '')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_market_order_id := NULL;
    END;
    v_inner := public.apply_market_nexi_payment(v_market_order_id, v_amount);
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Flusso pagamento sconosciuto.');
  END IF;

  IF coalesce(v_inner->>'success', 'false') <> 'true' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', coalesce(v_inner->>'message', 'Applicazione pagamento fallita.'),
      'flow', v_order.flow,
      'inner', v_inner
    );
  END IF;

  INSERT INTO public.nexi_payment_receipts (cod_trans, order_id, flow, esito, importo, cod_aut)
  VALUES (
    v_cod,
    v_order.id,
    v_order.flow,
    v_esito,
    v_amount,
    nullif(trim(coalesce(p_cod_aut, '')), '')
  );

  UPDATE public.nexi_payment_orders
  SET
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'paid_amount_cents', v_amount,
      'cod_aut', nullif(trim(coalesce(p_cod_aut, '')), '')
    )
  WHERE id = v_order.id;

  IF v_order.flow = 'room_booking' AND v_order.booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET payment_method = 'nexi'
    WHERE id = v_order.booking_id;

    v_credit_fin := public.finalize_held_credits_on_booking_payment(v_order.booking_id);
  END IF;

  IF v_order.flow = 'lesson_pack' AND v_order.lesson_pack_payment_id IS NOT NULL THEN
    UPDATE public.lesson_pack_payments
    SET method = 'nexi'
    WHERE id = v_order.lesson_pack_payment_id
      AND method = 'stripe';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', coalesce((v_inner->>'duplicate')::boolean, false),
    'flow', v_order.flow,
    'order_id', v_order.id,
    'enrollment_id', v_order.enrollment_id,
    'quota_payment_id', v_order.quota_payment_id,
    'booking_id', coalesce(v_order.booking_id, (v_inner->>'booking_id')::uuid),
    'member_id', v_order.member_id,
    'lesson_pack_payment_id', v_order.lesson_pack_payment_id,
    'credits_finalized', v_credit_fin
  );
END;
$$;
