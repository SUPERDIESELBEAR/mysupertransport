CREATE OR REPLACE FUNCTION public.store_settlement_run(
  p_period_start date,
  p_period_end date,
  p_payday date,
  p_runs jsonb,
  p_mode text DEFAULT 'refuse'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_actor_name text := public._audit_actor_name(public.current_profile_id());
  v_run jsonb;
  v_line jsonb;
  v_wh jsonb;
  v_existing public.settlements%ROWTYPE;
  v_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_outcome text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may run a settlement.' USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('refuse', 'replace') THEN
    RAISE EXCEPTION 'Unknown settlement run mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.settlement_write', 'on', true);

  FOR v_run IN SELECT * FROM jsonb_array_elements(coalesce(p_runs, '[]'::jsonb))
  LOOP
    SELECT * INTO v_existing
    FROM public.settlements
    WHERE operator_id = (v_run->>'operator_id')::uuid
      AND period_start = p_period_start;

    IF FOUND THEN
      IF p_mode = 'refuse' THEN
        v_results := v_results || jsonb_build_object(
          'operator_id', v_run->>'operator_id',
          'settlement_id', v_existing.id,
          'outcome', 'refused_existing',
          'existing_net', v_existing.net_amount,
          'existing_status', v_existing.status
        );
        CONTINUE;
      END IF;

      IF v_existing.status = 'paid' THEN
        RAISE EXCEPTION 'Settlement % is PAID and cannot be recomputed. Corrections go through an adjustment on a later settlement.', v_existing.id
          USING ERRCODE = '42501';
      END IF;

      INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
      VALUES (v_actor, v_actor_name, 'settlement_recomputed', 'settlements', v_existing.id,
              to_char(p_period_start, 'YYYY-MM-DD') || ' -> ' || to_char(p_period_end, 'YYYY-MM-DD'),
              jsonb_build_object(
                'previous_net', v_existing.net_amount,
                'previous_status', v_existing.status,
                'new_net', (v_run->>'net_amount')::numeric,
                'new_status', v_run->>'status'
              ));

      DELETE FROM public.settlements WHERE id = v_existing.id;
      v_outcome := 'replaced';
    ELSE
      v_outcome := 'created';
    END IF;

    INSERT INTO public.settlements (
      operator_id, period_start, period_end, payday, status,
      gross_amount, deductions_amount, net_amount,
      carry_forward_in, carry_forward_out, hold_reason,
      held_at, created_by, updated_by
    ) VALUES (
      (v_run->>'operator_id')::uuid, p_period_start, p_period_end, p_payday,
      (v_run->>'status')::settlement_status,
      coalesce((v_run->>'gross_amount')::numeric, 0),
      coalesce((v_run->>'deductions_amount')::numeric, 0),
      coalesce((v_run->>'net_amount')::numeric, 0),
      coalesce((v_run->>'carry_forward_in')::numeric, 0),
      coalesce((v_run->>'carry_forward_out')::numeric, 0),
      nullif(v_run->>'hold_reason', ''),
      CASE WHEN (v_run->>'status') = 'held' THEN now() ELSE NULL END,
      v_actor, v_actor
    )
    RETURNING id INTO v_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(v_run->'lines', '[]'::jsonb))
    LOOP
      INSERT INTO public.settlement_line_items (
        settlement_id, line_type, amount, description, source_table, source_id, created_by
      ) VALUES (
        v_id, v_line->>'line_type', coalesce((v_line->>'amount')::numeric, 0),
        v_line->>'description',
        nullif(v_line->>'source_table', ''),
        nullif(v_line->>'source_id', '')::uuid,
        v_actor
      );
    END LOOP;

    FOR v_wh IN SELECT * FROM jsonb_array_elements(coalesce(v_run->'withheld', '[]'::jsonb))
    LOOP
      INSERT INTO public.settlement_withheld_loads (
        settlement_id, load_id, load_number, reason_code, message, outstanding, created_by
      ) VALUES (
        v_id,
        nullif(v_wh->>'load_id', '')::uuid,
        v_wh->>'load_number',
        v_wh->>'reason_code',
        v_wh->>'message',
        coalesce(
          (SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(v_wh->'outstanding', '[]'::jsonb)) t(x)),
          '{}'::text[]
        ),
        v_actor
      );
    END LOOP;

    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (v_actor, v_actor_name, 'settlement_stored', 'settlements', v_id,
            to_char(p_period_start, 'YYYY-MM-DD') || ' -> ' || to_char(p_period_end, 'YYYY-MM-DD'),
            jsonb_build_object(
              'operator_id', v_run->>'operator_id',
              'net', (v_run->>'net_amount')::numeric,
              'status', v_run->>'status',
              'outcome', v_outcome,
              'line_count', jsonb_array_length(coalesce(v_run->'lines', '[]'::jsonb)),
              'withheld_count', jsonb_array_length(coalesce(v_run->'withheld', '[]'::jsonb))
            ));

    v_results := v_results || jsonb_build_object(
      'operator_id', v_run->>'operator_id',
      'settlement_id', v_id,
      'outcome', v_outcome,
      'net', (v_run->>'net_amount')::numeric,
      'status', v_run->>'status'
    );
  END LOOP;

  PERFORM set_config('app.settlement_write', 'off', true);

  RETURN jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'payday', p_payday,
    'mode', p_mode,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) TO authenticated;