-- Studente / tutore: SELECT rette lezioni (own / ward), come lesson_credit_ledger.

CREATE POLICY "lesson_fees_select_own"
  ON public.lesson_fees FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    OR public.is_tutor_of(member_id)
  );

COMMENT ON POLICY "lesson_fees_select_own" ON public.lesson_fees IS
  'Associato e tutore possono leggere le proprie rette lezioni (own / ward). Solo SELECT.';
