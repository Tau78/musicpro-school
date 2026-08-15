-- Allow segreteria to manage rooms and app_settings (Phase 2 admin UI)

DROP POLICY IF EXISTS "rooms_manage_admin" ON public.rooms;
CREATE POLICY "rooms_manage_staff"
  ON public.rooms FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

DROP POLICY IF EXISTS "app_settings_manage_admin" ON public.app_settings;
CREATE POLICY "app_settings_manage_staff"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
