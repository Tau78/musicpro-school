-- MusicPro School — Fetta 9+9b: wallet crediti lezione + rette + incasso
-- Timezone: Europe/Rome in app; date/timestamptz UTC in DB.
-- Ricevute PDF = fetta 10b. Contanti docente = fetta 10.

-- ---------------------------------------------------------------------------
-- courses_insert_docente — prova è attiva subito (fetta 8 gap)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "courses_insert_docente" ON public.courses;

CREATE POLICY "courses_insert_docente"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND titular_member_id = public.current_member_id()
    AND created_by = public.current_member_id()
    AND (
      status = 'in_attesa'
      OR (status = 'attivo' AND COALESCE(is_trial, false) = true)
    )
  );

-- ---------------------------------------------------------------------------
-- Quota pagata → chiudi bozza anagrafica (ponte 8b)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_enrollment_draft_on_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.members
  SET
    is_enrollment_draft = false,
    draft_expires_at = NULL,
    enrolled_at = COALESCE(enrolled_at, now())
  WHERE id = NEW.member_id
    AND is_enrollment_draft = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_annual_quotas_clear_draft ON public.member_annual_quotas;

CREATE TRIGGER trg_member_annual_quotas_clear_draft
  AFTER INSERT OR UPDATE OF paid_at ON public.member_annual_quotas
  FOR EACH ROW
  WHEN (NEW.paid_at IS NOT NULL)
  EXECUTE FUNCTION public.clear_enrollment_draft_on_quota();

-- ---------------------------------------------------------------------------
-- lesson_family_accounts — acconto € residuo (centesimi dopo i crediti)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_family_accounts (
  family_key    TEXT PRIMARY KEY,
  leftover_eur  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_family_accounts_leftover_check CHECK (leftover_eur >= 0)
);

COMMENT ON TABLE public.lesson_family_accounts IS
  'Acconto euro famiglia dopo FIFO rette e conversione in crediti lezione.';

CREATE TRIGGER trg_lesson_family_accounts_updated_at
  BEFORE UPDATE ON public.lesson_family_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_fees — rette pack (e riga quota opzionale)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_fees (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_enrollment_id  UUID REFERENCES public.course_enrollments (id) ON DELETE CASCADE,
  member_id             UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  course_id             UUID REFERENCES public.courses (id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'aperta',
  amount_eur            NUMERIC(10, 2) NOT NULL,
  remaining_eur         NUMERIC(10, 2) NOT NULL,
  due_on                DATE NOT NULL,
  last_dunning_at       TIMESTAMPTZ,
  dunning_count         INTEGER NOT NULL DEFAULT 0,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_fees_kind_check
    CHECK (kind IN ('pack', 'quota')),
  CONSTRAINT lesson_fees_status_check
    CHECK (status IN ('aperta', 'parziale', 'saldata', 'abbuonata')),
  CONSTRAINT lesson_fees_amount_check
    CHECK (amount_eur >= 0 AND remaining_eur >= 0 AND remaining_eur <= amount_eur),
  CONSTRAINT lesson_fees_dunning_check
    CHECK (dunning_count >= 0),
  CONSTRAINT lesson_fees_pack_enrollment_check
    CHECK (kind <> 'pack' OR course_enrollment_id IS NOT NULL)
);

CREATE INDEX idx_lesson_fees_due
  ON public.lesson_fees (due_on, status);

CREATE INDEX idx_lesson_fees_member
  ON public.lesson_fees (member_id);

CREATE INDEX idx_lesson_fees_enrollment
  ON public.lesson_fees (course_enrollment_id);

COMMENT ON TABLE public.lesson_fees IS
  'Rette famiglia: pack da 4 o quota associativa. Scadenza default = giorno di apertura.';

CREATE TRIGGER trg_lesson_fees_updated_at
  BEFORE UPDATE ON public.lesson_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_pack_payments — incasso (Stripe / bonifico / altro)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_pack_payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_key                TEXT NOT NULL,
  member_id                 UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  amount_eur                NUMERIC(10, 2) NOT NULL,
  method                    TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending',
  paid_on                   DATE,
  note                      TEXT,
  cro                       TEXT,
  include_quota             BOOLEAN NOT NULL DEFAULT false,
  stripe_payment_intent_id  TEXT,
  stripe_payment_link_id    TEXT,
  stripe_payment_link_url   TEXT,
  stripe_event_id           TEXT,
  created_by                UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_pack_payments_method_check
    CHECK (method IN ('stripe', 'bonifico', 'contanti', 'altro')),
  CONSTRAINT lesson_pack_payments_status_check
    CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT lesson_pack_payments_amount_check
    CHECK (amount_eur >= 0)
);

