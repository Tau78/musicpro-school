-- Market: annunci dell'associazione oppure di un associato.
-- Quelli dell'associato restano in revisione finché l'admin non li pubblica.
-- Non passano dal libro cespiti e il pagamento non va all'associazione.

ALTER TABLE public.market_listings
  ADD COLUMN seller_kind text NOT NULL DEFAULT 'associazione',
  ADD COLUMN seller_member_id uuid REFERENCES public.members (id) ON DELETE SET NULL,
  ADD COLUMN seller_name text,
  ADD COLUMN seller_phone text,
  ADD COLUMN seller_email text,
  ADD COLUMN handover text;

ALTER TABLE public.market_listings
  DROP CONSTRAINT IF EXISTS market_listings_seller_kind_check;
ALTER TABLE public.market_listings
  ADD CONSTRAINT market_listings_seller_kind_check
  CHECK (seller_kind IN ('associazione', 'associato'));

ALTER TABLE public.market_listings
  DROP CONSTRAINT IF EXISTS market_listings_handover_check;
ALTER TABLE public.market_listings
  ADD CONSTRAINT market_listings_handover_check
  CHECK (handover IS NULL OR handover IN ('sede', 'diretto'));

ALTER TABLE public.market_listings
  DROP CONSTRAINT IF EXISTS market_listings_status_check;
ALTER TABLE public.market_listings
  ADD CONSTRAINT market_listings_status_check
  CHECK (status IN (
    'bozza',
    'in_revisione',
    'rifiutato',
    'in_vendita',
    'riservato',
    'venduto'
  ));

COMMENT ON COLUMN public.market_listings.seller_kind IS
  'associazione: cassa e cespiti. associato: accordo tra privati, dopo approvazione.';
COMMENT ON COLUMN public.market_listings.handover IS
  'sede: l''oggetto resta in sede. diretto: venditore e acquirente si arrangiano.';

ALTER TABLE public.market_orders
  DROP CONSTRAINT IF EXISTS market_orders_method_check;
ALTER TABLE public.market_orders
  ADD CONSTRAINT market_orders_method_check
  CHECK (method IN ('bonifico', 'contanti', 'nexi', 'tra_privati'));

CREATE POLICY market_listings_on_sale_select
  ON public.market_listings
  FOR SELECT
  TO authenticated
  USING (status = 'in_vendita');

CREATE POLICY market_listings_owner_select
  ON public.market_listings
  FOR SELECT
  TO authenticated
  USING (seller_member_id = public.current_member_id());

CREATE POLICY market_listings_owner_insert
  ON public.market_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_kind = 'associato'
    AND seller_member_id = public.current_member_id()
    AND status = 'in_revisione'
    AND fixed_asset_id IS NULL
    AND handover IN ('sede', 'diretto')
  );

CREATE POLICY market_listings_owner_update
  ON public.market_listings
  FOR UPDATE
  TO authenticated
  USING (
    seller_member_id = public.current_member_id()
    AND status IN ('bozza', 'in_revisione', 'rifiutato', 'in_vendita')
  )
  WITH CHECK (
    seller_kind = 'associato'
    AND seller_member_id = public.current_member_id()
    AND fixed_asset_id IS NULL
    AND status IN ('in_revisione', 'rifiutato', 'venduto')
  );

CREATE POLICY market_listings_owner_delete
  ON public.market_listings
  FOR DELETE
  TO authenticated
  USING (
    seller_member_id = public.current_member_id()
    AND status IN ('bozza', 'in_revisione', 'rifiutato', 'in_vendita')
  );
