-- Vendita cespite: annuncio Market, uscita dal libro, entrata in bilancio.

ALTER TABLE public.market_listings
  ADD COLUMN fixed_asset_id uuid REFERENCES public.fixed_assets (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX market_listings_open_asset_idx
  ON public.market_listings (fixed_asset_id)
  WHERE fixed_asset_id IS NOT NULL
    AND status IN ('bozza', 'in_vendita', 'riservato');

ALTER TABLE public.fixed_assets
  ADD COLUMN disposal_kind text;

ALTER TABLE public.fixed_assets
  DROP CONSTRAINT IF EXISTS fixed_assets_disposal_kind_check;

ALTER TABLE public.fixed_assets
  ADD CONSTRAINT fixed_assets_disposal_kind_check
  CHECK (disposal_kind IS NULL OR disposal_kind IN ('venduto', 'dismesso'));

COMMENT ON COLUMN public.fixed_assets.disposal_kind IS
  'Perché il bene è uscito dal libro: venduto oppure dismesso.';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'fixed_asset_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%acquisto%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.fixed_asset_events DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.fixed_asset_events
  ADD CONSTRAINT fixed_asset_events_type_check
  CHECK (
    event_type IN (
      'acquisto',
      'donazione',
      'perdita',
      'smarrimento',
      'rottura',
      'trasferimento',
      'venduto'
    )
  );

CREATE TABLE public.association_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  direction text NOT NULL,
  category text NOT NULL,
  amount_cents integer NOT NULL,
  method text,
  description text NOT NULL,
  fixed_asset_id uuid REFERENCES public.fixed_assets (id) ON DELETE SET NULL,
  market_order_id uuid UNIQUE REFERENCES public.market_orders (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT association_ledger_direction_check CHECK (direction IN ('entrata', 'uscita')),
  CONSTRAINT association_ledger_amount_positive CHECK (amount_cents > 0)
);

COMMENT ON TABLE public.association_ledger_entries IS
  'Movimenti di bilancio. Le vendite cespiti sono entrate categoria vendita_cespite.';

CREATE INDEX association_ledger_entries_date_idx
  ON public.association_ledger_entries (entry_date DESC, category);

ALTER TABLE public.association_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY association_ledger_staff
  ON public.association_ledger_entries
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.association_ledger_entries TO authenticated, service_role;
