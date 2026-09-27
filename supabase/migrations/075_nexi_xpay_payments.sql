-- Classic XPay (Nexi): ordini unificati + idempotenza notify + apply dispatcher.
-- I RPC apply_stripe_* restano la logica di business; apply_nexi_payment li chiama
-- con p_payment_intent_id = codTrans.

CREATE TABLE IF NOT EXISTS public.nexi_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow text NOT NULL CHECK (flow IN (
    'quota_associativa',
    'quota_multi_pay',
    'room_booking',
    'shop_credit_package',
    'lesson_pack'
  )),
  provider_payment_id text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  payment_link_url text,
  return_url text,
  email text,
  first_name text,
  last_name text,
  description text,
  enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  quota_payment_id uuid REFERENCES public.quota_payments(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  package_id uuid,
  lesson_pack_payment_id uuid REFERENCES public.lesson_pack_payments(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nexi_payment_orders IS
  'Ordini Classic XPay. provider_payment_id = codTrans. Solo service_role.';

CREATE INDEX IF NOT EXISTS nexi_payment_orders_flow_idx
  ON public.nexi_payment_orders (flow, status);
CREATE INDEX IF NOT EXISTS nexi_payment_orders_enrollment_idx
  ON public.nexi_payment_orders (enrollment_id);
CREATE INDEX IF NOT EXISTS nexi_payment_orders_booking_idx
  ON public.nexi_payment_orders (booking_id);
CREATE INDEX IF NOT EXISTS nexi_payment_orders_quota_idx
  ON public.nexi_payment_orders (quota_payment_id);
CREATE INDEX IF NOT EXISTS nexi_payment_orders_pack_idx
  ON public.nexi_payment_orders (lesson_pack_payment_id);

ALTER TABLE public.nexi_payment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nexi_payment_orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.nexi_payment_orders TO service_role;

CREATE TABLE IF NOT EXISTS public.nexi_payment_receipts (
  cod_trans text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.nexi_payment_orders(id) ON DELETE CASCADE,
  flow text NOT NULL,
  esito text,
  importo integer,
  cod_aut text,
  applied_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nexi_payment_receipts IS
  'Idempotenza notifica XPay (urlpost). Solo service_role.';

ALTER TABLE public.nexi_payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nexi_payment_receipts FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.nexi_payment_receipts TO service_role;

CREATE INDEX IF NOT EXISTS nexi_payment_receipts_order_idx
  ON public.nexi_payment_receipts (order_id);

-- Carta Nexi come metodo prenotazione / pack (oltre a stripe legacy).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('stripe', 'credits', 'nexi'));

ALTER TABLE public.lesson_pack_payments DROP CONSTRAINT IF EXISTS lesson_pack_payments_method_check;
ALTER TABLE public.lesson_pack_payments
  ADD CONSTRAINT lesson_pack_payments_method_check
  CHECK (method IN ('stripe', 'nexi', 'bonifico', 'contanti', 'altro'));

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
  VALUES (v_cod, v_order.id, v_order.flow, v_esito, v_amount, nullif(trim(coalesce(p_cod_aut, '')), ''));

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
    WHERE id = v_order.booking_id
      AND payment_method IS DISTINCT FROM 'credits';
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
    'lesson_pack_payment_id', v_order.lesson_pack_payment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_nexi_payment(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_nexi_payment(text, text, text, integer) TO service_role;

-- Pack carta (stripe legacy / nexi): solo service_role può passare a completed.
CREATE OR REPLACE FUNCTION public.guard_lesson_pack_card_apply()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.method IN ('stripe', 'nexi')
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Pagamento carta applicabile solo dal sistema.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_pack_payments_card_apply_guard ON public.lesson_pack_payments;
CREATE TRIGGER lesson_pack_payments_card_apply_guard
  BEFORE UPDATE ON public.lesson_pack_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_lesson_pack_card_apply();
