-- =====================================================================
-- Module 4 — dispatch company settlement, Pass 4: THE WRITER.
--
-- The money is computed in TypeScript (computeDispatchSettlement, Pass 3) and
-- persisted here. The rules are therefore expressed ONCE. This function does
-- not re-derive them; it REFUSES a payload that does not follow from them:
--   * rates are read here, from dispatch_settlement_rates, and must match;
--   * the totals must equal the sum of the lines, re-added here;
--   * eligibility is re-tested against loads, and a payload that includes an
--     ineligible load OR omits an eligible one is refused.
-- A guard may refuse. It may never produce a figure.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.compute_dispatch_settlement(
  p_month date,
  p_result jsonb,
  p_mode text DEFAULT 'refuse'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor        uuid := public.current_profile_id();
  v_actor_name   text := public._audit_actor_name(public.current_profile_id());
  v_existing     public.dispatch_settlements%ROWTYPE;
  v_id           uuid;
  v_outcome      text;
  v_rate         public.dispatch_settlement_rates%ROWTYPE;
  v_dispatch_pct numeric := (p_result->>'dispatch_pct')::numeric;
  v_factoring_pct numeric := (p_result->>'factoring_pct')::numeric;
  v_base         numeric := coalesce((p_result->>'eligible_base')::numeric, 0);
  v_reduction    numeric := coalesce((p_result->>'factoring_reduction')::numeric, 0);
  v_reduced      numeric := coalesce((p_result->>'reduced_base')::numeric, 0);
  v_fee          numeric := coalesce((p_result->>'dispatch_fee')::numeric, 0);
  v_deductions   numeric := coalesce((p_result->>'deductions_amount')::numeric, 0);
  v_net          numeric := coalesce((p_result->>'net_amount')::numeric, 0);
  v_line         jsonb;
  v_contrib      jsonb;
  v_verdict      jsonb;
  v_contrib_id   uuid;
  v_sum_base     numeric;
  v_sum_factor   numeric;
  v_sum_fee      numeric;
  v_sum_ded      numeric;
  v_missing      text;
  v_extra        text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'management'::app_role)
          OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'Only management or owner may compute a dispatch settlement.'
      USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('refuse', 'replace') THEN
    RAISE EXCEPTION 'Unknown dispatch settlement mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  IF EXTRACT(day FROM p_month) <> 1 THEN
    RAISE EXCEPTION 'A dispatch settlement period is a calendar month; % is not the first.', p_month
      USING ERRCODE = '22023';
  END IF;

  IF to_char(p_month, 'YYYY-MM') IS DISTINCT FROM (p_result->>'month') THEN
    RAISE EXCEPTION 'Payload month % does not match the month being computed (%).',
      p_result->>'month', to_char(p_month, 'YYYY-MM') USING ERRCODE = '22000';
  END IF;

  -- ---------------------------------------------------------------- rates
  -- Read here, never taken from the payload.
  SELECT * INTO v_rate
    FROM public.dispatch_settlement_rates
   WHERE effective_from <= p_month
     AND (effective_to IS NULL OR effective_to > p_month)
   ORDER BY effective_from DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No dispatch settlement rates are effective for %.', p_month
      USING ERRCODE = '22000';
  END IF;

  IF v_rate.dispatch_pct IS DISTINCT FROM v_dispatch_pct
     OR v_rate.factoring_pct IS DISTINCT FROM v_factoring_pct THEN
    RAISE EXCEPTION 'Payload rates (dispatch %, factoring %) do not match the rates in force (dispatch %, factoring %).',
      v_dispatch_pct, v_factoring_pct, v_rate.dispatch_pct, v_rate.factoring_pct
      USING ERRCODE = '22000';
  END IF;

  -- -------------------------------------------------- totals equal the lines
  SELECT
    coalesce(sum(amount) FILTER (WHERE line_type = 'load_base'), 0),
    coalesce(sum(amount) FILTER (WHERE line_type = 'factoring_reduction'), 0),
    coalesce(sum(amount) FILTER (WHERE line_type = 'dispatch_fee'), 0),
    coalesce(sum(amount) FILTER (WHERE line_type IN ('flat_deduction', 'one_off')), 0)
  INTO v_sum_base, v_sum_factor, v_sum_fee, v_sum_ded
  FROM jsonb_to_recordset(coalesce(p_result->'lines', '[]'::jsonb))
       AS t(line_type text, amount numeric);

  IF round(v_sum_base, 2) <> round(v_base, 2)
     OR round(-v_sum_factor, 2) <> round(v_reduction, 2)
     OR round(v_base - v_reduction, 2) <> round(v_reduced, 2)
     OR round(v_sum_fee, 2) <> round(v_fee, 2)
     OR round(-v_sum_ded, 2) <> round(v_deductions, 2)
     OR round(v_sum_fee + v_sum_ded, 2) <> round(v_net, 2) THEN
    RAISE EXCEPTION 'Dispatch settlement totals do not equal its lines: base % vs %, factoring % vs %, reduced %, fee % vs %, deductions % vs %, net % vs %.',
      round(v_sum_base, 2), round(v_base, 2),
      round(-v_sum_factor, 2), round(v_reduction, 2), round(v_reduced, 2),
      round(v_sum_fee, 2), round(v_fee, 2),
      round(-v_sum_ded, 2), round(v_deductions, 2),
      round(v_sum_fee + v_sum_ded, 2), round(v_net, 2)
      USING ERRCODE = '22000';
  END IF;

  -- ------------------------------------------------- eligibility, both ways
  -- Refuse-only. Section 4.1 lives in the engine; this asks the database
  -- whether the SET of loads is the set that was eligible, and says no if not.
  SELECT string_agg(l.load_number, ', ') INTO v_missing
    FROM public.loads l
   WHERE l.delivered_at IS NOT NULL
     AND l.status::text NOT IN ('tonu', 'cancelled')
     AND to_char(l.delivered_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') = to_char(p_month, 'YYYY-MM')
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_to_recordset(coalesce(p_result->'contributions', '[]'::jsonb))
                     AS c(load_id uuid)
        WHERE c.load_id = l.id);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Dispatch settlement for % omits eligible load(s): %.', to_char(p_month, 'YYYY-MM'), v_missing
      USING ERRCODE = '22000';
  END IF;

  SELECT string_agg(coalesce(l.load_number, c.load_id::text), ', ') INTO v_extra
    FROM jsonb_to_recordset(coalesce(p_result->'contributions', '[]'::jsonb)) AS c(load_id uuid)
    LEFT JOIN public.loads l ON l.id = c.load_id
   WHERE l.id IS NULL
      OR l.delivered_at IS NULL
      OR l.status::text IN ('tonu', 'cancelled')
      OR to_char(l.delivered_at AT TIME ZONE 'America/Chicago', 'YYYY-MM') <> to_char(p_month, 'YYYY-MM');

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'Dispatch settlement for % includes ineligible load(s): %.', to_char(p_month, 'YYYY-MM'), v_extra
      USING ERRCODE = '22000';
  END IF;

  -- --------------------------------------------------------- idempotency
  SELECT * INTO v_existing
    FROM public.dispatch_settlements
   WHERE payee_key = 'dispatch_company' AND period_month = p_month;

  IF FOUND THEN
    IF p_mode = 'refuse' THEN
      RETURN jsonb_build_object(
        'month', to_char(p_month, 'YYYY-MM'),
        'settlement_id', v_existing.id,
        'outcome', 'refused_existing',
        'existing_net', v_existing.net_amount,
        'existing_status', v_existing.status
      );
    END IF;

    IF v_existing.status = 'paid' THEN
      RAISE EXCEPTION 'Dispatch settlement % is PAID and cannot be recomputed.', v_existing.id
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
    VALUES (v_actor, v_actor_name, 'dispatch_settlement_recomputed', 'dispatch_settlements',
            v_existing.id, to_char(p_month, 'YYYY-MM'),
            jsonb_build_object('previous_net', v_existing.net_amount,
                               'previous_status', v_existing.status,
                               'new_net', v_net));

    DELETE FROM public.dispatch_settlement_line_items WHERE dispatch_settlement_id = v_existing.id;
    DELETE FROM public.dispatch_settlement_load_contributions WHERE dispatch_settlement_id = v_existing.id;
    DELETE FROM public.dispatch_settlements WHERE id = v_existing.id;
    v_outcome := 'replaced';
  ELSE
    v_outcome := 'created';
  END IF;

  INSERT INTO public.dispatch_settlements (
    period_month, payee_key, status, factoring_pct, dispatch_pct,
    eligible_base, factoring_reduction, reduced_base, dispatch_fee,
    deductions_amount, net_amount, computed_at, created_by, updated_by
  ) VALUES (
    p_month, 'dispatch_company', 'draft', v_rate.factoring_pct, v_rate.dispatch_pct,
    v_base, v_reduction, v_reduced, v_fee, v_deductions, v_net, now(), v_actor, v_actor
  )
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(p_result->'lines', '[]'::jsonb))
  LOOP
    INSERT INTO public.dispatch_settlement_line_items (
      dispatch_settlement_id, line_type, amount, description,
      load_id, dispatcher_id, deduction_id, created_by
    ) VALUES (
      v_id, v_line->>'line_type', (v_line->>'amount')::numeric, v_line->>'description',
      nullif(v_line->>'load_id', '')::uuid,
      nullif(v_line->>'dispatcher_id', '')::uuid,
      nullif(v_line->>'deduction_id', '')::uuid,
      v_actor
    );
  END LOOP;

  FOR v_contrib IN SELECT * FROM jsonb_array_elements(coalesce(p_result->'contributions', '[]'::jsonb))
  LOOP
    INSERT INTO public.dispatch_settlement_load_contributions (
      dispatch_settlement_id, load_id, load_number, load_type, rate_type,
      delivered_at, carrier_delivery_date, header_component, fsc_component,
      charges_included_amount, charges_excluded_amount, base_total,
      pay_policy_id, dispatcher_id, created_by
    ) VALUES (
      v_id,
      (v_contrib->>'load_id')::uuid,
      v_contrib->>'load_number',
      v_contrib->>'load_type',
      v_contrib->>'rate_type',
      nullif(v_contrib->>'delivered_at', '')::timestamptz,
      nullif(v_contrib->>'carrier_delivery_date', '')::date,
      coalesce((v_contrib->>'header_component')::numeric, 0),
      coalesce((v_contrib->>'fsc_component')::numeric, 0),
      coalesce((v_contrib->>'charges_included_amount')::numeric, 0),
      coalesce((v_contrib->>'charges_excluded_amount')::numeric, 0),
      coalesce((v_contrib->>'base_total')::numeric, 0),
      nullif(v_contrib->>'pay_policy_id', '')::uuid,
      nullif(v_contrib->>'dispatcher_id', '')::uuid,
      v_actor
    )
    RETURNING id INTO v_contrib_id;

    FOR v_verdict IN SELECT * FROM jsonb_array_elements(coalesce(v_contrib->'verdicts', '[]'::jsonb))
    LOOP
      INSERT INTO public.dispatch_settlement_charge_verdicts (
        contribution_id, load_charge_id, charge_type, classification, amount,
        excluded, exclusion_reason, resolved_pct, pct_column
      ) VALUES (
        v_contrib_id,
        nullif(v_verdict->>'load_charge_id', '')::uuid,
        v_verdict->>'charge_type',
        v_verdict->>'classification',
        coalesce((v_verdict->>'amount')::numeric, 0),
        coalesce((v_verdict->>'excluded')::boolean, false),
        nullif(v_verdict->>'exclusion_reason', ''),
        nullif(v_verdict->>'resolved_pct', '')::numeric,
        nullif(v_verdict->>'pct_column', '')
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, 'dispatch_settlement_stored', 'dispatch_settlements', v_id,
          to_char(p_month, 'YYYY-MM'),
          jsonb_build_object(
            'outcome', v_outcome,
            'eligible_base', v_base,
            'net', v_net,
            'dispatch_pct', v_rate.dispatch_pct,
            'factoring_pct', v_rate.factoring_pct,
            'line_count', jsonb_array_length(coalesce(p_result->'lines', '[]'::jsonb)),
            'load_count', jsonb_array_length(coalesce(p_result->'contributions', '[]'::jsonb))
          ));

  RETURN jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'settlement_id', v_id,
    'outcome', v_outcome,
    'net', v_net
  );
END;
$$;

COMMENT ON FUNCTION public.compute_dispatch_settlement(date, jsonb, text) IS
  'The ONE writer for a dispatch company settlement month. Management/owner only; actor stamped from current_profile_id(). Mode refuse (default) returns an existing month untouched; mode replace rewrites it and refuses outright when the settlement is paid. The money is computed by computeDispatchSettlement in TypeScript so section 4 exists once; this function only REFUSES a payload whose rates, arithmetic or load set do not follow from the record.';

REVOKE ALL ON FUNCTION public.compute_dispatch_settlement(date, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_dispatch_settlement(date, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_dispatch_settlement(date, jsonb, text) TO authenticated;