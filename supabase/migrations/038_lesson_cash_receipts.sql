-- MusicPro School — Fette 10 + 10b: cassa docente, anticipo, ricevute S/n/y
-- Email reminder / sposta = fetta 14 (app). Notula didattica = fetta 11.

-- ---------------------------------------------------------------------------
-- Contatore ricevute per anno solare
-- ---------------------------------------------------------------------------
CREATE TABLE public.fiscal_receipt_counters (
  year    INTEGER PRIMARY KEY,
  next_n  INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT fiscal_receipt_counters_n_check CHECK (next_n >= 1)
);

CREATE OR REPLACE FUNCTION public.next_fiscal_receipt_number(p_year INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO public.fiscal_receipt_counters (year, next_n)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET next_n = public.fiscal_receipt_counters.next_n + 1
  RETURNING next_n INTO v_n;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.next_fiscal_receipt_number(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_fiscal_receipt_number(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- fiscal_receipts + righe
-- ---------------------------------------------------------------------------
CREATE TABLE public.fiscal_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number_n        INTEGER NOT NULL,
  year            INTEGER NOT NULL,
  code            TEXT NOT NULL,
  issued_on       DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'emessa',
  replaces_id     UUID REFERENCES public.fiscal_receipts (id) ON DELETE SET NULL,
  payment_id      UUID REFERENCES public.lesson_pack_payments (id) ON DELETE SET NULL,
  member_id       UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  payee_name      TEXT NOT NULL,
  payee_tax_code  TEXT,
  payee_email     TEXT,
  amount_eur      NUMERIC(10, 2) NOT NULL,
  method          TEXT NOT NULL,
  pdf_base64      TEXT,
  emailed_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fiscal_receipts_status_check
    CHECK (status IN ('emessa', 'sostituita')),
  CONSTRAINT fiscal_receipts_amount_check CHECK (amount_eur >= 0),
  CONSTRAINT fiscal_receipts_code_unique UNIQUE (code),
  CONSTRAINT fiscal_receipts_year_n_unique UNIQUE (year, number_n)
);

CREATE INDEX idx_fiscal_receipts_issued
  ON public.fiscal_receipts (issued_on DESC);

CREATE INDEX idx_fiscal_receipts_member
  ON public.fiscal_receipts (member_id);

COMMENT ON TABLE public.fiscal_receipts IS
  'Ricevute didattica sezionale S/{n}/{y}. Matrice = riga; copia = stesso PDF in email.';

CREATE TRIGGER trg_fiscal_receipts_updated_at
  BEFORE UPDATE ON public.fiscal_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fiscal_receipt_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  UUID NOT NULL REFERENCES public.fiscal_receipts (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_eur  NUMERIC(10, 2) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT fiscal_receipt_lines_amount_check CHECK (amount_eur >= 0)
);

CREATE INDEX idx_fiscal_receipt_lines_receipt
  ON public.fiscal_receipt_lines (receipt_id);

-- ---------------------------------------------------------------------------
-- teacher_cash_advances — anticipo docente da confermare (notula = fetta 11)
-- ---------------------------------------------------------------------------
CREATE TABLE public.teacher_cash_advances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  payment_id          UUID REFERENCES public.lesson_pack_payments (id) ON DELETE SET NULL,
  enrollment_id       UUID REFERENCES public.course_enrollments (id) ON DELETE SET NULL,
  amount_eur          NUMERIC(10, 2) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  note                TEXT,
  confirmed_by        UUID REFERENCES public.members (id) ON DELETE SET NULL,
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT teacher_cash_advances_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  CONSTRAINT teacher_cash_advances_amount_check CHECK (amount_eur > 0)
);

CREATE INDEX idx_teacher_cash_advances_status
  ON public.teacher_cash_advances (status, created_at DESC);

CREATE INDEX idx_teacher_cash_advances_teacher
  ON public.teacher_cash_advances (teacher_member_id);

COMMENT ON TABLE public.teacher_cash_advances IS
  'Contanti segnati dal docente. Crediti e ricevuta già emessi; staff conferma l''anticipo notula.';

CREATE TRIGGER trg_teacher_cash_advances_updated_at
  BEFORE UPDATE ON public.teacher_cash_advances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reminder log (fetta 14)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_reminder_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_reminder_log_kind_check CHECK (kind IN ('day', 'soon')),
  CONSTRAINT lesson_reminder_log_unique UNIQUE (lesson_id, kind)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.fiscal_receipt_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_cash_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_reminder_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.fiscal_receipt_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fiscal_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fiscal_receipt_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.teacher_cash_advances TO authenticated;
GRANT SELECT, INSERT ON TABLE public.lesson_reminder_log TO authenticated;

CREATE POLICY "fiscal_receipts_staff"
  ON public.fiscal_receipts FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "fiscal_receipt_lines_staff"
  ON public.fiscal_receipt_lines FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "fiscal_receipt_counters_staff"
  ON public.fiscal_receipt_counters FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "teacher_cash_advances_select_own"
  ON public.teacher_cash_advances FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR teacher_member_id = public.current_member_id()
  );

CREATE POLICY "teacher_cash_advances_insert_own"
  ON public.teacher_cash_advances FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR teacher_member_id = public.current_member_id()
  );

CREATE POLICY "teacher_cash_advances_manage_staff"
  ON public.teacher_cash_advances FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_reminder_log_staff_teacher"
  ON public.lesson_reminder_log FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('docente'::public.member_role)
  )
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR public.has_member_role('docente'::public.member_role)
  );
