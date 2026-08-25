-- Foto CMS sito hub — bucket pubblico in lettura, staff in scrittura

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website',
  'website',
  true,
  4194304,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "website_storage_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'website');

CREATE POLICY "website_storage_insert_staff"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'website'
    AND public.is_admin_or_segreteria()
  );

CREATE POLICY "website_storage_update_staff"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'website'
    AND public.is_admin_or_segreteria()
  )
  WITH CHECK (
    bucket_id = 'website'
    AND public.is_admin_or_segreteria()
  );

CREATE POLICY "website_storage_delete_staff"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'website'
    AND public.is_admin_or_segreteria()
  );
