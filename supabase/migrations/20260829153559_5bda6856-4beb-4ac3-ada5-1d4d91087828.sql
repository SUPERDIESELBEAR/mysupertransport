CREATE OR REPLACE FUNCTION public.commit_fuel_import(_file_name text, _provider text, _rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_batch uuid;
  r jsonb;
  l jsonb;
  v_res record;
  v_status public.fuel_match_status;
  v_dis jsonb;
  v_tx uuid;
  v_inserted int := 0;
  v_dupes int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
  v_disagree int := 0;
  v_flagged int := 0;
  v_total numeric(12,2) := 0;
  v_min date;
  v_max date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.fuel_import_batches (provider, file_name, imported_by, row_count)
  VALUES (COALESCE(NULLIF(_provider, ''), 'multiservice')::public.fuel_provider,
          _file_name, v_actor, jsonb_array_length(COALESCE(_rows, '[]'::jsonb)))
  RETURNING id INTO v_batch;

  FOR r IN SELECT elem FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) AS elem LOOP
    IF EXISTS (
      SELECT 1 FROM public.fuel_transactions t
      WHERE t.invoice_no = (r->>'invoice_no')
        AND t.invoice_date = (r->>'invoice_date')::date
        AND t.card_no = (r->>'card_no')
    ) THEN
      v_dupes := v_dupes + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_res
    FROM public.fuel_resolve_card(r->>'card_no', (r->>'invoice_date')::date);

    v_dis := '[]'::jsonb;
    IF v_res.operator_id IS NULL THEN
      v_status := 'unmatched';
    ELSE
      IF NULLIF(btrim(COALESCE(r->>'unit_no','')), '') IS NOT NULL
         AND NULLIF(btrim(COALESCE(v_res.unit_number,'')), '') IS NOT NULL
         AND upper(btrim(r->>'unit_no')) IS DISTINCT FROM upper(btrim(v_res.unit_number)) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'unit_no', 'csv_value', r->>'unit_no', 'system_value', v_res.unit_number);
      END IF;
      IF NULLIF(public.fuel_normalize_name(r->>'driver_name'), '') IS NOT NULL
         AND NULLIF(public.fuel_normalize_name(v_res.driver_name), '') IS NOT NULL
         AND public.fuel_normalize_name(r->>'driver_name')
             IS DISTINCT FROM public.fuel_normalize_name(v_res.driver_name) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'driver_name', 'csv_value', r->>'driver_name', 'system_value', v_res.driver_name);
      END IF;
      v_status := (CASE WHEN jsonb_array_length(v_dis) > 0
                        THEN 'matched_with_disagreement' ELSE 'matched' END)::public.fuel_match_status;
    END IF;

    INSERT INTO public.fuel_transactions (
      batch_id, operator_id, matched_equipment_id,
      card_no, unit_no, driver_name, city, state, invoice_no, invoice_date, daycode,
      diesel_amount, diesel_gallons, reefer_amount, additive_amount, minor_repairs_amount,
      misc_amount, tires_amount, cash_advance_12digit_amount, cash_advance_emoney_amount,
      cash_advance_insta_amount, def_amount, def_quantity, fees_amount, fuel_discount_amount,
      total_amount, match_status, disagreement_fields, reconciliation_ok, reconciliation_delta,
      created_by, updated_by
    ) VALUES (
      v_batch, v_res.operator_id, v_res.equipment_id,
      r->>'card_no', r->>'unit_no', r->>'driver_name', r->>'city', r->>'state',
      r->>'invoice_no', (r->>'invoice_date')::date, r->>'daycode',
      COALESCE((r->>'diesel_amount')::numeric, 0),
      COALESCE((r->>'diesel_gallons')::numeric, 0),
      COALESCE((r->>'reefer_amount')::numeric, 0),
      COALESCE((r->>'additive_amount')::numeric, 0),
      COALESCE((r->>'minor_repairs_amount')::numeric, 0),
      COALESCE((r->>'misc_amount')::numeric, 0),
      COALESCE((r->>'tires_amount')::numeric, 0),
      COALESCE((r->>'cash_advance_12digit_amount')::numeric, 0),
      COALESCE((r->>'cash_advance_emoney_amount')::numeric, 0),
      COALESCE((r->>'cash_advance_insta_amount')::numeric, 0),
      COALESCE((r->>'def_amount')::numeric, 0),
      COALESCE((r->>'def_quantity')::numeric, 0),
      COALESCE((r->>'fees_amount')::numeric, 0),
      COALESCE((r->>'fuel_discount_amount')::numeric, 0),
      COALESCE((r->>'total_amount')::numeric, 0),
      v_status, v_dis,
      COALESCE((r->>'reconciliation_ok')::boolean, true),
      COALESCE((r->>'reconciliation_delta')::numeric, 0),
      v_actor, v_actor
    )
    RETURNING id INTO v_tx;

    FOR l IN SELECT elem FROM jsonb_array_elements(COALESCE(r->'lines', '[]'::jsonb)) AS elem LOOP
      INSERT INTO public.fuel_transaction_lines (transaction_id, line_type, amount, quantity)
      VALUES (v_tx, (l->>'line_type')::public.fuel_line_type,
              COALESCE((l->>'amount')::numeric, 0),
              NULLIF(l->>'quantity', '')::numeric)
      ON CONFLICT (transaction_id, line_type) DO NOTHING;
    END LOOP;

    v_inserted := v_inserted + 1;
    IF v_status = 'matched' THEN v_matched := v_matched + 1;
    ELSIF v_status = 'unmatched' THEN v_unmatched := v_unmatched + 1;
    ELSE v_disagree := v_disagree + 1;
    END IF;
    IF COALESCE((r->>'reconciliation_ok')::boolean, true) = false THEN
      v_flagged := v_flagged + 1;
    END IF;
    v_total := v_total + COALESCE((r->>'total_amount')::numeric, 0);
    v_min := LEAST(v_min, (r->>'invoice_date')::date);
    v_max := GREATEST(v_max, (r->>'invoice_date')::date);
  END LOOP;

  UPDATE public.fuel_import_batches SET
    imported_count = v_inserted,
    duplicate_count = v_dupes,
    matched_count = v_matched,
    unmatched_count = v_unmatched,
    disagreement_count = v_disagree,
    flagged_count = v_flagged,
    total_amount = v_total,
    date_range_start = v_min,
    date_range_end = v_max,
    reconciliation_ok = (v_flagged = 0)
  WHERE id = v_batch;

  RETURN jsonb_build_object(
    'batch_id', v_batch,
    'row_count', jsonb_array_length(COALESCE(_rows, '[]'::jsonb)),
    'imported_count', v_inserted,
    'duplicate_count', v_dupes,
    'matched_count', v_matched,
    'unmatched_count', v_unmatched,
    'disagreement_count', v_disagree,
    'flagged_count', v_flagged,
    'total_amount', v_total,
    'date_range_start', v_min,
    'date_range_end', v_max
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_fuel_import(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_fuel_import(text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_fuel_import(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_fuel_import(text, text, jsonb) TO service_role;