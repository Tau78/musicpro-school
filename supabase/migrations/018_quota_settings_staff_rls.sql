-- Allow segreteria to manage annual quota settings (admin Quote UI)

DROP POLICY IF EXISTS "quota_settings_manage_admin" ON public.annual_quota_settings;
CREATE POLICY "quota_settings_manage_staff"
  ON public.annual_quota_settings FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
