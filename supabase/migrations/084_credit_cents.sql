-- Crediti sala: 1 credito = 1 euro, con i centesimi.
-- I saldi interi già scritti restano validi (20 → 20.00).
-- I crediti lezione (wallet corsi) non cambiano: sono un'altra unità.

-- L'indice chiama booking_occupies_slot con il tipo della colonna.
DROP INDEX IF EXISTS public.idx_bookings_unique_active_slot;

ALTER TABLE public.credit_transactions
  ALTER COLUMN amount TYPE NUMERIC(12, 2);

ALTER TABLE public.bookings
  ALTER COLUMN credits_held TYPE NUMERIC(12, 2),
  ALTER COLUMN credits_used TYPE NUMERIC(12, 2);

ALTER TABLE public.credit_packages
  ALTER COLUMN credits TYPE NUMERIC(12, 2);

ALTER TABLE public.credit_purchases
  ALTER COLUMN credits_granted TYPE NUMERIC(12, 2);

COMMENT ON COLUMN public.credit_transactions.amount IS
  'Euro con centesimi. Positivo = accredito; negativo = addebito o hold. 1 credito = 1 euro.';

COMMENT ON COLUMN public.bookings.credits_used IS
  'Crediti addebitati: 1 credito = 1 euro del prezzo, centesimi compresi.';

COMMENT ON COLUMN public.bookings.credits_held IS
  'Crediti riservati: 1 credito = 1 euro, centesimi compresi.';

