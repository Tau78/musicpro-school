-- Booking P1/P2 gaps:
-- 1. Ensure debit_booking_credits never returns HOLD_MISMATCH (admin duration edit)
-- 2. Stripe refund receipts + cancel/admin settlement signals
-- 3. room_duration_discounts + room_options + booking_options
-- 4. Pricing helpers; create_booking_safe with option ids
-- 5. modify_booking_safe for associati (modifyMinHours)
-- Stripe preauth for pending_approval: deferred — approve-then-pay accepted.

-- ---------------------------------------------------------------------------
-- debit_booking_credits — release+debit with hold mismatch adjustment
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
  v_new_status public.booking_status;
  v_new_payment TEXT;
  v_hold_delta INTEGER;
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
    IF v_booking.status = 'pending'::public.booking_status THEN
      UPDATE public.bookings
      SET
        status = 'confirmed'::public.booking_status,
        payment_status = 'not_required',
        payment_method = COALESCE(payment_method, 'credits')
      WHERE id = p_booking_id;

      v_booking.status := 'confirmed'::public.booking_status;
      v_booking.payment_status := 'not_required';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'booking_id', p_booking_id,
      'credits_used', v_booking.credits_used,
      'status', v_booking.status,
      'payment_status', v_booking.payment_status,
      'message', 'Crediti gia addebitati su questa prenotazione.'
    );
  END IF;

  IF v_booking.credits_held > 0 THEN
    IF v_booking.credits_held <> v_debit THEN
      -- Check BEFORE release: available excludes held; need only the delta extra.
      v_hold_delta := v_debit - v_booking.credits_held;
      v_available := public.member_credit_available(v_booking.member_id);

      IF v_hold_delta > 0 AND v_available < v_hold_delta THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'INSUFFICIENT_CREDITS',
          'error_message', 'Saldo crediti insufficiente per l''addebito rettificato.',
          'available', v_available,
          'required', v_hold_delta
        );
      END IF;

      INSERT INTO public.credit_transactions (
        member_id, amount, type, booking_id, reason, created_by
      )
      VALUES (
        v_booking.member_id,
        v_booking.credits_held,
        'release'::public.credit_transaction_type,
        p_booking_id,
        format(
          'Release hold per rettifica addebito prenotazione %s (%s → %s crediti)',
          p_booking_id, v_booking.credits_held, v_debit
        ),
        v_current_member
      );
    ELSE
      INSERT INTO public.credit_transactions (
        member_id, amount, type, booking_id, reason, created_by
      )
      VALUES (
        v_booking.member_id,
        v_booking.credits_held,
        'release'::public.credit_transaction_type,
        p_booking_id,
        format('Release hold prima addebito prenotazione %s', p_booking_id),
        v_current_member
      );
    END IF;
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
    member_id, amount, type, booking_id, reason, created_by
  )
  VALUES (
    v_booking.member_id,
    -v_debit,
    'debit'::public.credit_transaction_type,
    p_booking_id,
    format('Addebito crediti prenotazione %s', p_booking_id),
    v_current_member
  );

  v_new_status := CASE
    WHEN v_booking.status = 'pending'::public.booking_status
      THEN 'confirmed'::public.booking_status
    ELSE v_booking.status
  END;

  v_new_payment := CASE
    WHEN v_booking.status IN (
      'pending'::public.booking_status,
      'confirmed'::public.booking_status
    ) THEN 'not_required'
    ELSE v_booking.payment_status
  END;

  UPDATE public.bookings
  SET
    credits_used = v_debit,
    credits_held = 0,
    payment_method = 'credits',
    status = v_new_status,
    payment_status = v_new_payment
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credits_used', v_debit,
    'status', v_new_status,
    'payment_status', v_new_payment,
    'available_after', public.member_credit_available(v_booking.member_id)
  );
END;
$$;

COMMENT ON FUNCTION public.debit_booking_credits IS
  'Addebito crediti. Hold mismatch: release + debit rettificato (no HOLD_MISMATCH).';

