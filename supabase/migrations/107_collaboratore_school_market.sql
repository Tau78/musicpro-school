-- Collaboratore: gestisce solo gli oggetti Market dell'associazione.
-- Gli annunci personali restano sulle policy del venditore (seller_member_id).

CREATE POLICY market_listings_school_desk
  ON public.market_listings
  FOR ALL
  TO authenticated
  USING (
    public.has_member_role('collaboratore'::public.member_role)
    AND seller_kind = 'associazione'
  )
  WITH CHECK (
    public.has_member_role('collaboratore'::public.member_role)
    AND seller_kind = 'associazione'
    AND seller_member_id IS NULL
  );

CREATE POLICY market_orders_school_desk
  ON public.market_orders
  FOR ALL
  TO authenticated
  USING (
    public.has_member_role('collaboratore'::public.member_role)
    AND EXISTS (
      SELECT 1
      FROM public.market_listings l
      WHERE l.id = listing_id
        AND l.seller_kind = 'associazione'
    )
  )
  WITH CHECK (
    public.has_member_role('collaboratore'::public.member_role)
    AND EXISTS (
      SELECT 1
      FROM public.market_listings l
      WHERE l.id = listing_id
        AND l.seller_kind = 'associazione'
    )
  );

-- Foto solo sotto market/, non il resto del sito.
CREATE POLICY website_storage_market_desk_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'website'
    AND public.has_member_role('collaboratore'::public.member_role)
    AND name LIKE 'market/%'
  );

CREATE POLICY website_storage_market_desk_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'website'
    AND public.has_member_role('collaboratore'::public.member_role)
    AND name LIKE 'market/%'
  )
  WITH CHECK (
    bucket_id = 'website'
    AND public.has_member_role('collaboratore'::public.member_role)
    AND name LIKE 'market/%'
  );

CREATE POLICY website_storage_market_desk_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'website'
    AND public.has_member_role('collaboratore'::public.member_role)
    AND name LIKE 'market/%'
  );