DROP FUNCTION IF EXISTS public.booking_occupies_slot(public.booking_status, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.booking_occupies_slot(
  p_status public.booking_status,
  p_payment_status TEXT,
  p_credits_held NUMERIC DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_status IS DISTINCT FROM 'cancelled'::public.booking_status
    AND NOT (
      p_status = 'pending'::public.booking_status
      AND p_payment_status IN ('unpaid', 'link_sent')
      AND COALESCE(p_credits_held, 0) = 0
    );
$$;

COMMENT ON FUNCTION public.booking_occupies_slot(public.booking_status, TEXT, NUMERIC) IS
  'True when a booking blocks the room slot. Unpaid pending checkouts do not.';

GRANT EXECUTE ON FUNCTION public.booking_occupies_slot(public.booking_status, TEXT, NUMERIC)
  TO authenticated, service_role;

CREATE UNIQUE INDEX idx_bookings_unique_active_slot
  ON public.bookings (room_id, start_at)
  WHERE public.booking_occupies_slot(status, payment_status, credits_held);

DROP FUNCTION IF EXISTS public.member_credit_held(UUID);
DROP FUNCTION IF EXISTS public.member_credit_available(UUID);

CREATE OR REPLACE FUNCTION public.member_credit_held(p_member_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(b.credits_held)
      FROM public.bookings b
      WHERE b.member_id = p_member_id
        AND b.credits_held > 0
        AND b.status <> 'cancelled'::public.booking_status
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.member_credit_available(p_member_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT SUM(ct.amount)
      FROM public.credit_transactions ct
      WHERE ct.member_id = p_member_id
    ),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.member_credit_held(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_credit_available(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.credit_ledger_scale()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.numeric_scale::INTEGER
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'credit_transactions'
    AND c.column_name = 'amount';
$$;

COMMENT ON FUNCTION public.credit_ledger_scale() IS
  'Scala dei centesimi sul ledger crediti sala. 2 = il saldo accetta i centesimi.';

REVOKE ALL ON FUNCTION public.credit_ledger_scale() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_ledger_scale() TO service_role;

-- Allinea le funzioni sala: argomenti e variabili da interi a numeric(12,2),
-- e il prezzo arrotondato al centesimo invece che all'euro.
DO $$
DECLARE
  r record;
  src text;
  patched text;
  signature_changes boolean;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'debit_booking_credits',
        'hold_booking_credits',
        'admin_adjust_member_credits',
        'get_member_credit_balance',
        'release_booking_credits_internal',
        'apply_cancellation_penalty_credits',
        'modify_booking_safe',
        'admin_update_booking_safe'
      )
  LOOP
    src := pg_get_functiondef(r.sig);
    patched := src;
    patched := replace(
      patched,
      'ROUND(COALESCE(v_booking.total_price_eur, 0))::INTEGER',
      'ROUND(COALESCE(v_booking.total_price_eur, 0), 2)'
    );
    patched := replace(patched, 'ROUND(v_price)::INTEGER', 'ROUND(v_price, 2)');
    patched := replace(patched, 'ROUND(v_price_old)::INTEGER', 'ROUND(v_price_old, 2)');
    patched := regexp_replace(
      patched,
      'ROUND\s*\(\s*v_credits_used\s*\*\s*v_penalty_percent\s*/\s*100\.0\s*\)\s*::\s*INTEGER',
      'ROUND(v_credits_used * v_penalty_percent / 100.0, 2)',
      'gi'
    );
    patched := regexp_replace(patched, '\mv_credits_used\s+INTEGER\M', 'v_credits_used NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_penalty_credits\s+INTEGER\M', 'v_penalty_credits NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_refund_credits\s+INTEGER\M', 'v_refund_credits NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_new_credit_hours\s+INTEGER\M', 'v_new_credit_hours NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_old_credit_hours\s+INTEGER\M', 'v_old_credit_hours NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_hold_delta\s+INTEGER\M', 'v_hold_delta NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_available\s+INTEGER\M', 'v_available NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_debit\s+INTEGER\M', 'v_debit NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_credits\s+INTEGER\M', 'v_credits NUMERIC(12,2)', 'gi');
    patched := regexp_replace(patched, '\mv_held\s+INTEGER\M', 'v_held NUMERIC(12,2)', 'gi');
    IF r.proname = 'get_member_credit_balance' THEN
      patched := regexp_replace(patched, '\mv_total\s+INTEGER\M', 'v_total NUMERIC(12,2)', 'gi');
    END IF;
    patched := replace(
      patched,
      '(''credits_debited'', COALESCE((v_debit_result->>''credits_used'')::INTEGER, 0)',
      '(''credits_debited'', COALESCE((v_debit_result->>''credits_used'')::NUMERIC, 0)'
    );
    patched := replace(
      patched,
      '(''credits_released'', COALESCE((v_release_result->>''credits_released'')::INTEGER, 0)',
      '(''credits_released'', COALESCE((v_release_result->>''credits_released'')::NUMERIC, 0)'
    );

    signature_changes := r.proname IN (
      'debit_booking_credits',
      'hold_booking_credits',
      'admin_adjust_member_credits'
    );
    IF r.proname IN ('debit_booking_credits', 'hold_booking_credits') THEN
      patched := regexp_replace(patched, 'p_credits\s+integer', 'p_credits numeric', 'gi');
    ELSIF r.proname = 'admin_adjust_member_credits' THEN
      patched := regexp_replace(patched, 'p_amount\s+integer', 'p_amount numeric', 'gi');
    END IF;

    IF r.proname = 'debit_booking_credits'
       AND position('ROUND(COALESCE(v_booking.total_price_eur, 0), 2)' IN patched) = 0 THEN
      RAISE EXCEPTION 'debit_booking_credits: arrotondamento al centesimo non applicato';
    END IF;
    IF r.proname IN ('debit_booking_credits', 'hold_booking_credits')
       AND position('p_credits numeric' IN lower(patched)) = 0 THEN
      RAISE EXCEPTION '%: firma numeric non applicata', r.proname;
    END IF;
    IF r.proname = 'admin_adjust_member_credits'
       AND position('p_amount numeric' IN lower(patched)) = 0 THEN
      RAISE EXCEPTION 'admin_adjust_member_credits: firma numeric non applicata';
    END IF;

    IF signature_changes THEN
      EXECUTE format('DROP FUNCTION %s', r.sig);
    END IF;
    IF patched IS DISTINCT FROM src OR signature_changes THEN
      EXECUTE patched;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_booking_credits(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hold_booking_credits(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_member_credits(UUID, NUMERIC, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.debit_booking_credits(UUID, NUMERIC) IS
  'Addebito crediti 1:1 col prezzo in euro, centesimi compresi.';
