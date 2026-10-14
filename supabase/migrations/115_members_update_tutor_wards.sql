-- Tutore può aggiornare l'anagrafica dei propri tutorati (is_tutor_of).

DROP POLICY IF EXISTS "members_update_tutor_wards" ON public.members;
CREATE POLICY "members_update_tutor_wards"
  ON public.members FOR UPDATE
  TO authenticated
  USING (public.is_tutor_of(id))
  WITH CHECK (public.is_tutor_of(id));
