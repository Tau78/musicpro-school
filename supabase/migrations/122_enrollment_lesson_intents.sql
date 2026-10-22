-- Enrollment lesson intent: scelta corso a iscrizione + pagamento primo pack (Nexi) prima della riconciliazione staff.

-- ---------------------------------------------------------------------------
-- enrollment_lesson_intents
-- ---------------------------------------------------------------------------
CREATE TABLE public.enrollment_lesson_intents (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_enrollment_id        UUID NOT NULL REFERENCES public.enrollments (id) ON DELETE CASCADE,
  member_id                       UUID REFERENCES public.members (id) ON DELETE SET NULL,
  requested_course_id             UUID NOT NULL REFERENCES public.courses (id) ON DELETE RESTRICT,
  preferred_teacher_member_id     UUID REFERENCES public.members (id) ON DELETE SET NULL,
  pay_first_pack_with_quota       BOOLEAN NOT NULL DEFAULT false,
  lesson_pack_payment_id          UUID,
  status                          TEXT NOT NULL DEFAULT 'pending',
  converted_course_id             UUID REFERENCES public.courses (id) ON DELETE SET NULL,
  converted_course_enrollment_id  UUID REFERENCES public.course_enrollments (id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT enrollment_lesson_intents_status_check
    CHECK (status IN ('pending', 'paid_unreconciled', 'converted', 'cancelled'))
);

CREATE UNIQUE INDEX enrollment_lesson_intents_one_active_per_membership_uidx
  ON public.enrollment_lesson_intents (membership_enrollment_id)
  WHERE status <> 'cancelled';

CREATE INDEX idx_enrollment_lesson_intents_status
  ON public.enrollment_lesson_intents (status, created_at DESC);

CREATE INDEX idx_enrollment_lesson_intents_preferred_teacher
  ON public.enrollment_lesson_intents (preferred_teacher_member_id)
  WHERE preferred_teacher_member_id IS NOT NULL;

CREATE TRIGGER trg_enrollment_lesson_intents_updated_at
  BEFORE UPDATE ON public.enrollment_lesson_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.enrollment_lesson_intents IS
  'Intento lezione scelto durante iscrizione associativa; riconciliato in iscrizione corso regolare.';

ALTER TABLE public.lesson_pack_payments
  ADD COLUMN IF NOT EXISTS enrollment_lesson_intent_id UUID
    REFERENCES public.enrollment_lesson_intents (id) ON DELETE SET NULL;

CREATE INDEX idx_lesson_pack_payments_enrollment_intent
  ON public.lesson_pack_payments (enrollment_lesson_intent_id)
  WHERE enrollment_lesson_intent_id IS NOT NULL;

ALTER TABLE public.enrollment_lesson_intents
  ADD CONSTRAINT enrollment_lesson_intents_pack_payment_fkey
  FOREIGN KEY (lesson_pack_payment_id)
  REFERENCES public.lesson_pack_payments (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.enrollment_lesson_intents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.enrollment_lesson_intents TO authenticated;

CREATE POLICY "enrollment_lesson_intents_staff"
  ON public.enrollment_lesson_intents FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "enrollment_lesson_intents_select_member"
  ON public.enrollment_lesson_intents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.id = membership_enrollment_id
        AND (
          e.member_id = public.current_member_id()
          OR lower(e.email) = (
            SELECT lower(m.email)
            FROM public.members m
            WHERE m.id = public.current_member_id()
          )
        )
    )
  );

