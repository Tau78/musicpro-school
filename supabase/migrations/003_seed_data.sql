-- MusicPro School — seed data
-- Placeholder rooms, quota settings structure, legacy app_settings keys

-- ---------------------------------------------------------------------------
-- Practice rooms (sale prova) — 4 placeholders; rename in admin UI
-- ---------------------------------------------------------------------------
INSERT INTO public.rooms (name, slug, description, capacity, sort_order)
VALUES
  ('Sala 1', 'sala-1', 'Sala prova principale', 6, 1),
  ('Sala 2', 'sala-2', 'Sala prova secondaria', 4, 2),
  ('Sala 3', 'sala-3', 'Sala prova piccola', 2, 3),
  ('Sala 4', 'sala-4', 'Sala prova aggiuntiva', 4, 4)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Annual quota settings — structure for current and recent years
-- Adjust amounts after migration from IMPOSTAZIONI_QUOTE
-- ---------------------------------------------------------------------------
INSERT INTO public.annual_quota_settings (fiscal_year, amount_eur)
VALUES
  (2024, 50.00),
  (2025, 50.00),
  (2026, 50.00)
ON CONFLICT (fiscal_year) DO NOTHING;

-- ---------------------------------------------------------------------------
-- app_settings — keys migrated from GAS constants / drive path settings
-- Values are placeholders; update via admin or migration script
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'timezone',
    'Europe/Rome',
    'Application timezone for date display and quota year logic'
  ),
  (
    'legacy_spreadsheet_id',
    '1vwyCTqXJDe0IKr_tIH2Dgz5ewlTo-OCnTxH2WNSYAOU',
    'GAS SPREADSHEET_ID — source for one-time migration'
  ),
  (
    'root_reimbursements_folder_id',
    '14PwoMNblwtzxzc9GTZQOsfTH7-r5tmZR',
    'GAS ROOT_REIMBURSEMENTS_FOLDER_ID — historical Drive folder (read-only reference)'
  ),
  (
    'reimbursement_template_id',
    '1CkjcoNEfsLzN6RcepBcMU65y5dkudO-DuWNS5mxPPCw',
    'GAS TEMPLATE_ID — legacy Google Doc template for notule'
  ),
  (
    'enrollment_template_id',
    '1CVxLAsEweuZD11N6V3CBkaNqegG6c2BeOT9WZLSw63I',
    'GAS ISCRIZIONE_TEMPLATE_ID — legacy enrollment form template'
  ),
  (
    'root_enrollments_folder_id',
    '1s9IxsGHytPFHuBhJWBBaUlX_iRdNXxo5',
    'GAS ROOT_ISCRIZIONI_FOLDER_ID — historical signed enrollment PDFs'
  ),
  (
    'admin_email',
    'musicproeventi@gmail.com',
    'GAS ADMIN_EMAIL — primary admin notification address'
  ),
  (
    'segreteria_email',
    'musicproeventi@gmail.com',
    'GAS EMAIL_SEGRETERIA — secretariat contact'
  ),
  (
    'storage_bucket_reimbursements',
    'reimbursements',
    'Supabase Storage bucket for new reimbursement PDFs'
  ),
  (
    'storage_bucket_enrollments',
    'enrollments',
    'Supabase Storage bucket for new enrollment PDFs'
  )
ON CONFLICT (key) DO NOTHING;
