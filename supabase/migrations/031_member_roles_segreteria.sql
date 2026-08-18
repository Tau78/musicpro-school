-- Segreteria can grant/revoke Docente and Segreteria.
-- Admin role stays admin-only (existing member_roles_manage_admin).

CREATE POLICY "member_roles_insert_segreteria"
  ON public.member_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('segreteria'::public.member_role)
    AND role <> 'admin'::public.member_role
  );

CREATE POLICY "member_roles_update_segreteria"
  ON public.member_roles FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('segreteria'::public.member_role)
    AND role <> 'admin'::public.member_role
  )
  WITH CHECK (
    public.has_member_role('segreteria'::public.member_role)
    AND role <> 'admin'::public.member_role
  );

CREATE POLICY "member_roles_delete_segreteria"
  ON public.member_roles FOR DELETE
  TO authenticated
  USING (
    public.has_member_role('segreteria'::public.member_role)
    AND role <> 'admin'::public.member_role
  );
