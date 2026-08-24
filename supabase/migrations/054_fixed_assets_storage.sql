-- MusicPro School — Storage bucket for Libro cespiti photos

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fixed_assets',
  'fixed_assets',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fixed_assets_storage_select_staff"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fixed_assets'
    AND public.is_admin_or_segreteria()
  );

CREATE POLICY "fixed_assets_storage_insert_staff"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fixed_assets'
    AND public.is_admin_or_segreteria()
  );

CREATE POLICY "fixed_assets_storage_update_staff"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fixed_assets'
    AND public.is_admin_or_segreteria()
  )
  WITH CHECK (
    bucket_id = 'fixed_assets'
    AND public.is_admin_or_segreteria()
  );

CREATE POLICY "fixed_assets_storage_delete_staff"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fixed_assets'
    AND public.is_admin_or_segreteria()
  );
