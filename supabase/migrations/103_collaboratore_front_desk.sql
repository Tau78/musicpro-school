-- Collaboratore allo sportello: prenotazioni, crediti, quota/iscrizione, libro cespiti.
-- Non equivale a segreteria (niente lezioni, shop, impostazioni, anagrafica completa).

CREATE OR REPLACE FUNCTION public.is_front_desk()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_member_role('admin'::public.member_role)
      OR public.has_member_role('segreteria'::public.member_role)
      OR public.has_member_role('collaboratore'::public.member_role);
$$;

COMMENT ON FUNCTION public.is_front_desk() IS
  'Admin, segreteria o collaboratore: sportello prenotazioni, crediti, quota e cespiti.';

GRANT EXECUTE ON FUNCTION public.is_front_desk() TO authenticated, service_role;

-- Funzioni staff prenotazioni / crediti / quota: stesso controllo, più il collaboratore.
DO $$
DECLARE
  r record;
  src text;
  patched text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_update_booking_safe',
        'modify_booking_safe',
        'cancel_booking_safe',
        'review_booking_safe',
        'admin_adjust_member_credits',
        'hold_booking_credits',
        'hold_booking_credits_toward_payment',
        'release_booking_credits',
        'create_quota_payment_checkout',
        'debit_booking_credits',
        'get_member_credit_balance'
      )
  LOOP
    src := pg_get_functiondef(r.sig);
    patched := replace(
      src,
      'public.is_admin_or_segreteria()',
      'public.is_front_desk()'
    );
    IF patched IS DISTINCT FROM src THEN
      EXECUTE patched;
    ELSIF position('public.is_front_desk()' IN src) = 0 THEN
      RAISE EXCEPTION '%: manca il controllo staff da estendere al collaboratore', r.sig;
    END IF;
  END LOOP;
END;
$$;

-- Creazione prenotazione per un altro associato: prima solo admin.
DO $$
DECLARE
  r record;
  src text;
  patched text;
  needle text := 'public.has_member_role(''admin''::public.member_role)';
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_booking_safe'
  LOOP
    src := pg_get_functiondef(r.sig);
    IF position(needle IN src) > 0 THEN
      patched := replace(src, needle, 'public.is_front_desk()');
      EXECUTE patched;
    ELSIF position('public.is_front_desk()' IN src) = 0 THEN
      RAISE EXCEPTION '%: controllo admin sulla creazione non trovato', r.sig;
    END IF;
  END LOOP;
END;
$$;

-- Lettura / scrittura sportello (RLS)
DROP POLICY IF EXISTS "members_select_staff" ON public.members;
CREATE POLICY "members_select_staff"
  ON public.members FOR SELECT
  TO authenticated
  USING (
    public.is_front_desk()
    OR public.has_member_role('docente'::public.member_role)
    OR public.has_member_role('social'::public.member_role)
  );

DROP POLICY IF EXISTS "member_roles_select_staff" ON public.member_roles;
CREATE POLICY "member_roles_select_staff"
  ON public.member_roles FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "member_quotas_select_staff" ON public.member_annual_quotas;
CREATE POLICY "member_quotas_select_staff"
  ON public.member_annual_quotas FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "member_quotas_manage_staff" ON public.member_annual_quotas;
CREATE POLICY "member_quotas_manage_staff"
  ON public.member_annual_quotas FOR ALL
  TO authenticated
  USING (public.is_front_desk())
  WITH CHECK (public.is_front_desk());

DROP POLICY IF EXISTS "quota_settings_select_front_desk" ON public.annual_quota_settings;
CREATE POLICY "quota_settings_select_front_desk"
  ON public.annual_quota_settings FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "credit_transactions_select_staff" ON public.credit_transactions;
CREATE POLICY "credit_transactions_select_staff"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "rooms_select_bookers" ON public.rooms;
CREATE POLICY "rooms_select_bookers"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (public.can_book_rooms() OR public.is_front_desk());

DROP POLICY IF EXISTS "bookings_select_bookers" ON public.bookings;
CREATE POLICY "bookings_select_bookers"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (public.can_book_rooms() OR public.is_front_desk());

DROP POLICY IF EXISTS "bookings_update_admin" ON public.bookings;
CREATE POLICY "bookings_update_admin"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (public.is_front_desk())
  WITH CHECK (public.is_front_desk());

DROP POLICY IF EXISTS "external_calendar_events_select_staff" ON public.external_calendar_events;
CREATE POLICY "external_calendar_events_select_staff"
  ON public.external_calendar_events FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "school_lesson_settings_select_front_desk" ON public.school_lesson_settings;
CREATE POLICY "school_lesson_settings_select_front_desk"
  ON public.school_lesson_settings FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

-- Libro cespiti: modifica sì, cancellazione definitiva resta admin.
DROP POLICY IF EXISTS "fixed_assets_select_staff" ON public.fixed_assets;
CREATE POLICY "fixed_assets_select_staff"
  ON public.fixed_assets FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "fixed_assets_insert_staff" ON public.fixed_assets;
CREATE POLICY "fixed_assets_insert_staff"
  ON public.fixed_assets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_front_desk());

DROP POLICY IF EXISTS "fixed_assets_update_staff" ON public.fixed_assets;
CREATE POLICY "fixed_assets_update_staff"
  ON public.fixed_assets FOR UPDATE
  TO authenticated
  USING (public.is_front_desk())
  WITH CHECK (public.is_front_desk());

DROP POLICY IF EXISTS "fixed_asset_events_select_staff" ON public.fixed_asset_events;
CREATE POLICY "fixed_asset_events_select_staff"
  ON public.fixed_asset_events FOR SELECT
  TO authenticated
  USING (public.is_front_desk());

DROP POLICY IF EXISTS "fixed_asset_events_insert_staff" ON public.fixed_asset_events;
CREATE POLICY "fixed_asset_events_insert_staff"
  ON public.fixed_asset_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_front_desk());

DROP POLICY IF EXISTS "fixed_asset_events_update_staff" ON public.fixed_asset_events;
CREATE POLICY "fixed_asset_events_update_staff"
  ON public.fixed_asset_events FOR UPDATE
  TO authenticated
  USING (public.is_front_desk())
  WITH CHECK (public.is_front_desk());

DROP POLICY IF EXISTS "fixed_assets_storage_select_staff" ON storage.objects;
CREATE POLICY "fixed_assets_storage_select_staff"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fixed_assets'
    AND public.is_front_desk()
  );

DROP POLICY IF EXISTS "fixed_assets_storage_insert_staff" ON storage.objects;
CREATE POLICY "fixed_assets_storage_insert_staff"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fixed_assets'
    AND public.is_front_desk()
  );

DROP POLICY IF EXISTS "fixed_assets_storage_update_staff" ON storage.objects;
CREATE POLICY "fixed_assets_storage_update_staff"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fixed_assets'
    AND public.is_front_desk()
  )
  WITH CHECK (
    bucket_id = 'fixed_assets'
    AND public.is_front_desk()
  );

DROP POLICY IF EXISTS "fixed_assets_storage_delete_staff" ON storage.objects;
CREATE POLICY "fixed_assets_storage_delete_staff"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fixed_assets'
    AND public.is_front_desk()
  );
