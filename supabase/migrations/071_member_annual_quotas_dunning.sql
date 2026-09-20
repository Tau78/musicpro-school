-- Dunning history on annual quotas + allow staff to create Stripe checkout for any member.

ALTER TABLE public.member_annual_quotas
  ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dunning_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.member_annual_quotas
  DROP CONSTRAINT IF EXISTS member_annual_quotas_dunning_count_check;

ALTER TABLE public.member_annual_quotas
  ADD CONSTRAINT member_annual_quotas_dunning_count_check
  CHECK (dunning_count >= 0);

COMMENT ON COLUMN public.member_annual_quotas.last_dunning_at IS
  'Ultimo sollecito quota inviato dalla segreteria.';
COMMENT ON COLUMN public.member_annual_quotas.dunning_count IS
  'Numero di solleciti inviati per questa riga anno/associato.';

-- Allow admin/segreteria to create checkout for any unpaid member (not only self/band).
CREATE OR REPLACE FUNCTION public.create_quota_payment_checkout(
  p_member_ids UUID[],
  p_fiscal_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_year           INTEGER;
  v_amount_eur     NUMERIC(10, 2);
  v_total_eur      NUMERIC(10, 2) := 0;
  v_member_id      UUID;
  v_quota_payment_id UUID;
  v_distinct_ids   UUID[];
  v_count          INTEGER;
  v_is_staff       BOOLEAN;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBERS',
      'error_message', 'Seleziona almeno un membro.'
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT mid), ARRAY[]::UUID[])
  INTO v_distinct_ids
  FROM unnest(p_member_ids) AS mid
  WHERE mid IS NOT NULL;

  v_count := COALESCE(array_length(v_distinct_ids, 1), 0);

  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_MEMBERS',
      'error_message', 'Seleziona almeno un membro valido.'
    );
  END IF;

  v_year := COALESCE(p_fiscal_year, public.current_fiscal_year());
  v_amount_eur := public.quota_amount_eur_for_year(v_year);
  v_is_staff := public.is_admin_or_segreteria();

  FOREACH v_member_id IN ARRAY v_distinct_ids
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v_member_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'MEMBER_NOT_FOUND',
        'error_message', 'Uno degli associati selezionati non esiste.'
      );
    END IF;

    IF public.member_quota_ok(v_member_id, v_year) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QUOTA_ALREADY_PAID',
        'error_message', 'Uno degli associati selezionati ha già pagato la quota.'
      );
    END IF;

    IF v_member_id <> v_current_member AND NOT v_is_staff THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.band_members bm_self
        JOIN public.band_members bm_peer
          ON bm_peer.band_id = bm_self.band_id
        WHERE bm_self.member_id = v_current_member
          AND bm_peer.member_id = v_member_id
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'NOT_AUTHORIZED',
          'error_message', 'Puoi pagare la quota solo per te o per membri della tua band.'
        );
      END IF;
    END IF;
  END LOOP;

  v_total_eur := round(v_amount_eur * v_count, 2);

  INSERT INTO public.quota_payments (
    paid_by_member_id,
    total_amount_eur,
    fiscal_year
  )
  VALUES (
    v_current_member,
    v_total_eur,
    v_year
  )
  RETURNING id INTO v_quota_payment_id;

  FOREACH v_member_id IN ARRAY v_distinct_ids
  LOOP
    INSERT INTO public.quota_payment_items (
      quota_payment_id,
      member_id,
      amount_eur,
      fiscal_year,
      paid_by_member_id,
      status
    )
    VALUES (
      v_quota_payment_id,
      v_member_id,
      v_amount_eur,
      v_year,
      v_current_member,
      'pending'::public.quota_payment_item_status
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'quota_payment_id', v_quota_payment_id,
    'total_amount_eur', v_total_eur,
    'fiscal_year', v_year,
    'member_count', v_count
  );
END;
$$;

COMMENT ON FUNCTION public.create_quota_payment_checkout(UUID[], INTEGER) IS
  'Crea checkout quota multi-membro (pending). Caller: self, peer band, oppure admin/segreteria.';
