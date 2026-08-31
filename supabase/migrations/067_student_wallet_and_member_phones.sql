-- MusicPro School — student/tutor wallet read + teacher phone on enrolled students
-- 1) Docenti: SELECT members iscritti ai propri corsi (phone per Chiama/WhatsApp)
-- 2) Studente/tutore: SELECT lesson_credit_ledger own / ward (saldo crediti)

-- ---------------------------------------------------------------------------
-- members — docenti vedono allievi iscritti (left_at null) ai corsi dove sono teacher
-- ---------------------------------------------------------------------------
CREATE POLICY "members_select_course_students"
  ON public.members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.course_enrollments e
      WHERE e.member_id = members.id
        AND e.left_at IS NULL
        AND public.is_course_teacher(e.course_id)
    )
  );

COMMENT ON POLICY "members_select_course_students" ON public.members IS
  'Docente (titolare o course_teachers attivo) può leggere i member iscritti ai suoi corsi, incluso phone.';

-- ---------------------------------------------------------------------------
-- lesson_credit_ledger — studente / tutore leggono i movimenti del proprio saldo
-- ---------------------------------------------------------------------------
CREATE POLICY "lesson_credit_ledger_select_own"
  ON public.lesson_credit_ledger FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    OR public.is_tutor_of(member_id)
  );

COMMENT ON POLICY "lesson_credit_ledger_select_own" ON public.lesson_credit_ledger IS
  'Associato e tutore possono leggere il ledger crediti lezione (own / ward). Solo SELECT.';
