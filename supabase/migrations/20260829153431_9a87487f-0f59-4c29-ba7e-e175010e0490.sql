CREATE OR REPLACE FUNCTION public.fuel_resolve_card(_card_no text, _on_date date)
RETURNS TABLE (operator_id uuid, equipment_id uuid, unit_number text, driver_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT o.id,
         ei.id,
         COALESCE(NULLIF(btrim(os.unit_number), ''), NULLIF(btrim(o.unit_number), '')),
         btrim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
  FROM public.equipment_items ei
  JOIN public.equipment_assignments ea ON ea.equipment_id = ei.id
  JOIN public.operators o ON o.id = ea.operator_id
  LEFT JOIN public.onboarding_status os ON os.operator_id = o.id
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE ei.device_type = 'fuel_card'
    AND upper(btrim(ei.serial_number)) = upper(btrim(COALESCE(_card_no, '')))
    AND ea.assigned_at::date <= _on_date
    AND (ea.returned_at IS NULL OR ea.returned_at::date >= _on_date)
  ORDER BY ea.assigned_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fuel_resolve_card(text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_resolve_card(text, date) TO service_role;

-- A disagreement requires BOTH sides to hold a value. A missing system unit
-- number or a blank name is an absence, not a contradiction.
CREATE OR REPLACE FUNCTION public.preview_fuel_import(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r jsonb;
  v_res record;
  v_status text;
  v_dis jsonb;
  v_key text;
  v_seen text[] := ARRAY[]::text[];
  v_out jsonb := '[]'::jsonb;
  v_dupes int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
  v_disagree int := 0;
  v_flagged int := 0;
  v_total numeric := 0;
  v_min date;
  v_max date;
  v_dup boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN SELECT elem FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) AS elem LOOP
    v_key := COALESCE(r->>'invoice_no','') || '|' || COALESCE(r->>'invoice_date','') || '|' || COALESCE(r->>'card_no','');

    v_dup := (v_key = ANY (v_seen))
      OR EXISTS (
        SELECT 1 FROM public.fuel_transactions t
        WHERE t.invoice_no = (r->>'invoice_no')
          AND t.invoice_date = (r->>'invoice_date')::date
          AND t.card_no = (r->>'card_no')
      );
    v_seen := v_seen || v_key;

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
          'field', 'unit_no',
          'csv_value', r->>'unit_no',
          'system_value', v_res.unit_number);
      END IF;
      IF NULLIF(public.fuel_normalize_name(r->>'driver_name'), '') IS NOT NULL
         AND NULLIF(public.fuel_normalize_name(v_res.driver_name), '') IS NOT NULL
         AND public.fuel_normalize_name(r->>'driver_name')
             IS DISTINCT FROM public.fuel_normalize_name(v_res.driver_name) THEN
        v_dis := v_dis || jsonb_build_object(
          'field', 'driver_name',
          'csv_value', r->>'driver_name',
          'system_value', v_res.driver_name);
      END IF;
      v_status := CASE WHEN jsonb_array_length(v_dis) > 0
                       THEN 'matched_with_disagreement' ELSE 'matched' END;
    END IF;

    IF NOT v_dup THEN
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
    ELSE
      v_dupes := v_dupes + 1;
    END IF;

    v_out := v_out || jsonb_build_object(
      'invoice_no',    r->>'invoice_no',
      'invoice_date',  r->>'invoice_date',
      'card_no',       r->>'card_no',
      'unit_no',       r->>'unit_no',
      'driver_name',   r->>'driver_name',
      'total_amount',  COALESCE((r->>'total_amount')::numeric, 0),
      'duplicate',     v_dup,
      'operator_id',   v_res.operator_id,
      'match_status',  v_status,
      'disagreement_fields', v_dis,
      'reconciliation_ok', COALESCE((r->>'reconciliation_ok')::boolean, true),
      'reconciliation_delta', COALESCE((r->>'reconciliation_delta')::numeric, 0)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'row_count',          jsonb_array_length(COALESCE(_rows, '[]'::jsonb)),
    'importable_count',   jsonb_array_length(COALESCE(_rows, '[]'::jsonb)) - v_dupes,
    'duplicate_count',    v_dupes,
    'matched_count',      v_matched,
    'unmatched_count',    v_unmatched,
    'disagreement_count', v_disagree,
    'flagged_count',      v_flagged,
    'total_amount',       v_total,
    'date_range_start',   v_min,
    'date_range_end',     v_max,
    'rows',               v_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_fuel_import(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_fuel_import(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_fuel_import(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_fuel_import(jsonb) TO service_role;