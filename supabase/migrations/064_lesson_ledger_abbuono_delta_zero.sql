-- Allow audit-style abbuono ledger rows with delta 0 (fee waived, wallet unchanged).

ALTER TABLE public.lesson_credit_ledger
  DROP CONSTRAINT IF EXISTS lesson_credit_ledger_delta_check;

ALTER TABLE public.lesson_credit_ledger
  ADD CONSTRAINT lesson_credit_ledger_delta_check
  CHECK (delta <> 0 OR kind = 'abbuono');

COMMENT ON CONSTRAINT lesson_credit_ledger_delta_check ON public.lesson_credit_ledger IS
  'Wallet movements must change balance except abbuono (fee-only audit, delta 0).';
