-- MusicPro School — Row Level Security policies
-- Roles: admin, docente, associato, segreteria, social, tutore (many-to-many via member_roles)
-- Auth: Supabase Auth (auth.users) linked to members.user_id

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
CREATE POLICY "members_select_own"
  ON public.members FOR SELECT
  TO authenticated
  USING (id = public.current_member_id());

CREATE POLICY "members_select_tutor_wards"
  ON public.members FOR SELECT
  TO authenticated
  USING (public.is_tutor_of(id));

CREATE POLICY "members_select_staff"
  ON public.members FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('docente'::public.member_role)
    OR public.has_member_role('social'::public.member_role)
  );

CREATE POLICY "members_update_own"
  ON public.members FOR UPDATE
  TO authenticated
  USING (id = public.current_member_id())
  WITH CHECK (id = public.current_member_id());

CREATE POLICY "members_insert_staff"
  ON public.members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "members_update_staff"
  ON public.members FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "members_delete_admin"
  ON public.members FOR DELETE
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- member_roles
-- ---------------------------------------------------------------------------
CREATE POLICY "member_roles_select_own"
  ON public.member_roles FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY "member_roles_select_staff"
  ON public.member_roles FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "member_roles_manage_admin"
  ON public.member_roles FOR ALL
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role))
  WITH CHECK (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- tutor_links
-- ---------------------------------------------------------------------------
CREATE POLICY "tutor_links_select_involved"
  ON public.tutor_links FOR SELECT
  TO authenticated
  USING (
    tutor_member_id = public.current_member_id()
    OR ward_member_id = public.current_member_id()
    OR public.is_admin_or_segreteria()
  );

CREATE POLICY "tutor_links_manage_staff"
  ON public.tutor_links FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- annual_quota_settings
-- ---------------------------------------------------------------------------
CREATE POLICY "quota_settings_select_authenticated"
  ON public.annual_quota_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "quota_settings_manage_admin"
  ON public.annual_quota_settings FOR ALL
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role))
  WITH CHECK (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- member_annual_quotas
-- ---------------------------------------------------------------------------
CREATE POLICY "member_quotas_select_own"
  ON public.member_annual_quotas FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY "member_quotas_select_tutor_wards"
  ON public.member_annual_quotas FOR SELECT
  TO authenticated
  USING (public.is_tutor_of(member_id));

CREATE POLICY "member_quotas_select_staff"
  ON public.member_annual_quotas FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "member_quotas_manage_staff"
  ON public.member_annual_quotas FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- reimbursements — admin & docente create/generate; associato reads own
-- ---------------------------------------------------------------------------
CREATE POLICY "reimbursements_select_own"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY "reimbursements_select_managers"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (public.can_manage_reimbursements());

CREATE POLICY "reimbursements_insert_managers"
  ON public.reimbursements FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_reimbursements()
    AND created_by_member_id = public.current_member_id()
  );

CREATE POLICY "reimbursements_update_managers"
  ON public.reimbursements FOR UPDATE
  TO authenticated
  USING (public.can_manage_reimbursements())
  WITH CHECK (public.can_manage_reimbursements());

CREATE POLICY "reimbursements_update_own_signature"
  ON public.reimbursements FOR UPDATE
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND signature_required = true
    AND signed_at IS NULL
  )
  WITH CHECK (member_id = public.current_member_id());

CREATE POLICY "reimbursements_delete_admin"
  ON public.reimbursements FOR DELETE
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- enrollments — staff full access; member reads own by email
-- ---------------------------------------------------------------------------
CREATE POLICY "enrollments_select_staff"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "enrollments_select_own_email"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (
    lower(email) = (
      SELECT lower(m.email)
      FROM public.members m
      WHERE m.id = public.current_member_id()
    )
  );

CREATE POLICY "enrollments_manage_staff"
  ON public.enrollments FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- Note: public enrollment form inserts via Edge Function / service_role (bypasses RLS)

-- ---------------------------------------------------------------------------
-- rooms — readable by anyone who can book; managed by admin
-- ---------------------------------------------------------------------------
CREATE POLICY "rooms_select_bookers"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (public.can_book_rooms() OR public.is_admin_or_segreteria());

CREATE POLICY "rooms_manage_admin"
  ON public.rooms FOR ALL
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role))
  WITH CHECK (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- bookings — associati (quota OK) + docenti + admin
-- ---------------------------------------------------------------------------
CREATE POLICY "bookings_select_bookers"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    public.can_book_rooms()
    OR public.is_admin_or_segreteria()
  );

CREATE POLICY "bookings_insert_eligible"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_book_rooms()
    AND member_id = public.current_member_id()
    AND status IN ('pending'::public.booking_status, 'confirmed'::public.booking_status)
  );

CREATE POLICY "bookings_update_own_pending"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND status = 'pending'::public.booking_status
  )
  WITH CHECK (member_id = public.current_member_id());

CREATE POLICY "bookings_update_admin"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role))
  WITH CHECK (public.has_member_role('admin'::public.member_role));

CREATE POLICY "bookings_cancel_own"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND status <> 'cancelled'::public.booking_status
  )
  WITH CHECK (
    member_id = public.current_member_id()
    AND status = 'cancelled'::public.booking_status
  );

CREATE POLICY "bookings_delete_admin"
  ON public.bookings FOR DELETE
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- message_templates
-- ---------------------------------------------------------------------------
CREATE POLICY "templates_select_staff"
  ON public.message_templates FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  );

CREATE POLICY "templates_manage_staff"
  ON public.message_templates FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  )
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  );

-- ---------------------------------------------------------------------------
-- message_campaigns
-- ---------------------------------------------------------------------------
CREATE POLICY "campaigns_select_staff"
  ON public.message_campaigns FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  );

CREATE POLICY "campaigns_manage_staff"
  ON public.message_campaigns FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  )
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  );

-- ---------------------------------------------------------------------------
-- message_campaign_recipients
-- ---------------------------------------------------------------------------
CREATE POLICY "campaign_recipients_select_staff"
  ON public.message_campaign_recipients FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  );

CREATE POLICY "campaign_recipients_select_own"
  ON public.message_campaign_recipients FOR SELECT
  TO authenticated
  USING (member_id = public.current_member_id());

CREATE POLICY "campaign_recipients_manage_staff"
  ON public.message_campaign_recipients FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  )
  WITH CHECK (
    public.is_admin_or_segreteria()
    OR public.has_member_role('social'::public.member_role)
  );

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
CREATE POLICY "app_settings_select_staff"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "app_settings_manage_admin"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role))
  WITH CHECK (public.has_member_role('admin'::public.member_role));

-- ---------------------------------------------------------------------------
-- audit_log — admin read-only; writes via service_role / triggers
-- ---------------------------------------------------------------------------
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_member_role('admin'::public.member_role));

-- Inserts from application layer should use service_role or SECURITY DEFINER functions
