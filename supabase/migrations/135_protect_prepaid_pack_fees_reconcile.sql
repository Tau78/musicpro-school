-- Non abbuonare rette pack aperte come anticipo volontario (saldo ancora > 0).

CREATE OR REPLACE FUNCTION public.reconcile_pack_fees_for_enrollment(
  p_enrollment_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waived INTEGER := 0;
BEGIN
  IF p_enrollment_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH closed AS (
    UPDATE public.lesson_fees f
    SET
      status = 'abbuonata',
      remaining_eur = 0,
      note = 'consumo annullato / saldo ripristinato'
    WHERE f.course_enrollment_id = p_enrollment_id
      AND f.kind = 'pack'
      AND f.status IN ('aperta', 'parziale')
      AND COALESCE(TRIM(f.note), '') IS DISTINCT FROM 'Anticipo prossimo pacchetto'
      AND NOT EXISTS (
        SELECT 1
        FROM public.lesson_fee_allocations a
        WHERE a.fee_id = f.id
      )
    RETURNING f.id
  )
  SELECT COUNT(*)::INTEGER INTO v_waived FROM closed;

  RETURN COALESCE(v_waived, 0);
END;
$$;

COMMENT ON FUNCTION public.reconcile_pack_fees_for_enrollment(UUID) IS
  'Abbuona rette pack aperte/parziali senza allocazioni quando il saldo enrollment è tornato positivo. Esclude anticipo volontario del prossimo pacchetto.';