CREATE UNIQUE INDEX idx_lesson_pack_payments_stripe_event
  ON public.lesson_pack_payments (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX idx_lesson_pack_payments_family
  ON public.lesson_pack_payments (family_key, created_at DESC);

CREATE INDEX idx_lesson_pack_payments_link
  ON public.lesson_pack_payments (stripe_payment_link_id)
  WHERE stripe_payment_link_id IS NOT NULL;

COMMENT ON TABLE public.lesson_pack_payments IS
  'Incasso famiglia su rette lezione. Contanti docente (notula) = fetta 10.';

CREATE TRIGGER trg_lesson_pack_payments_updated_at
  BEFORE UPDATE ON public.lesson_pack_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_fee_allocations — spalmatura FIFO
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_fee_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  UUID NOT NULL REFERENCES public.lesson_pack_payments (id) ON DELETE CASCADE,
  fee_id      UUID NOT NULL REFERENCES public.lesson_fees (id) ON DELETE CASCADE,
  amount_eur  NUMERIC(10, 2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_fee_allocations_amount_check CHECK (amount_eur > 0)
);

CREATE INDEX idx_lesson_fee_allocations_payment
  ON public.lesson_fee_allocations (payment_id);

CREATE INDEX idx_lesson_fee_allocations_fee
  ON public.lesson_fee_allocations (fee_id);

-- ---------------------------------------------------------------------------
-- lesson_credit_ledger — movimenti wallet per iscrizione corso
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_credit_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_enrollment_id  UUID NOT NULL REFERENCES public.course_enrollments (id) ON DELETE CASCADE,
  member_id             UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  course_id             UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  delta                 INTEGER NOT NULL,
  kind                  TEXT NOT NULL,
  lesson_id             UUID REFERENCES public.lessons (id) ON DELETE SET NULL,
  lesson_fee_id         UUID REFERENCES public.lesson_fees (id) ON DELETE SET NULL,
  lesson_payment_id     UUID REFERENCES public.lesson_pack_payments (id) ON DELETE SET NULL,
  note                  TEXT,
  created_by            UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_credit_ledger_kind_check
    CHECK (kind IN (
      'saldo_iniziale',
      'pack',
      'anticipo_famiglia',
      'consumo',
      'rettifica',
      'spostamento_out',
      'spostamento_in',
      'abbuono',
      'rimborso'
    )),
  CONSTRAINT lesson_credit_ledger_delta_check CHECK (delta <> 0)
);

CREATE UNIQUE INDEX idx_lesson_credit_ledger_consumo
  ON public.lesson_credit_ledger (lesson_id, member_id)
  WHERE kind = 'consumo';

CREATE INDEX idx_lesson_credit_ledger_enrollment
  ON public.lesson_credit_ledger (course_enrollment_id, created_at);

CREATE INDEX idx_lesson_credit_ledger_member
  ON public.lesson_credit_ledger (member_id);

COMMENT ON TABLE public.lesson_credit_ledger IS
  'Wallet crediti lezione. Saldo = sum(delta). Distinto dai crediti sala SHOP.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_family_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_pack_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_fee_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_credit_ledger ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_family_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_fees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_pack_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_fee_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_credit_ledger TO authenticated;

CREATE POLICY "lesson_family_accounts_staff"
  ON public.lesson_family_accounts FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_fees_select_docente"
  ON public.lesson_fees FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND course_id IS NOT NULL
    AND public.is_course_teacher(course_id)
  );

CREATE POLICY "lesson_fees_manage_staff"
  ON public.lesson_fees FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_pack_payments_staff"
  ON public.lesson_pack_payments FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_fee_allocations_staff"
  ON public.lesson_fee_allocations FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_credit_ledger_select_docente"
  ON public.lesson_credit_ledger FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_teacher(course_id)
  );