GRANT EXECUTE ON FUNCTION public.debit_booking_credits(UUID, INTEGER)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Stripe refund receipts (idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_room_booking_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_intent_id TEXT NOT NULL,
  stripe_refund_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  penalty_cents INTEGER NOT NULL DEFAULT 0 CHECK (penalty_cents >= 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Multiple partial refunds allowed (admin delta + cancel remainder).
  CONSTRAINT stripe_room_booking_refunds_stripe_id_unique
    UNIQUE (stripe_refund_id)
);

COMMENT ON TABLE public.stripe_room_booking_refunds IS
  'Rimborsi Stripe sale — più righe per booking/PI (delta admin + cancel).';

-- If an earlier draft of 060 used (payment_intent_id, booking_id) unique, migrate.
ALTER TABLE public.stripe_room_booking_refunds
  DROP CONSTRAINT IF EXISTS stripe_room_booking_refunds_pi_booking_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stripe_room_booking_refunds_stripe_id_unique'
  ) THEN
    ALTER TABLE public.stripe_room_booking_refunds
      ADD CONSTRAINT stripe_room_booking_refunds_stripe_id_unique
      UNIQUE (stripe_refund_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS stripe_room_booking_refunds_booking_id_idx
  ON public.stripe_room_booking_refunds (booking_id);

ALTER TABLE public.stripe_room_booking_refunds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stripe_room_booking_refunds FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_room_booking_refunds TO service_role;

-- Mark Stripe payment_method when webhook applies payment
CREATE OR REPLACE FUNCTION public.apply_stripe_room_booking_payment(
  p_booking_id UUID,
  p_stripe_event_id TEXT,
  p_stripe_event_type TEXT DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_payment_link_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_rows INTEGER := 0;
BEGIN
  IF p_payment_intent_id IS NOT NULL AND trim(p_payment_intent_id) <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.stripe_room_booking_payment_receipts r
      WHERE r.payment_intent_id = trim(p_payment_intent_id)
    ) THEN
      SELECT b.* INTO v_booking
      FROM public.stripe_room_booking_payment_receipts r
      JOIN public.bookings b ON b.id = r.booking_id
      WHERE r.payment_intent_id = trim(p_payment_intent_id)
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'booking_id', v_booking.id,
        'status', v_booking.status::TEXT,
        'message', 'Pagamento gia applicato (idempotenza).'
      );
    END IF;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione annullata — pagamento non applicabile.',
      'booking_id', v_booking.id
    );
  END IF;

  UPDATE public.bookings
  SET
    payment_status = 'paid',
    payment_method = 'stripe',
    status = 'confirmed'::public.booking_status,
    stripe_payment_intent_id = nullif(trim(coalesce(p_payment_intent_id, '')), ''),
    payment_link_id = coalesce(
      nullif(trim(coalesce(p_payment_link_id, '')), ''),
      payment_link_id
    ),
    paid_at = now()
  WHERE id = v_booking.id
    AND payment_status <> 'paid';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF p_payment_intent_id IS NOT NULL AND trim(p_payment_intent_id) <> '' THEN
    INSERT INTO public.stripe_room_booking_payment_receipts (
      payment_intent_id,
      booking_id,
      stripe_event_id
    )
    VALUES (trim(p_payment_intent_id), v_booking.id, p_stripe_event_id)
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'rows_updated', v_rows,
    'status', 'confirmed'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Duration discounts + room options
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_duration_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  min_duration_minutes INTEGER NOT NULL CHECK (min_duration_minutes > 0),
  discount_eur NUMERIC(10, 2),
  discount_percent NUMERIC(5, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_duration_discounts_value_check CHECK (
    (discount_eur IS NOT NULL AND discount_eur >= 0 AND discount_percent IS NULL)
    OR (discount_percent IS NOT NULL AND discount_percent >= 0 AND discount_percent <= 100 AND discount_eur IS NULL)
  )
);

COMMENT ON TABLE public.room_duration_discounts IS
  'Sconti per durata minima (fascia ore). Si applica la fascia con min_duration più alta ≤ durata.';

CREATE INDEX IF NOT EXISTS room_duration_discounts_room_idx
  ON public.room_duration_discounts (room_id, is_active, min_duration_minutes DESC);

CREATE TABLE IF NOT EXISTS public.room_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_eur NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_eur >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_options_name_not_blank CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE public.room_options IS
  'Addon / opzioni sala (microfoni, attrezzature) con prezzo fisso.';

CREATE INDEX IF NOT EXISTS room_options_room_idx
  ON public.room_options (room_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.booking_options (
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_option_id UUID NOT NULL REFERENCES public.room_options(id) ON DELETE RESTRICT,
  price_eur NUMERIC(10, 2) NOT NULL CHECK (price_eur >= 0),
  name_snapshot TEXT NOT NULL,
  PRIMARY KEY (booking_id, room_option_id)
);

COMMENT ON TABLE public.booking_options IS
  'Snapshot opzioni selezionate sulla prenotazione.';

CREATE INDEX IF NOT EXISTS booking_options_option_idx
  ON public.booking_options (room_option_id);

ALTER TABLE public.room_duration_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_duration_discounts_select_authenticated"
  ON public.room_duration_discounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "room_duration_discounts_manage_staff"
  ON public.room_duration_discounts FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "room_options_select_authenticated"
  ON public.room_options FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "room_options_manage_staff"
  ON public.room_options FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "booking_options_select_own_or_staff"
  ON public.booking_options FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND b.member_id = public.current_member_id()
    )
  );

