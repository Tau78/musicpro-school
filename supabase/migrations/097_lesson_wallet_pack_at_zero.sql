-- Apre retta pacchetto quando il saldo lezioni arriva a 0 (4ª presenza consumata).
-- Restituisce enrollment_id per cui è stata aperta una nuova retta (notifica pagamento in app).

CREATE OR REPLACE FUNCTION public.sync_lesson_wallet_after_attendance(p_lesson_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson     public.lessons%ROWTYPE;
  v_course     public.courses%ROWTYPE;
  v_actor      UUID := public.current_member_id();
  v_row        RECORD;
  v_enroll     public.course_enrollments%ROWTYPE;
  v_balance    INTEGER;
  v_debt       INTEGER;
  v_open_n     INTEGER;
  v_needed     INTEGER;
  v_consumed   INTEGER := 0;
  v_reversed   INTEGER := 0;
  v_opened     INTEGER := 0;
  v_orphans    INTEGER := 0;
  v_pack_opened_enrollment_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autenticato.');
  END IF;

  SELECT * INTO v_lesson FROM public.lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lezione non trovata.');
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = v_lesson.course_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Corso non trovato.');
  END IF;

  IF NOT (
    public.is_admin_or_segreteria()
    OR public.is_course_teacher(v_course.id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorizzato.');
  END IF;

  IF COALESCE(v_course.is_trial, false) OR v_lesson.kind = 'prova' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'prova');
  END IF;

  FOR v_row IN
    SELECT la.member_id, la.status
    FROM public.lesson_attendances la
    WHERE la.lesson_id = p_lesson_id
  LOOP
    SELECT * INTO v_enroll
    FROM public.course_enrollments ce
    WHERE ce.course_id = v_course.id
      AND ce.member_id = v_row.member_id
      AND ce.left_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_row.status IN ('presente', 'assente') AND v_course.status = 'attivo' THEN
      INSERT INTO public.lesson_credit_ledger (
        course_enrollment_id, member_id, course_id, delta, kind, lesson_id, created_by
      )
      VALUES (
        v_enroll.id, v_row.member_id, v_course.id, -1, 'consumo', p_lesson_id, v_actor
      )
      ON CONFLICT (lesson_id, member_id) WHERE kind = 'consumo'
      DO NOTHING;
      IF FOUND THEN
        v_consumed := v_consumed + 1;
      END IF;
    ELSE
      DELETE FROM public.lesson_credit_ledger
      WHERE lesson_id = p_lesson_id
        AND member_id = v_row.member_id
        AND kind = 'consumo';
      IF FOUND THEN
        v_reversed := v_reversed + 1;
      END IF;
    END IF;

    SELECT COALESCE(SUM(delta), 0) INTO v_balance
    FROM public.lesson_credit_ledger
    WHERE course_enrollment_id = v_enroll.id;

    IF v_course.status IS DISTINCT FROM 'attivo' OR COALESCE(v_course.price_eur, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_debt := GREATEST(0, -v_balance);
    v_needed := CASE WHEN v_debt > 0 THEN CEIL(v_debt::NUMERIC / 4) ELSE 0 END;

    SELECT COUNT(*)::INTEGER INTO v_open_n
    FROM public.lesson_fees f
    WHERE f.course_enrollment_id = v_enroll.id
      AND f.kind = 'pack'
      AND f.status IN ('aperta', 'parziale');

    IF v_balance <= 0 AND v_open_n = 0 AND v_needed = 0 THEN
      v_needed := 1;
    END IF;

    WHILE v_open_n < v_needed LOOP
      INSERT INTO public.lesson_fees (
        course_enrollment_id, member_id, course_id, kind, status,
        amount_eur, remaining_eur, due_on
      )
      VALUES (
        v_enroll.id, v_row.member_id, v_course.id, 'pack', 'aperta',
        v_course.price_eur, v_course.price_eur, (now() AT TIME ZONE 'Europe/Rome')::DATE
      );
      v_open_n := v_open_n + 1;
      v_opened := v_opened + 1;
      v_pack_opened_enrollment_ids :=
        array_append(v_pack_opened_enrollment_ids, v_enroll.id);
    END LOOP;
  END LOOP;

  DELETE FROM public.lesson_credit_ledger l
  WHERE l.lesson_id = p_lesson_id
    AND l.kind = 'consumo'
    AND NOT EXISTS (
      SELECT 1
      FROM public.lesson_attendances la
      WHERE la.lesson_id = p_lesson_id
        AND la.member_id = l.member_id
        AND la.status IN ('presente', 'assente')
    );
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  v_reversed := v_reversed + v_orphans;

  RETURN jsonb_build_object(
    'success', true,
    'consumed', v_consumed,
    'reversed', v_reversed,
    'fees_opened', v_opened,
    'pack_opened_enrollment_ids', to_jsonb(v_pack_opened_enrollment_ids)
  );
END;
$$;
