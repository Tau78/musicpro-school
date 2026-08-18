-- MusicPro School — Fetta 11: notule didattiche (compensi mese)
-- Distinte dalle notule spese (`reimbursements`). Anticipi docente = ritenuata in notula.

-- ---------------------------------------------------------------------------
-- lesson_payrolls — una per docente × mese solare Europe/Rome
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_payrolls (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_member_id     UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  year                  INTEGER NOT NULL,
  month                 INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  gross_eur             NUMERIC(10, 2) NOT NULL DEFAULT 0,
  advances_eur          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  carry_in_eur          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  carry_out_eur         NUMERIC(10, 2) NOT NULL DEFAULT 0,
  withholding_eur       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  net_eur               NUMERIC(10, 2) NOT NULL DEFAULT 0,
  minutes_teaching      INTEGER NOT NULL DEFAULT 0,
  minutes_coordination  INTEGER NOT NULL DEFAULT 0,
  signed_at             TIMESTAMPTZ,
  signature_png_base64  TEXT,
  invoice_filename      TEXT,
  invoice_base64        TEXT,
  invoice_uploaded_at   TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  closed_by             UUID REFERENCES public.members (id) ON DELETE SET NULL,
  paid_on               DATE,
  paid_method           TEXT,
  paid_note             TEXT,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by          UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_payrolls_month_check CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT lesson_payrolls_year_check CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT lesson_payrolls_status_check
    CHECK (status IN ('draft', 'signed', 'closed')),
  CONSTRAINT lesson_payrolls_teacher_month_unique UNIQUE (teacher_member_id, year, month)
);

CREATE INDEX idx_lesson_payrolls_month
  ON public.lesson_payrolls (year DESC, month DESC, status);

CREATE INDEX idx_lesson_payrolls_teacher
  ON public.lesson_payrolls (teacher_member_id, year DESC, month DESC);

COMMENT ON TABLE public.lesson_payrolls IS
  'Notula didattica: una bozza per docente per mese. Distinta da reimbursements (spese).';

CREATE TRIGGER trg_lesson_payrolls_updated_at
  BEFORE UPDATE ON public.lesson_payrolls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_payroll_lines
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_payroll_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id    UUID NOT NULL REFERENCES public.lesson_payrolls (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  lesson_id     UUID REFERENCES public.lessons (id) ON DELETE SET NULL,
  course_id     UUID REFERENCES public.courses (id) ON DELETE SET NULL,
  occurred_on   DATE,
  description   TEXT NOT NULL,
  minutes       INTEGER NOT NULL DEFAULT 0,
  quantity      NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_eur      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_eur    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_manual     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_payroll_lines_kind_check
    CHECK (kind IN (
      'insegnamento',
      'coordinamento',
      'extra',
      'anticipo',
      'riporto'
    ))
);

CREATE INDEX idx_lesson_payroll_lines_payroll
  ON public.lesson_payroll_lines (payroll_id, sort_order);

-- ---------------------------------------------------------------------------
-- lesson_payroll_slips — lezioni senza presenze oltre scadenza → mese dopo
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_payroll_slips (
  lesson_id   UUID PRIMARY KEY REFERENCES public.lessons (id) ON DELETE CASCADE,
  from_year   INTEGER NOT NULL,
  from_month  INTEGER NOT NULL,
  to_year     INTEGER NOT NULL,
  to_month    INTEGER NOT NULL,
  slipped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lesson_payroll_slips_to
  ON public.lesson_payroll_slips (to_year, to_month);

-- ---------------------------------------------------------------------------
-- Anticipi confermati agganciati alla notula
-- ---------------------------------------------------------------------------
ALTER TABLE public.teacher_cash_advances
  ADD COLUMN IF NOT EXISTS payroll_id UUID REFERENCES public.lesson_payrolls (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_cash_advances_payroll
  ON public.teacher_cash_advances (payroll_id)
  WHERE payroll_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_payroll_slips ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_payrolls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_payroll_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_payroll_slips TO authenticated;

CREATE POLICY "lesson_payrolls_select"
  ON public.lesson_payrolls FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR teacher_member_id = public.current_member_id()
  );

CREATE POLICY "lesson_payrolls_insert_own"
  ON public.lesson_payrolls FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR teacher_member_id = public.current_member_id()
  );

CREATE POLICY "lesson_payrolls_write_staff"
  ON public.lesson_payrolls FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_payrolls_update_own_sign"
  ON public.lesson_payrolls FOR UPDATE
  TO authenticated
  USING (teacher_member_id = public.current_member_id())
  WITH CHECK (teacher_member_id = public.current_member_id());

CREATE POLICY "lesson_payroll_lines_select"
  ON public.lesson_payroll_lines FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR EXISTS (
      SELECT 1 FROM public.lesson_payrolls p
      WHERE p.id = payroll_id
        AND p.teacher_member_id = public.current_member_id()
    )
  );

CREATE POLICY "lesson_payroll_lines_write_own"
  ON public.lesson_payroll_lines FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR EXISTS (
      SELECT 1 FROM public.lesson_payrolls p
      WHERE p.id = payroll_id
        AND p.teacher_member_id = public.current_member_id()
    )
  )
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR EXISTS (
      SELECT 1 FROM public.lesson_payrolls p
      WHERE p.id = payroll_id
        AND p.teacher_member_id = public.current_member_id()
    )
  );

CREATE POLICY "lesson_payroll_slips_staff"
  ON public.lesson_payroll_slips FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_payroll_slips_teacher"
  ON public.lesson_payroll_slips FOR ALL
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role))
  WITH CHECK (public.has_member_role('docente'::public.member_role));
