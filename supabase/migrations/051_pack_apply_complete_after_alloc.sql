-- Audit 4 follow-up: marca completed solo dopo allocazioni/crediti/leftover.

CREATE OR REPLACE FUNCTION public.apply_lesson_pack_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay          public.lesson_pack_payments%ROWTYPE;
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
  ) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'payment_id', v_pay.id);
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

