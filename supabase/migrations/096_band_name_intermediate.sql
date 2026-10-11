-- Step intermedio BAND: salva nome band del founder e collega prenotazioni al calendario.

-- ---------------------------------------------------------------------------
-- save_my_band_name_safe — crea (se assente) o rinomina la band del founder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_my_band_name_safe(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_name           TEXT;
  v_band_id        UUID;
  v_founder_count  INTEGER;
  v_synced         INTEGER;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  v_name := trim(p_name);

  IF v_name IS NULL OR char_length(v_name) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_NAME',
      'error_message', 'Inserisci un nome per la band.'
    );
  END IF;

  IF char_length(v_name) > 120 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_NAME',
      'error_message', 'Il nome della band non può superare 120 caratteri.'
    );
  END IF;

  SELECT count(*)::INTEGER
  INTO v_founder_count
  FROM public.bands b
  WHERE b.founder_member_id = v_current_member;

  IF v_founder_count > 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Hai più band come founder. Gestiscile dalla pagina Band.'
    );
  END IF;

  SELECT b.id
  INTO v_band_id
  FROM public.bands b
  WHERE b.founder_member_id = v_current_member
  LIMIT 1;

  IF v_band_id IS NOT NULL THEN
    UPDATE public.bands
    SET name = v_name,
        updated_at = now()
    WHERE id = v_band_id;
  ELSE
    IF NOT public.member_quota_ok(v_current_member) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QUOTA_NOT_PAID',
        'error_message', 'Devi aver pagato la quota associativa per registrare la band.'
      );
    END IF;

    INSERT INTO public.bands (name, founder_member_id)
    VALUES (v_name, v_current_member)
    RETURNING id INTO v_band_id;

    INSERT INTO public.band_members (
      band_id,
      member_id,
      status,
      role,
      joined_at
    )
    VALUES (
      v_band_id,
      v_current_member,
      'active'::public.band_member_status,
      'founder'::public.band_member_role,
      now()
    );
  END IF;

  v_synced := public.sync_member_band_on_bookings(v_band_id, v_current_member);

  RETURN jsonb_build_object(
    'success', true,
    'band_id', v_band_id,
    'name', v_name,
    'bookings_synced', v_synced
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNKNOWN',
      'error_message', 'Impossibile salvare la band.'
    );
END;
$$;

COMMENT ON FUNCTION public.save_my_band_name_safe(TEXT) IS
  'Step intermedio: crea o rinomina la band del founder autenticato e aggiorna le prenotazioni senza band_id.';

GRANT EXECUTE ON FUNCTION public.save_my_band_name_safe(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- sync_member_band_on_bookings — etichetta calendario (band_id) senza bloccare
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_member_band_on_bookings(
  p_band_id UUID,
  p_member_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_band_id IS NULL OR p_member_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.band_members bm
    WHERE bm.band_id = p_band_id
      AND bm.member_id = p_member_id
      AND bm.status = 'active'::public.band_member_status
  ) THEN
    RETURN 0;
  END IF;

  UPDATE public.bookings b
  SET band_id = p_band_id,
      updated_at = now()
  WHERE b.member_id = p_member_id
    AND b.band_id IS NULL
    AND COALESCE(b.provi_da_solo, false) = false
    AND b.cancelled_at IS NULL
    AND b.status NOT IN ('cancelled'::public.booking_status);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.sync_member_band_on_bookings(UUID, UUID) IS
  'Collega band_id alle prenotazioni attive del membro (nome band in calendario).';

GRANT EXECUTE ON FUNCTION public.sync_member_band_on_bookings(UUID, UUID) TO authenticated;