CREATE POLICY "enrollment_lesson_intents_teacher_select"
  ON public.enrollment_lesson_intents FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND (
      preferred_teacher_member_id = public.current_member_id()
      OR EXISTS (
        SELECT 1
        FROM public.courses c
        WHERE c.id = converted_course_id
          AND c.titular_member_id = public.current_member_id()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- apply_lesson_pack_payment — hold funds while intent has no target pack fee
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_lesson_pack_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay          public.lesson_pack_payments%ROWTYPE;
  v_intent       public.enrollment_lesson_intents%ROWTYPE;
  v_left         NUMERIC(10, 2);
  v_family_left  NUMERIC(10, 2);
  v_fee          public.lesson_fees%ROWTYPE;
  v_take         NUMERIC(10, 2);
  v_enroll       public.course_enrollments%ROWTYPE;
  v_course       public.courses%ROWTYPE;
  v_lesson_price NUMERIC(10, 2);
  v_extra        INTEGER;
  v_cents_left   NUMERIC(10, 2);
  v_closed       INTEGER := 0;
  v_credits      INTEGER := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_segreteria()
     AND NOT EXISTS (
       SELECT 1
       FROM public.lesson_pack_payments p
       JOIN public.course_enrollments e
         ON e.member_id = p.member_id AND e.left_at IS NULL
       JOIN public.courses c ON c.id = e.course_id
       WHERE p.id = p_payment_id
         AND p.created_by = public.current_member_id()
         AND p.method = 'contanti'
         AND c.titular_member_id = public.current_member_id()
     )
  THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorizzato.');
  END IF;

  SELECT * INTO v_pay
  FROM public.lesson_pack_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pagamento non trovato.');
  END IF;

  IF v_pay.method = 'stripe' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'I pagamenti Stripe si chiudono solo dal webhook.'
    );
  END IF;

  IF v_pay.status = 'completed' AND (
    EXISTS (SELECT 1 FROM public.lesson_fee_allocations a WHERE a.payment_id = v_pay.id)
    OR EXISTS (
      SELECT 1 FROM public.lesson_credit_ledger l
      WHERE l.lesson_payment_id = v_pay.id
    )
    OR v_pay.enrollment_lesson_intent_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'payment_id', v_pay.id);
  END IF;

  IF v_pay.enrollment_lesson_intent_id IS NOT NULL THEN
    SELECT * INTO v_intent
    FROM public.enrollment_lesson_intents
    WHERE id = v_pay.enrollment_lesson_intent_id
    FOR UPDATE;

    IF FOUND
       AND v_intent.status IN ('pending', 'paid_unreconciled')
       AND NOT EXISTS (
         SELECT 1
         FROM public.lesson_fees f
         WHERE f.course_enrollment_id = v_intent.converted_course_enrollment_id
           AND f.kind = 'pack'
           AND f.status IN ('aperta', 'parziale')
       )
    THEN
      v_left := v_pay.amount_eur;
      SELECT leftover_eur INTO v_family_left
      FROM public.lesson_family_accounts
      WHERE family_key = v_pay.family_key
      FOR UPDATE;
      IF FOUND THEN
        v_left := v_left + COALESCE(v_family_left, 0);
        UPDATE public.lesson_family_accounts
        SET leftover_eur = 0, updated_at = now()
        WHERE family_key = v_pay.family_key;
      END IF;

      v_cents_left := GREATEST(v_left, 0);

      INSERT INTO public.lesson_family_accounts (family_key, leftover_eur)
      VALUES (v_pay.family_key, v_cents_left)
      ON CONFLICT (family_key) DO UPDATE SET
        leftover_eur = EXCLUDED.leftover_eur,
        updated_at = now();

      UPDATE public.lesson_pack_payments
      SET
        status = 'completed',
        paid_on = COALESCE(paid_on, (now() AT TIME ZONE 'Europe/Rome')::DATE)
      WHERE id = v_pay.id;

      IF v_intent.status = 'pending' THEN
        UPDATE public.enrollment_lesson_intents
        SET status = 'paid_unreconciled', updated_at = now()
        WHERE id = v_intent.id;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_pay.id,
        'held_for_intent', true,
        'leftover_eur', v_cents_left,
        'intent_id', v_intent.id
      );
    END IF;
  END IF;

  v_left := v_pay.amount_eur;
  SELECT leftover_eur INTO v_family_left
  FROM public.lesson_family_accounts
  WHERE family_key = v_pay.family_key
  FOR UPDATE;
  IF FOUND THEN
    v_left := v_left + COALESCE(v_family_left, 0);
    UPDATE public.lesson_family_accounts
    SET leftover_eur = 0, updated_at = now()
    WHERE family_key = v_pay.family_key;
  END IF;

  FOR v_fee IN
    SELECT f.*
    FROM public.lesson_fees f
    JOIN public.members m ON m.id = f.member_id
    WHERE f.status IN ('aperta', 'parziale')
      AND public.lesson_family_key(f.member_id) = v_pay.family_key
    ORDER BY f.due_on ASC, f.created_at ASC
    FOR UPDATE OF f
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_fee.remaining_eur, v_left);
    IF v_take <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.lesson_fee_allocations (payment_id, fee_id, amount_eur)
    VALUES (v_pay.id, v_fee.id, v_take);

    UPDATE public.lesson_fees
    SET
      remaining_eur = remaining_eur - v_take,
      status = CASE
        WHEN remaining_eur - v_take <= 0 THEN 'saldata'
        ELSE 'parziale'
      END
    WHERE id = v_fee.id;

    v_left := v_left - v_take;

    IF v_fee.kind = 'pack' AND v_fee.remaining_eur - v_take <= 0 THEN
      SELECT * INTO v_enroll FROM public.course_enrollments WHERE id = v_fee.course_enrollment_id;
      IF FOUND THEN
        SELECT * INTO v_course FROM public.courses WHERE id = v_enroll.course_id;
        IF FOUND AND COALESCE(v_course.is_trial, false) = false THEN
          INSERT INTO public.lesson_credit_ledger (
            course_enrollment_id, member_id, course_id, delta, kind,
            lesson_fee_id, lesson_payment_id, created_by
          )
          VALUES (
            v_enroll.id, v_enroll.member_id, v_enroll.course_id, 4, 'pack',
            v_fee.id, v_pay.id, v_pay.created_by
          );
          v_credits := v_credits + 4;
        END IF;
      END IF;
      v_closed := v_closed + 1;
    END IF;

    IF v_fee.kind = 'quota' AND v_fee.remaining_eur - v_take <= 0 THEN
      INSERT INTO public.member_annual_quotas (
        member_id, fiscal_year, paid_at, amount_paid_eur, amount_due_eur
      )
      VALUES (
        v_fee.member_id,
        EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Rome'))::INTEGER,
        now(),
        v_fee.amount_eur,
        v_fee.amount_eur
      )
      ON CONFLICT (member_id, fiscal_year)
      DO UPDATE SET
        paid_at = EXCLUDED.paid_at,
        amount_paid_eur = EXCLUDED.amount_paid_eur,
        updated_at = now();
      v_closed := v_closed + 1;
    END IF;
  END LOOP;

  IF v_left > 0 THEN
    SELECT ce.*
    INTO v_enroll
    FROM public.course_enrollments ce
    JOIN public.courses c ON c.id = ce.course_id
    WHERE ce.left_at IS NULL
      AND ce.member_id = v_pay.member_id
      AND COALESCE(c.is_trial, false) = false
      AND c.status = 'attivo'
      AND COALESCE(c.price_eur, 0) > 0
    ORDER BY ce.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT ce.*
      INTO v_enroll
      FROM public.course_enrollments ce
      JOIN public.courses c ON c.id = ce.course_id
      WHERE ce.left_at IS NULL
        AND COALESCE(c.is_trial, false) = false
        AND c.status = 'attivo'
        AND public.lesson_family_key(ce.member_id) = v_pay.family_key
        AND COALESCE(c.price_eur, 0) > 0
      ORDER BY ce.created_at ASC
      LIMIT 1;
    END IF;

    IF FOUND THEN
      SELECT * INTO v_course FROM public.courses WHERE id = v_enroll.course_id;
      v_lesson_price := ROUND(v_course.price_eur / 4, 2);
      IF v_lesson_price > 0 THEN
        v_extra := FLOOR(v_left / v_lesson_price);
        IF v_extra > 0 THEN
          INSERT INTO public.lesson_credit_ledger (
            course_enrollment_id, member_id, course_id, delta, kind,
            lesson_payment_id, note, created_by
          )
          VALUES (
            v_enroll.id, v_enroll.member_id, v_enroll.course_id, v_extra,
            'anticipo_famiglia', v_pay.id, 'Anticipo famiglia', v_pay.created_by
          );
          v_credits := v_credits + v_extra;
          v_left := v_left - (v_extra * v_lesson_price);
        END IF;
      END IF;
    END IF;
  END IF;

  v_cents_left := GREATEST(v_left, 0);

  INSERT INTO public.lesson_family_accounts (family_key, leftover_eur)
  VALUES (v_pay.family_key, v_cents_left)
  ON CONFLICT (family_key) DO UPDATE SET
    leftover_eur = EXCLUDED.leftover_eur,
    updated_at = now();

  UPDATE public.lesson_pack_payments
  SET
    status = 'completed',
    paid_on = COALESCE(paid_on, (now() AT TIME ZONE 'Europe/Rome')::DATE)
  WHERE id = v_pay.id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_pay.id,
    'fees_closed', v_closed,
    'credits_granted', v_credits,
    'leftover_eur', v_cents_left
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- reconcile_enrollment_lesson_intent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_enrollment_lesson_intent(
  p_intent_id UUID,
  p_actor_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent           public.enrollment_lesson_intents%ROWTYPE;
  v_membership       public.enrollments%ROWTYPE;
  v_requested        public.courses%ROWTYPE;
  v_member_id        UUID;
  v_titular_id       UUID;
  v_course_id        UUID;
  v_enrollment_id    UUID;
  v_active_count     INTEGER;
  v_member           public.members%ROWTYPE;
  v_subject_name     TEXT;
  v_course_name      TEXT;
  v_pay              public.lesson_pack_payments%ROWTYPE;
  v_apply            JSONB;
  v_price            NUMERIC(10, 2);
  v_rome_today       DATE := (now() AT TIME ZONE 'Europe/Rome')::DATE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin_or_segreteria()
  THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorizzato.');
  END IF;

  SELECT * INTO v_intent
  FROM public.enrollment_lesson_intents
  WHERE id = p_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Intento non trovato.');
  END IF;

  IF v_intent.status = 'converted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'intent_id', v_intent.id,
      'course_id', v_intent.converted_course_id,
      'enrollment_id', v_intent.converted_course_enrollment_id
    );
  END IF;

  IF v_intent.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Intento annullato.');
  END IF;

  SELECT * INTO v_membership
  FROM public.enrollments
  WHERE id = v_intent.membership_enrollment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Iscrizione associativa non trovata.');
  END IF;

  v_member_id := COALESCE(v_intent.member_id, v_membership.member_id);
  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Allievo non collegato all''iscrizione.');
  END IF;

  SELECT * INTO v_requested
  FROM public.courses
  WHERE id = v_intent.requested_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Corso richiesto non trovato.');
  END IF;

  IF v_requested.course_kind = 'gruppo' THEN
    IF v_requested.status NOT IN ('attivo', 'in_attesa', 'in_pausa') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Il corso di gruppo non accetta iscrizioni.');
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_active_count
    FROM public.course_enrollments ce
    WHERE ce.course_id = v_requested.id
      AND ce.left_at IS NULL;

    IF v_active_count >= v_requested.max_students THEN
      RETURN jsonb_build_object('success', false, 'message', 'Corso di gruppo al completo.');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.course_enrollments ce
      WHERE ce.course_id = v_requested.id
        AND ce.member_id = v_member_id
        AND ce.left_at IS NULL
    ) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Allievo già iscritto al corso.');
    END IF;

    v_course_id := v_requested.id;

    INSERT INTO public.course_enrollments (course_id, member_id)
    VALUES (v_course_id, v_member_id)
    RETURNING id INTO v_enrollment_id;
  ELSE
    v_titular_id := COALESCE(
      v_intent.preferred_teacher_member_id,
      v_requested.titular_member_id
    );

    SELECT * INTO v_member FROM public.members WHERE id = v_member_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Allievo non trovato.');
    END IF;

    SELECT name INTO v_subject_name
    FROM public.lesson_subjects
    WHERE id = v_requested.subject_id;

    v_course_name := COALESCE(v_subject_name, 'Lezione') || ' — '
      || trim(COALESCE(v_member.last_name, '') || ' ' || COALESCE(v_member.first_name, ''));

    INSERT INTO public.courses (
      name,
      course_kind,
      status,
      subject_id,
      titular_member_id,
      room_id,
      duration_minutes,
      weekly_dow,
      weekly_start_minute,
      starts_on,
      term_id,
      max_students,
      price_eur,
      pay_rate_type_id,
      pay_amount_eur,
      counts_as_hour,
      created_by
    )
    VALUES (
      v_course_name,
      v_requested.course_kind,
      'attivo',
      v_requested.subject_id,
      v_titular_id,
      v_requested.room_id,
      v_requested.duration_minutes,
      v_requested.weekly_dow,
      v_requested.weekly_start_minute,
      GREATEST(v_requested.starts_on, v_rome_today),
      v_requested.term_id,
      1,
      v_requested.price_eur,
      v_requested.pay_rate_type_id,
      v_requested.pay_amount_eur,
      v_requested.counts_as_hour,
      p_actor_member_id
    )
    RETURNING id INTO v_course_id;

    INSERT INTO public.course_teachers (
      course_id, member_id, role, starts_on
    )
    VALUES (
      v_course_id, v_titular_id, 'titolare', GREATEST(v_requested.starts_on, v_rome_today)
    );

    PERFORM public.assign_default_tutor_on_course(v_course_id);

    INSERT INTO public.course_enrollments (course_id, member_id)
    VALUES (v_course_id, v_member_id)
    RETURNING id INTO v_enrollment_id;
  END IF;

  UPDATE public.enrollment_lesson_intents
  SET
    member_id = v_member_id,
    converted_course_id = v_course_id,
    converted_course_enrollment_id = v_enrollment_id,
    updated_at = now()
  WHERE id = v_intent.id;

  IF v_intent.pay_first_pack_with_quota
     AND v_intent.lesson_pack_payment_id IS NOT NULL
  THEN
    SELECT * INTO v_pay
    FROM public.lesson_pack_payments
    WHERE id = v_intent.lesson_pack_payment_id
    FOR UPDATE;

    IF FOUND AND v_pay.status = 'completed' THEN
      SELECT price_eur INTO v_price FROM public.courses WHERE id = v_course_id;
      IF COALESCE(v_price, 0) > 0
         AND NOT EXISTS (
           SELECT 1
           FROM public.lesson_fees f
           WHERE f.course_enrollment_id = v_enrollment_id
             AND f.kind = 'pack'
             AND f.status IN ('aperta', 'parziale')
         )
      THEN
        INSERT INTO public.lesson_fees (
          course_enrollment_id,
          member_id,
          course_id,
          kind,
          status,
          amount_eur,
          remaining_eur,
          due_on
        )
        VALUES (
          v_enrollment_id,
          v_member_id,
          v_course_id,
          'pack',
          'aperta',
          v_price,
          v_price,
          v_rome_today
        );
      END IF;

      SELECT public.apply_lesson_pack_payment(v_pay.id) INTO v_apply;
      IF COALESCE(v_apply->>'success', 'false') <> 'true' THEN
        RETURN jsonb_build_object(
          'success', false,
          'message', COALESCE(v_apply->>'message', 'Applicazione pagamento pack fallita.'),
          'course_id', v_course_id,
          'enrollment_id', v_enrollment_id,
          'apply', v_apply
        );
      END IF;
    ELSIF FOUND AND v_pay.status = 'pending' THEN
      NULL;
    END IF;
  ELSIF v_intent.pay_first_pack_with_quota THEN
    SELECT price_eur INTO v_price FROM public.courses WHERE id = v_course_id;
    IF COALESCE(v_price, 0) > 0
       AND NOT EXISTS (
         SELECT 1
         FROM public.lesson_fees f
         WHERE f.course_enrollment_id = v_enrollment_id
           AND f.kind = 'pack'
           AND f.status IN ('aperta', 'parziale')
       )
    THEN
      INSERT INTO public.lesson_fees (
        course_enrollment_id,
        member_id,
        course_id,
        kind,
        status,
        amount_eur,
        remaining_eur,
        due_on
      )
      VALUES (
        v_enrollment_id,
        v_member_id,
        v_course_id,
        'pack',
        'aperta',
        v_price,
        v_price,
        v_rome_today
      );
    END IF;
  END IF;

  UPDATE public.enrollment_lesson_intents
  SET status = 'converted', updated_at = now()
  WHERE id = v_intent.id;

  RETURN jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'course_id', v_course_id,
    'enrollment_id', v_enrollment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_enrollment_lesson_intent(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_enrollment_lesson_intent(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_enrollment_lesson_intent(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.reconcile_enrollment_lesson_intent(UUID, UUID) IS
  'Staff: converte intento iscrizione in iscrizione corso (gruppo o clone individuale) e applica pack pagato se presente.';

-- ---------------------------------------------------------------------------
-- apply_nexi_payment — iscrizione associativa pagata via lesson_pack combinato
-- ---------------------------------------------------------------------------
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
  v_iscrizione_id uuid;
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

    v_iscrizione_id := COALESCE(
      v_order.enrollment_id,
      NULLIF(v_order.metadata->>'mp_iscrizione_enrollment_id', '')::uuid
    );
    IF v_iscrizione_id IS NOT NULL THEN
      UPDATE public.enrollments
      SET
        payment_status = 'PAGATO',
        paid_at = COALESCE(paid_at, now())
      WHERE id = v_iscrizione_id
        AND upper(trim(coalesce(payment_status, ''))) <> 'PAGATO';
    END IF;
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

REVOKE ALL ON FUNCTION public.apply_nexi_payment(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_nexi_payment(text, text, text, integer) TO service_role;
