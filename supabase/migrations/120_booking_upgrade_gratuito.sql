-- Upgrade gratuito: admin/collaboratore abbuona un aumento di prezzo.
-- Il totale in prenotazione resta quello già dovuto; la differenza è registrata
-- come settlement upgrade_gratuito e non muove crediti.

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
      AND rel.relname = 'booking_adjustments'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%settlement_method%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_adjustments DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END
$$;

ALTER TABLE public.booking_adjustments
  ADD CONSTRAINT booking_adjustments_settlement_method_check
  CHECK (
    settlement_method IN (
      'credits',
      'cash',
      'original_method',
      'upgrade_gratuito'
    )
  );

DO $$
DECLARE
  src text;
  patched text;
  old_list text := 'NOT IN (''credits'', ''cash'', ''original_method'')';
  new_list text := 'NOT IN (''credits'', ''cash'', ''original_method'', ''upgrade_gratuito'')';
  old_msg text := 'Metodo di settlement non valido. Usa credits, cash o original_method.';
  new_msg text := 'Metodo di settlement non valido. Usa credits, cash, original_method o upgrade_gratuito.';
  old_case text := 'WHEN ''original_method'' THEN CASE v_booking.payment_method';
  new_case text := 'WHEN ''upgrade_gratuito'' THEN ''upgrade_gratuito''
    WHEN ''original_method'' THEN CASE v_booking.payment_method';
  old_required text := 'IF ABS(v_price_delta) >= 0.01 AND v_settlement IS NULL THEN';
  new_required text := 'IF v_settlement = ''upgrade_gratuito'' AND v_price_delta < 0.01 THEN
    RETURN jsonb_build_object(
      ''success'', false,
      ''error_code'', ''INVALID_SETTLEMENT'',
      ''error_message'', ''Upgrade gratuito vale solo se il nuovo prezzo è più alto.''
    );
  END IF;

  IF ABS(v_price_delta) >= 0.01 AND v_settlement IS NULL THEN';
  old_assign text := 'total_price_eur = v_price_new';
  new_assign text := 'total_price_eur = CASE WHEN v_settlement = ''upgrade_gratuito'' AND v_price_delta > 0 THEN v_price_old ELSE v_price_new END';
  old_audit text := '''total_price_eur'', v_price_new';
  new_audit text := '''total_price_eur'', CASE WHEN v_settlement = ''upgrade_gratuito'' AND v_price_delta > 0 THEN v_price_old ELSE v_price_new END';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_update_booking_safe'
  ORDER BY p.oid DESC
  LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'admin_update_booking_safe mancante';
  END IF;

  IF position('upgrade_gratuito' IN src) > 0 THEN
    RETURN;
  END IF;

  patched := src;

  IF position(old_list IN patched) = 0 THEN
    RAISE EXCEPTION 'admin_update_booking_safe: lista settlement non trovata';
  END IF;
  patched := replace(patched, old_list, new_list);

  IF position(old_msg IN patched) > 0 THEN
    patched := replace(patched, old_msg, new_msg);
  END IF;

  IF position(old_case IN patched) = 0 THEN
    RAISE EXCEPTION 'admin_update_booking_safe: CASE settlement non trovato';
  END IF;
  patched := replace(patched, old_case, new_case);

  IF position(old_required IN patched) = 0 THEN
    RAISE EXCEPTION 'admin_update_booking_safe: controllo settlement obbligatorio non trovato';
  END IF;
  patched := replace(patched, old_required, new_required);

  IF position(old_assign IN patched) = 0 THEN
    RAISE EXCEPTION 'admin_update_booking_safe: assegnazione prezzo non trovata';
  END IF;
  patched := replace(patched, old_assign, new_assign);

  IF position(old_audit IN patched) = 0 THEN
    RAISE EXCEPTION 'admin_update_booking_safe: audit prezzo non trovato';
  END IF;
  patched := replace(patched, old_audit, new_audit);

  IF position('upgrade_gratuito' IN patched) = 0 THEN
    RAISE EXCEPTION 'admin_update_booking_safe: patch upgrade_gratuito incompleta';
  END IF;

  EXECUTE patched;
END
$$;