CREATE POLICY "lesson_credit_ledger_manage_staff"
  ON public.lesson_credit_ledger FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- lesson_family_key(member)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lesson_family_key(p_member_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(lower(trim(m.manual_tutor_email)), '') IS NOT NULL
      THEN 'tutor:' || lower(trim(m.manual_tutor_email))
    ELSE 'member:' || m.id::TEXT
  END
  FROM public.members m
  WHERE m.id = p_member_id;
$$;

COMMENT ON FUNCTION public.lesson_family_key(UUID) IS
  'Chiave famiglia: email tutore manuale, altrimenti solo l''allievo.';

-- ---------------------------------------------------------------------------
-- sync_lesson_wallet_after_attendance — consumo + apertura rette pack
-- ---------------------------------------------------------------------------
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

    IF v_row.status IN ('presente', 'assente') THEN
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

    IF COALESCE(v_course.price_eur, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_debt := GREATEST(0, -v_balance);
    v_needed := CASE WHEN v_debt = 0 THEN 0 ELSE CEIL(v_debt::NUMERIC / 4) END;

    SELECT COUNT(*)::INTEGER INTO v_open_n
    FROM public.lesson_fees f
    WHERE f.course_enrollment_id = v_enroll.id
      AND f.kind = 'pack'
      AND f.status IN ('aperta', 'parziale');

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
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'consumed', v_consumed,
    'reversed', v_reversed,
    'fees_opened', v_opened
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lesson_wallet_after_attendance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_lesson_wallet_after_attendance(UUID) TO authenticated;

COMMENT ON FUNCTION public.sync_lesson_wallet_after_attendance(UUID) IS
  'Dopo il registro: consuma 1 credito su presente/assente; apre rette pack se saldo ≤ 0.';

-- ---------------------------------------------------------------------------
-- apply_lesson_pack_payment — FIFO + crediti + acconto famiglia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_lesson_pack_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay          public.lesson_pack_payments%ROWTYPE;
  v_left         NUMERIC(10, 2);
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
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Non autorizzato.');
  END IF;

  SELECT * INTO v_pay
  FROM public.lesson_pack_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pagamento non trovato.');
  END IF;

  IF v_pay.status = 'completed' AND EXISTS (
    SELECT 1 FROM public.lesson_fee_allocations a WHERE a.payment_id = v_pay.id
  ) THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'payment_id', v_pay.id);
  END IF;

  UPDATE public.lesson_pack_payments
  SET
    status = 'completed',
    paid_on = COALESCE(paid_on, (now() AT TIME ZONE 'Europe/Rome')::DATE)
  WHERE id = v_pay.id;

  v_left := v_pay.amount_eur;

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

  -- Resto → crediti sul primo corso aperto della famiglia, poi acconto €
  IF v_left > 0 THEN
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
    leftover_eur = public.lesson_family_accounts.leftover_eur + EXCLUDED.leftover_eur,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_pay.id,
    'fees_closed', v_closed,
    'credits_granted', v_credits,
    'leftover_eur', v_cents_left
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lesson_pack_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_lesson_pack_payment(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- apply_stripe_lesson_pack_payment — webhook idempotente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stripe_lesson_pack_payment(
  p_stripe_event_id TEXT,
  p_stripe_event_type TEXT,
  p_payment_intent_id TEXT,
  p_payment_link_id TEXT,
  p_amount_cents INTEGER,
  p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id TEXT := NULLIF(trim(COALESCE(p_stripe_event_id, '')), '');
  v_pi_id    TEXT := NULLIF(trim(COALESCE(p_payment_intent_id, '')), '');
  v_link_id  TEXT := NULLIF(trim(COALESCE(p_payment_link_id, '')), '');
  v_pay      public.lesson_pack_payments%ROWTYPE;
  v_amount   NUMERIC(10, 2);
  v_result   JSONB;
BEGIN
  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Evento Stripe mancante.');
  END IF;

  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID pagamento mancante (mp_payment_id).');
  END IF;

  SELECT * INTO v_pay
  FROM public.lesson_pack_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pagamento pack non trovato.');
  END IF;

  IF v_pay.stripe_event_id = v_event_id
     OR (v_pi_id IS NOT NULL AND v_pay.stripe_payment_intent_id = v_pi_id AND v_pay.status = 'completed')
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'payment_id', v_pay.id
    );
  END IF;

  v_amount := CASE
    WHEN p_amount_cents IS NOT NULL AND p_amount_cents >= 0
      THEN ROUND(p_amount_cents::NUMERIC / 100, 2)
    ELSE v_pay.amount_eur
  END;

  UPDATE public.lesson_pack_payments
  SET
    amount_eur = v_amount,
    stripe_event_id = v_event_id,
    stripe_payment_intent_id = COALESCE(v_pi_id, stripe_payment_intent_id),
    stripe_payment_link_id = COALESCE(v_link_id, stripe_payment_link_id)
  WHERE id = v_pay.id;

  SELECT public.apply_lesson_pack_payment(v_pay.id) INTO v_result;
  RETURN v_result || jsonb_build_object('stripe_event_type', p_stripe_event_type);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_lesson_pack_payment(
  TEXT, TEXT, TEXT, TEXT, INTEGER, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_stripe_lesson_pack_payment(
  TEXT, TEXT, TEXT, TEXT, INTEGER, UUID
) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_lesson_pack_payment IS
  'Webhook Stripe pack lezione. Idempotente su stripe_event_id / payment_intent.';
