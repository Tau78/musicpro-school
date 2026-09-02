-- Notule PDF: bucket privato + path Rimborsi {anno}/{cognome}/...
-- L'upload in produzione usa anche il service role (persist.ts) se il bucket manca.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reimbursements',
  'reimbursements',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "reimbursements_storage_select_managers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reimbursements'
    AND public.can_manage_reimbursements()
  );

CREATE POLICY "reimbursements_storage_insert_managers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reimbursements'
    AND public.can_manage_reimbursements()
  );

CREATE POLICY "reimbursements_storage_update_managers"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reimbursements'
    AND public.can_manage_reimbursements()
  )
  WITH CHECK (
    bucket_id = 'reimbursements'
    AND public.can_manage_reimbursements()
  );

CREATE POLICY "reimbursements_storage_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reimbursements'
    AND public.has_member_role('admin'::public.member_role)
  );