CREATE POLICY "booking_options_insert_own_or_staff"
  ON public.booking_options FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND b.member_id = public.current_member_id()
    )
  );

CREATE POLICY "booking_options_delete_staff"
  ON public.booking_options FOR DELETE
  TO authenticated
  USING (public.is_admin_or_segreteria());

GRANT SELECT ON public.room_duration_discounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_duration_discounts TO authenticated;
GRANT SELECT ON public.room_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_options TO authenticated;
GRANT SELECT, INSERT ON public.booking_options TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.booking_options TO service_role;

-- ---------------------------------------------------------------------------
-- Pricing helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.room_duration_discount_eur(
  p_room_id UUID,
  p_duration_minutes INTEGER,
  p_hourly_rate NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC(10, 2);
  v_base NUMERIC(10, 2);
  v_discount NUMERIC(10, 2) := 0;
  v_row public.room_duration_discounts%ROWTYPE;
BEGIN
  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    RETURN 0;
  END IF;

  IF p_hourly_rate IS NOT NULL THEN
    v_rate := p_hourly_rate;
  ELSE
    SELECT r.hourly_rate_eur INTO v_rate
    FROM public.rooms r
    WHERE r.id = p_room_id;
  END IF;

  v_base := public.booking_price_eur(COALESCE(v_rate, 0), p_duration_minutes);

  SELECT d.* INTO v_row
  FROM public.room_duration_discounts d
  WHERE d.room_id = p_room_id
    AND d.is_active
    AND d.min_duration_minutes <= p_duration_minutes
  ORDER BY d.min_duration_minutes DESC, d.sort_order ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_row.discount_percent IS NOT NULL THEN
    v_discount := ROUND((v_base * v_row.discount_percent / 100.0)::NUMERIC, 2);
  ELSE
    v_discount := COALESCE(v_row.discount_eur, 0);
  END IF;

  RETURN GREATEST(0, LEAST(v_base, v_discount));
END;
$$;

GRANT EXECUTE ON FUNCTION public.room_duration_discount_eur(UUID, INTEGER, NUMERIC)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.room_options_total_eur(
  p_room_id UUID,
  p_option_ids UUID[]
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(o.price_eur), 0)::NUMERIC(10, 2)
  FROM public.room_options o
  WHERE o.room_id = p_room_id
    AND o.is_active
    AND p_option_ids IS NOT NULL
    AND o.id = ANY (p_option_ids);
$$;

GRANT EXECUTE ON FUNCTION public.room_options_total_eur(UUID, UUID[])
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.booking_total_price_eur(
  p_room_id UUID,
  p_duration_minutes INTEGER,
  p_provi_da_solo BOOLEAN DEFAULT false,
  p_option_ids UUID[] DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_price NUMERIC(10, 2);
BEGIN
  SELECT * INTO v_room FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_price := public.booking_price_eur(v_room.hourly_rate_eur, p_duration_minutes);
  v_price := GREATEST(
    0,
    v_price - public.room_duration_discount_eur(
      p_room_id, p_duration_minutes, v_room.hourly_rate_eur
    )
  );

  IF COALESCE(p_provi_da_solo, false) AND v_room.provi_da_solo_discount_eur > 0 THEN
    v_price := GREATEST(
      0,
      v_price - public.booking_provi_discount_total_eur(
        v_room.provi_da_solo_discount_eur,
        p_duration_minutes
      )
    );
  END IF;

  v_price := v_price + public.room_options_total_eur(p_room_id, p_option_ids);
  RETURN ROUND(v_price::NUMERIC, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.booking_total_price_eur(UUID, INTEGER, BOOLEAN, UUID[])
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.booking_cancellation_penalty_percent(
  p_start_at TIMESTAMPTZ,
  p_override INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead NUMERIC;
  v_percent INTEGER;
BEGIN
  IF p_override IS NOT NULL THEN
    RETURN GREATEST(0, LEAST(100, p_override));
  END IF;

  v_lead := public.booking_lead_time_hours(p_start_at);

  SELECT r.penalty_percent INTO v_percent
  FROM public.cancellation_penalty_rules r
  WHERE r.enabled
    AND v_lead > r.to_hours
    AND v_lead <= r.from_hours
  ORDER BY r.sort_order, r.from_hours DESC
  LIMIT 1;

  RETURN COALESCE(v_percent, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.booking_cancellation_penalty_percent(TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.booking_stripe_refund_plan(
  p_booking_id UUID,
  p_skip_penalty BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_penalty_percent INTEGER;
  v_paid_cents INTEGER;
  v_prior_refunded INTEGER;
  v_penalty_cents INTEGER;
  v_target_refund INTEGER;
  v_refund_cents INTEGER;
BEGIN
  SELECT * INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('needed', false);
  END IF;

  IF v_booking.payment_status NOT IN ('paid', 'refunded')
     OR nullif(trim(coalesce(v_booking.stripe_payment_intent_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('needed', false);
  END IF;

  SELECT COALESCE(SUM(r.amount_cents), 0)::INTEGER
  INTO v_prior_refunded
  FROM public.stripe_room_booking_refunds r
  WHERE r.booking_id = p_booking_id
    AND r.payment_intent_id = v_booking.stripe_payment_intent_id
    AND r.stripe_refund_id IS NOT NULL;

  -- Original Stripe charge ≈ current total + already-refunded deltas (admin decrease).
  v_paid_cents := ROUND(COALESCE(v_booking.total_price_eur, 0) * 100)::INTEGER
                  + v_prior_refunded;
  IF v_paid_cents <= 0 THEN
    RETURN jsonb_build_object('needed', false);
  END IF;

  v_penalty_percent := public.booking_cancellation_penalty_percent(
    v_booking.start_at,
    CASE WHEN p_skip_penalty THEN 0 ELSE NULL END
  );
  v_penalty_cents := ROUND(v_paid_cents * v_penalty_percent / 100.0)::INTEGER;
  v_target_refund := GREATEST(0, v_paid_cents - v_penalty_cents);
  v_refund_cents := GREATEST(0, v_target_refund - v_prior_refunded);

  IF v_refund_cents <= 0 THEN
    RETURN jsonb_build_object(
      'needed', false,
      'already_refunded', (v_prior_refunded > 0 AND v_target_refund > 0),
      'penalty_only', (v_target_refund <= 0),
      'penalty_percent', v_penalty_percent,
      'penalty_cents', v_penalty_cents,
      'prior_refunded_cents', v_prior_refunded,
      'payment_intent_id', v_booking.stripe_payment_intent_id
    );
  END IF;

  RETURN jsonb_build_object(
    'needed', true,
    'booking_id', p_booking_id,
    'payment_intent_id', v_booking.stripe_payment_intent_id,
    'amount_cents', v_refund_cents,
    'penalty_cents', v_penalty_cents,
    'penalty_percent', v_penalty_percent,
    'paid_cents', v_paid_cents,
    'prior_refunded_cents', v_prior_refunded
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.booking_stripe_refund_plan(UUID, BOOLEAN)
  TO authenticated, service_role;

-- Allow payment_status = refunded after Stripe refund
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (
    payment_status IN ('unpaid', 'link_sent', 'paid', 'not_required', 'refunded')
  );

-- ---------------------------------------------------------------------------
-- create_booking_safe — duration discounts + options
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean);
DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean, UUID);
DROP FUNCTION IF EXISTS public.create_booking_safe(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_provi_da_solo boolean DEFAULT false,
  p_band_id UUID DEFAULT NULL,
  p_option_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking_id UUID;
  v_status public.booking_status;
  v_payment_status TEXT;
  v_room public.rooms%ROWTYPE;
  v_duration_minutes integer;
  v_price numeric(10, 2);
  v_lead_hours numeric;
  v_auto_hours integer;
  v_approval_hours integer;
  v_is_associato_only boolean;
  v_provi_da_solo boolean := COALESCE(p_provi_da_solo, false);
  v_band_required boolean;
  v_member_snapshot JSONB;
  v_option_ids UUID[] := COALESCE(p_option_ids, ARRAY[]::UUID[]);
BEGIN
  v_current_member := public.current_member_id();
  v_band_required := public.get_booking_setting_bool('booking_band_required', false);

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso per prenotare.'
    );
  END IF;

  IF p_member_id IS DISTINCT FROM v_current_member
     AND NOT public.has_member_role('admin'::public.member_role) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MEMBER_MISMATCH',
      'error_message', 'Puoi prenotare solo per il tuo account.'
    );
  END IF;

  IF v_provi_da_solo THEN
    IF p_band_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'BAND_REQUIRED',
        'error_message', 'PROVI DA SOLO non può essere associato a una band.'
      );
    END IF;

    IF public.has_member_role('admin'::public.member_role)
       OR public.has_member_role('docente'::public.member_role) THEN
      NULL;
    ELSIF public.has_member_role('associato'::public.member_role) THEN
      IF NOT public.member_quota_ok(p_member_id) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'QUOTA_NOT_PAID',
          'error_message', 'Devi aver pagato la quota associativa per prenotare le sale.'
        );
      END IF;
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_AUTHORIZED',
        'error_message', 'Non hai i permessi per prenotare le sale prova.'
      );
    END IF;
  ELSIF p_band_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.band_members bm
      WHERE bm.band_id = p_band_id
        AND bm.member_id = v_current_member
        AND bm.status = 'active'::public.band_member_status
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_BAND_MEMBER',
        'error_message', 'Non sei membro attivo di questa band.'
      );
    END IF;

    IF NOT public.band_all_members_quota_ok(p_band_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'BAND_QUOTA_INCOMPLETE',
        'error_message', 'Non tutti i membri attivi della band hanno la quota in regola.'
      );
    END IF;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'member_id', m.id,
          'first_name', m.first_name,
          'last_name', m.last_name
        )
        ORDER BY m.last_name, m.first_name, m.id
      ),
      '[]'::jsonb
    )
    INTO v_member_snapshot
    FROM public.band_members bm
    JOIN public.members m ON m.id = bm.member_id
    WHERE bm.band_id = p_band_id
      AND bm.status = 'active'::public.band_member_status;

    IF NOT (
      public.has_member_role('admin'::public.member_role)
      OR public.has_member_role('docente'::public.member_role)
      OR public.has_member_role('associato'::public.member_role)
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_AUTHORIZED',
        'error_message', 'Non hai i permessi per prenotare le sale prova.'
      );
    END IF;
  ELSIF v_band_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'BAND_REQUIRED',
      'error_message', 'Seleziona una band per questa prenotazione.'
    );
  ELSE
    IF public.has_member_role('admin'::public.member_role)
       OR public.has_member_role('docente'::public.member_role) THEN
      NULL;
    ELSIF public.has_member_role('associato'::public.member_role) THEN
      IF NOT public.member_quota_ok(p_member_id) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'QUOTA_NOT_PAID',
          'error_message', 'Devi aver pagato la quota associativa per prenotare le sale.'
        );
      END IF;
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_AUTHORIZED',
        'error_message', 'Non hai i permessi per prenotare le sale prova.'
      );
    END IF;

    v_member_snapshot := NULL;
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  SELECT * INTO v_room
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  v_duration_minutes := (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer;

  IF v_duration_minutes < v_room.min_duration_minutes
     OR v_duration_minutes > v_room.max_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DURATION',
      'error_message', format(
        'Durata non valida per questa sala (%s–%s minuti).',
        v_room.min_duration_minutes,
        v_room.max_duration_minutes
      )
    );
  END IF;

  IF cardinality(v_option_ids) > 0
     AND EXISTS (
       SELECT 1
       FROM unnest(v_option_ids) AS oid(id)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.room_options o
         WHERE o.id = oid.id
           AND o.room_id = p_room_id
           AND o.is_active
       )
     ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_OPTION',
      'error_message', 'Una o più opzioni non sono valide per questa sala.'
    );
  END IF;

  IF v_provi_da_solo THEN
    IF NOT v_room.provi_da_solo_enabled THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'NOT_AUTHORIZED',
        'error_message', 'PROVI DA SOLO non è disponibile per questa sala.'
      );
    END IF;

    IF NOT public.slot_in_provi_schedule(p_room_id, p_start_at, p_end_at) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_TIME',
        'error_message', 'Lo slot selezionato non rientra negli orari PROVI DA SOLO.'
      );
    END IF;
  END IF;

  v_auto_hours := public.get_booking_setting_int('booking_auto_confirm_min_hours', 12);
  v_approval_hours := public.get_booking_setting_int('booking_approval_min_hours', 6);
  v_lead_hours := public.booking_lead_time_hours(p_start_at);

  v_is_associato_only :=
    public.has_member_role('associato'::public.member_role)
    AND NOT public.has_member_role('admin'::public.member_role)
    AND NOT public.has_member_role('docente'::public.member_role);

  IF v_is_associato_only AND v_lead_hours < v_approval_hours THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOO_LATE',
      'error_message', format(
        'Non è possibile prenotare a meno di %s ore dall''inizio.',
        v_approval_hours
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  v_price := public.booking_total_price_eur(
    p_room_id,
    v_duration_minutes,
    v_provi_da_solo,
    v_option_ids
  );

  IF v_is_associato_only THEN
    v_payment_status := 'unpaid';
    IF v_lead_hours >= v_auto_hours THEN
      v_status := 'pending'::public.booking_status;
    ELSE
      v_status := 'pending_approval'::public.booking_status;
    END IF;
  ELSE
    v_status := 'confirmed'::public.booking_status;
    v_payment_status := 'not_required';
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes,
      payment_status,
      provi_da_solo,
      band_id,
      member_snapshot
    )
    VALUES (
      p_room_id,
      p_member_id,
      p_start_at,
      p_end_at,
      v_status,
      v_price,
      v_duration_minutes,
      v_payment_status,
      v_provi_da_solo,
      CASE WHEN v_provi_da_solo THEN NULL ELSE p_band_id END,
      CASE WHEN v_provi_da_solo THEN NULL ELSE v_member_snapshot END
    )
    RETURNING id INTO v_booking_id;

    IF cardinality(v_option_ids) > 0 THEN
      INSERT INTO public.booking_options (booking_id, room_option_id, price_eur, name_snapshot)
      SELECT v_booking_id, o.id, o.price_eur, o.name
      FROM public.room_options o
      WHERE o.id = ANY (v_option_ids)
        AND o.room_id = p_room_id
        AND o.is_active;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'status', v_status::TEXT,
      'total_price_eur', v_price,
      'duration_minutes', v_duration_minutes,
      'requires_approval', (v_status = 'pending_approval'::public.booking_status),
      'requires_payment', (v_payment_status = 'unpaid'),
      'provi_da_solo', v_provi_da_solo,
      'band_id', CASE WHEN v_provi_da_solo THEN NULL ELSE p_band_id END
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_safe(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean, UUID, UUID[]
) TO authenticated;

