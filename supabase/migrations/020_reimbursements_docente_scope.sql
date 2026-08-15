-- Tighten docente scoping on reimbursements (UI already forces self;
-- previously can_manage_reimbursements() allowed docenti to read/write any row).

DROP POLICY IF EXISTS "reimbursements_select_managers" ON public.reimbursements;
CREATE POLICY "reimbursements_select_managers"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('admin'::public.member_role)
    OR (
      public.has_member_role('docente'::public.member_role)
      AND member_id = public.current_member_id()
    )
  );

DROP POLICY IF EXISTS "reimbursements_insert_managers" ON public.reimbursements;
CREATE POLICY "reimbursements_insert_managers"
  ON public.reimbursements FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_member_id = public.current_member_id()
    AND (
      public.has_member_role('admin'::public.member_role)
      OR (
        public.has_member_role('docente'::public.member_role)
        AND member_id = public.current_member_id()
      )
    )
  );

DROP POLICY IF EXISTS "reimbursements_update_managers" ON public.reimbursements;
CREATE POLICY "reimbursements_update_managers"
  ON public.reimbursements FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('admin'::public.member_role)
    OR (
      public.has_member_role('docente'::public.member_role)
      AND member_id = public.current_member_id()
    )
  )
  WITH CHECK (
    public.has_member_role('admin'::public.member_role)
    OR (
      public.has_member_role('docente'::public.member_role)
      AND member_id = public.current_member_id()
    )
  );
