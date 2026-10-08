-- Account test (smoke / sandbox): esclusi dai totali «crediti in circolazione» in admin.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.members.is_test_account IS
  'Associato fittizio per test. Escluso dal totale crediti in circolazione in dashboard admin.';

UPDATE public.members
SET is_test_account = true
WHERE email ILIKE 'mauro.andreoni@gmail.com'
   OR tax_code = 'TSTMRN78T13I693X';

CREATE INDEX IF NOT EXISTS idx_members_test_account
  ON public.members (is_test_account)
  WHERE is_test_account = true;