COMMENT ON FUNCTION public.create_booking_safe(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, boolean, UUID, UUID[]
) IS
  'Crea prenotazione con sconti durata, PROVI DA SOLO orario e addon opzionali.';

-- ---------------------------------------------------------------------------
-- modify_booking_safe — associato, soglia modifyMinHours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.modify_booking_safe(
  p_booking_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_duration_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_room public.rooms%ROWTYPE;
  v_duration INTEGER;
  v_modify_hours INTEGER;
  v_lead_hours NUMERIC;
  v_price NUMERIC(10, 2);
  v_option_ids UUID[];
  v_credit_delta INTEGER;
  v_new_credit_hours INTEGER;
  v_old_credit_hours INTEGER;
  v_available INTEGER;
  v_audit_id UUID;
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
      'error_message', 'Non puoi modificare questa prenotazione.'
    );
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CANCELLED',
      'error_message', 'Prenotazione già annullata.'
    );
  END IF;

  IF NOT public.is_admin_or_segreteria() THEN
    v_modify_hours := public.get_booking_setting_int('booking_modify_min_hours', 6);
    v_lead_hours := public.booking_lead_time_hours(v_booking.start_at);

    IF v_lead_hours < v_modify_hours THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'MODIFY_TOO_LATE',
        'error_message', format(
          'Modifica non consentita a meno di %s ore dall''inizio. Contatta la segreteria.',
          v_modify_hours
        )
      );
    END IF;
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  v_duration := COALESCE(
    p_duration_minutes,
    (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer
  );

  SELECT * INTO v_room FROM public.rooms r WHERE r.id = v_booking.room_id;
  IF NOT FOUND OR NOT v_room.is_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  IF v_duration < v_room.min_duration_minutes
     OR v_duration > v_room.max_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DURATION',
      'error_message', format(
        'Durata non valida per questa sala (%s–%s minuti).',
        v_room.min_duration_minutes,
        v_room.max_duration_minutes
      )
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = v_booking.room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.id <> p_booking_id
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  IF v_booking.provi_da_solo
     AND NOT public.slot_in_provi_schedule(v_booking.room_id, p_start_at, p_end_at) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'Lo slot selezionato non rientra negli orari PROVI DA SOLO.'
    );
  END IF;

  SELECT COALESCE(array_agg(bo.room_option_id), ARRAY[]::UUID[])
  INTO v_option_ids
  FROM public.booking_options bo
  WHERE bo.booking_id = p_booking_id;

  v_price := public.booking_total_price_eur(
    v_booking.room_id,
    v_duration,
    COALESCE(v_booking.provi_da_solo, false),
    v_option_ids
  );

  IF v_booking.payment_status = 'paid'
     AND ABS(COALESCE(v_booking.total_price_eur, 0) - v_price) >= 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PAID_PRICE_CHANGE',
      'error_message',
        'La modifica cambierebbe l''importo già pagato. Annulla e riprenota, oppure contatta la segreteria.'
    );
  END IF;

  -- Sync credit hold on pending_approval when a hold is active
  IF COALESCE(v_booking.credits_held, 0) > 0
     AND v_booking.status = 'pending_approval'::public.booking_status
     AND v_duration IS DISTINCT FROM v_booking.duration_minutes THEN
    v_new_credit_hours := CEIL(v_duration::NUMERIC / 60.0)::INTEGER;
    v_old_credit_hours := COALESCE(v_booking.credits_held, 0);
    v_credit_delta := v_new_credit_hours - v_old_credit_hours;

    IF v_credit_delta > 0 THEN
      v_available := public.member_credit_available(v_booking.member_id);
      IF v_available < v_credit_delta THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'INSUFFICIENT_CREDITS',
          'error_message', 'Saldo crediti insufficiente per aumentare l''hold.',
          'available', v_available,
          'required', v_credit_delta
        );
      END IF;

      INSERT INTO public.credit_transactions (
        member_id, amount, type, booking_id, reason, created_by
      ) VALUES (
        v_booking.member_id,
        -v_credit_delta,
        'hold'::public.credit_transaction_type,
        p_booking_id,
        format('Hold aggiuntivo modifica prenotazione %s (+%s h)', p_booking_id, v_credit_delta),
        v_current_member
      );
    ELSIF v_credit_delta < 0 THEN
      INSERT INTO public.credit_transactions (
        member_id, amount, type, booking_id, reason, created_by
      ) VALUES (
        v_booking.member_id,
        ABS(v_credit_delta),
        'release'::public.credit_transaction_type,
        p_booking_id,
        format('Release hold modifica prenotazione %s (%s h)', p_booking_id, ABS(v_credit_delta)),
        v_current_member
      );
    END IF;

    UPDATE public.bookings
    SET credits_held = v_new_credit_hours
    WHERE id = p_booking_id;
  END IF;

  BEGIN
    UPDATE public.bookings
    SET
      start_at = p_start_at,
      end_at = p_end_at,
      duration_minutes = v_duration,
      total_price_eur = v_price
    WHERE id = p_booking_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;

  v_audit_id := public.log_booking_audit(
    p_booking_id,
    v_current_member,
    'modify',
    jsonb_build_object(
      'old_start_at', v_booking.start_at,
      'old_end_at', v_booking.end_at,
      'old_duration_minutes', v_booking.duration_minutes,
      'old_total_price_eur', v_booking.total_price_eur,
      'new_start_at', p_start_at,
      'new_end_at', p_end_at,
      'new_duration_minutes', v_duration,
      'new_total_price_eur', v_price
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'start_at', p_start_at,
    'end_at', p_end_at,
    'duration_minutes', v_duration,
    'total_price_eur', v_price,
    'audit_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.modify_booking_safe(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) TO authenticated;

COMMENT ON FUNCTION public.modify_booking_safe IS
  'Modifica orario/durata associato (soglia booking_modify_min_hours). Sync hold crediti se pending_approval.';

-- ---------------------------------------------------------------------------
-- cancel_booking_safe — include stripe_refund plan in response
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_safe(
  p_booking_id UUID,
  p_skip_penalty BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_cancel_hours INTEGER;
  v_lead_hours NUMERIC;
  v_is_staff BOOLEAN;
  v_penalty_override INTEGER;
  v_credit_result JSONB;
  v_audit_id UUID;
  v_stripe_plan JSONB;
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

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CANCELLED',
      'error_message', 'Prenotazione già annullata.'
    );
  END IF;

  v_is_staff := public.is_admin_or_segreteria();

  -- Segreteria can cancel any booking (same as canManageBookings in app).
  IF v_booking.member_id IS DISTINCT FROM v_current_member AND NOT v_is_staff THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi annullare questa prenotazione.'
    );
  END IF;

  IF NOT v_is_staff THEN
    v_cancel_hours := public.get_booking_setting_int('booking_cancel_min_hours', 24);
    v_lead_hours := public.booking_lead_time_hours(v_booking.start_at);

    IF v_lead_hours < v_cancel_hours THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'CANCEL_TOO_LATE',
        'error_message', format(
          'Annullamento non consentito a meno di %s ore dall''inizio. Contatta la segreteria.',
          v_cancel_hours
        )
      );
    END IF;
  END IF;

  v_stripe_plan := public.booking_stripe_refund_plan(
    p_booking_id,
    (v_is_staff AND p_skip_penalty)
  );

  IF v_booking.payment_method = 'credits'
     AND COALESCE(v_booking.credits_used, 0) > 0 THEN
    v_penalty_override := CASE
      WHEN v_is_staff AND p_skip_penalty THEN 0
      ELSE NULL
    END;

    v_credit_result := public.apply_cancellation_penalty_credits(
      p_booking_id,
      v_penalty_override,
      v_current_member
    );

    IF NOT COALESCE((v_credit_result->>'success')::BOOLEAN, false) THEN
      RETURN v_credit_result;
    END IF;
  ELSIF COALESCE(v_booking.credits_held, 0) > 0 THEN
    v_credit_result := public.release_booking_credits_internal(
      p_booking_id,
      v_current_member,
      format('Release hold per cancellazione prenotazione %s', p_booking_id)
    );

    IF NOT COALESCE((v_credit_result->>'success')::BOOLEAN, false) THEN
      RETURN v_credit_result;
    END IF;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    cancelled_by = v_current_member
  WHERE id = p_booking_id;

  v_audit_id := public.log_booking_audit(
    p_booking_id,
    v_current_member,
    'cancel',
    jsonb_build_object(
      'previous_status', v_booking.status::TEXT,
      'new_status', 'cancelled',
      'penalty_skipped', (v_is_staff AND p_skip_penalty),
      'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB),
      'stripe_refund', COALESCE(v_stripe_plan, '{}'::JSONB)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'penalty_skipped', (v_is_staff AND p_skip_penalty),
    'credit_adjustment', COALESCE(v_credit_result, '{}'::JSONB),
    'credits_penalty', COALESCE((v_credit_result->>'penalty_credits')::INTEGER, NULL),
    'penalty_percent', COALESCE((v_credit_result->>'penalty_percent')::INTEGER, NULL),
    'credits_refunded', COALESCE((v_credit_result->>'refund_credits')::INTEGER, NULL),
    'penalty_applied', COALESCE((v_credit_result->>'penalty_applied')::BOOLEAN, false),
    'stripe_refund', COALESCE(v_stripe_plan, '{}'::JSONB),
    'audit_id', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_booking_safe IS
  'Annullamento con penale crediti e piano rimborso Stripe (elaborato lato app).';

GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

GRANT EXECUTE ON FUNCTION public.apply_stripe_room_booking_payment(
  UUID, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- admin_update_booking_safe: use full pricing (sconti durata + PROVI orario)
DO $$
DECLARE
  src text;
  patched text;
  old_block text :=
    'v_price_old := COALESCE(v_booking.total_price_eur, 0);
  v_price_new := public.booking_price_eur(v_room.hourly_rate_eur, p_duration_minutes);

  IF v_booking.provi_da_solo AND v_room.provi_da_solo_discount_eur > 0 THEN
    v_price_new := GREATEST(0, v_price_new - public.booking_provi_discount_total_eur(v_room.provi_da_solo_discount_eur, p_duration_minutes));
  END IF;';
  new_block text :=
    'v_price_old := COALESCE(v_booking.total_price_eur, 0);
  v_price_new := public.booking_total_price_eur(
    p_room_id,
    p_duration_minutes,
    COALESCE(v_booking.provi_da_solo, false),
    COALESCE(
      (SELECT array_agg(bo.room_option_id) FROM public.booking_options bo WHERE bo.booking_id = p_booking_id),
      ARRAY[]::UUID[]
    )
  );';
BEGIN
  src := pg_get_functiondef(
    'public.admin_update_booking_safe(uuid, uuid, timestamptz, timestamptz, integer, text, text)'::regprocedure
  );
  -- Try hourly-discount form first (post-043), then flat form.
  IF position(old_block IN src) = 0 THEN
    old_block :=
      'v_price_old := COALESCE(v_booking.total_price_eur, 0);
  v_price_new := public.booking_price_eur(v_room.hourly_rate_eur, p_duration_minutes);

  IF v_booking.provi_da_solo AND v_room.provi_da_solo_discount_eur > 0 THEN
    v_price_new := GREATEST(0, v_price_new - v_room.provi_da_solo_discount_eur);
  END IF;';
  END IF;

  IF position(old_block IN src) = 0 THEN
    RAISE NOTICE 'admin_update_booking_safe: pricing block not patched (already custom?).';
  ELSE
    patched := replace(src, old_block, new_block);
    EXECUTE patched;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
