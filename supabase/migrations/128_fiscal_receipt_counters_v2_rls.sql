-- Fix advisor rls_disabled_in_public on fiscal_receipt_counters_v2
-- (created in 101 without ENABLE ROW LEVEL SECURITY).
-- Parità con fiscal_receipt_counters (038): staff-only via is_admin_or_segreteria().
-- Numerazione ricevute resta via next_fiscal_receipt_number (SECURITY DEFINER) → non si rompe.

ALTER TABLE public.fiscal_receipt_counters_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_receipt_counters_v2_staff" ON public.fiscal_receipt_counters_v2;

CREATE POLICY "fiscal_receipt_counters_v2_staff"
  ON public.fiscal_receipt_counters_v2 FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- Difesa in profondità: anon non deve toccare i contatori (come intent 038).
REVOKE ALL ON TABLE public.fiscal_receipt_counters_v2 FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fiscal_receipt_counters_v2 TO authenticated;
