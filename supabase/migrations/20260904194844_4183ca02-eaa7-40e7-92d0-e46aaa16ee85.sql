CREATE OR REPLACE FUNCTION public.enforce_accessorial_adjustment_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_legal text[];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_legal := CASE OLD.status
    WHEN 'draft'            THEN ARRAY['pending_approval','void']
    WHEN 'pending_approval' THEN ARRAY['approved','rejected','void']
    WHEN 'approved'         THEN ARRAY['settled','void']
    -- A settled adjustment goes back to approved ONLY when the settlement that
    -- consumed it is being recomputed, and only inside the settlement writer.
    WHEN 'settled'          THEN CASE WHEN public.settlement_writer_active()
                                      THEN ARRAY['approved'] ELSE ARRAY[]::text[] END
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY (v_legal)) THEN
    RAISE EXCEPTION 'Adjustment % cannot move from % to %.',
      OLD.reference, OLD.status, NEW.status USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'settled' AND NOT public.settlement_writer_active() THEN
    RAISE EXCEPTION 'Adjustment % is settled by the settlement writer, not by a caller.',
      OLD.reference USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_transition() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_transition() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_transition() TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_accessorial_adjustment_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved','settled')
       AND NOT public.accessorial_adjustment_writer_active() THEN
      RAISE EXCEPTION 'Adjustment % is %; it is voided with a reason, never deleted.',
        OLD.reference, OLD.status USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('approved','settled')
     AND NOT public.accessorial_adjustment_writer_active() THEN
    IF NEW.company_id     IS DISTINCT FROM OLD.company_id
    OR NEW.load_id        IS DISTINCT FROM OLD.load_id
    OR NEW.reference      IS DISTINCT FROM OLD.reference
    OR NEW.sequence       IS DISTINCT FROM OLD.sequence
    OR NEW.charge_type    IS DISTINCT FROM OLD.charge_type
    OR NEW.amount         IS DISTINCT FROM OLD.amount
    OR NEW.funding_source IS DISTINCT FROM OLD.funding_source
    OR NEW.actual_cost    IS DISTINCT FROM OLD.actual_cost
    OR NEW.reason         IS DISTINCT FROM OLD.reason
    OR NEW.approved_at    IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by    IS DISTINCT FROM OLD.approved_by
    THEN
      RAISE EXCEPTION 'Adjustment % is APPROVED; its load, reference, classification and amount are immutable. Void it with a reason and re-enter. Status, settlement and invoice pointers may still advance.',
        OLD.reference USING ERRCODE = '42501';
    END IF;

    -- Status may only ADVANCE out of approved. Terminal stays terminal.
    IF OLD.status = 'approved'
       AND NEW.status NOT IN ('approved','settled','void') THEN
      RAISE EXCEPTION 'Adjustment % cannot return to % once approved.',
        OLD.reference, NEW.status USING ERRCODE = '42501';
    END IF;
    -- Settled is final to every caller. The settlement writer, and only the
    -- settlement writer, releases it when the settlement that paid it is
    -- recomputed; the money and its classification stay frozen either way.
    IF OLD.status = 'settled' AND NEW.status <> 'settled'
       AND NOT (NEW.status = 'approved' AND public.settlement_writer_active()) THEN
      RAISE EXCEPTION 'Adjustment % has been settled; its status is final.',
        OLD.reference USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_immutability() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_accessorial_adjustment_immutability() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_accessorial_adjustment_immutability() TO service_role;

CREATE OR REPLACE FUNCTION public.store_settlement_run(p_period_start date, p_period_end date, p_payday date, p_runs jsonb, p_mode text DEFAULT 'refuse'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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
  v_line_id uuid;
  v_adj public.accessorial_adjustments%ROWTYPE;
  v_adj_operator uuid;
  v_operator uuid;
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
    v_operator := (v_run->>'operator_id')::uuid;

    SELECT * INTO v_existing
    FROM public.settlements
    WHERE operator_id = v_operator
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

      -- Release any adjustment this settlement had consumed BEFORE deleting it:
      -- accessorial_adjustments.settlement_id is ON DELETE RESTRICT, so an
      -- unreleased adjustment would block the recompute rather than be paid
      -- twice. Released to `approved`, so the very next run picks it up again.
      UPDATE public.accessorial_adjustments
         SET status = 'approved',
             settlement_id = NULL,
             settlement_line_item_id = NULL,
             updated_at = now(),
             updated_by = v_actor
       WHERE settlement_id = v_existing.id;

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
      v_operator, p_period_start, p_period_end, p_payday,
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
      )
      RETURNING id INTO v_line_id;

      -- THE WRITE-BACK. An adjustment records its own consumption here and
      -- nowhere else: one writer per state change, and no client role can
      -- reach `settled` (enforce_accessorial_adjustment_transition requires
      -- settlement_writer_active()). The row is VALIDATED, not trusted: the
      -- payload is composed in the browser.
      IF nullif(v_line->>'source_table', '') = 'accessorial_adjustments'
         AND nullif(v_line->>'source_id', '') IS NOT NULL THEN
        SELECT * INTO v_adj
        FROM public.accessorial_adjustments
        WHERE id = (v_line->>'source_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Settlement line references adjustment % which does not exist.',
            v_line->>'source_id' USING ERRCODE = '23503';
        END IF;

        IF v_adj.status <> 'approved' THEN
          RAISE EXCEPTION 'Adjustment % is %, not approved; it cannot be settled.',
            v_adj.reference, v_adj.status USING ERRCODE = '42501';
        END IF;

        IF v_adj.settlement_id IS NOT NULL THEN
          RAISE EXCEPTION 'Adjustment % is already settled on settlement %.',
            v_adj.reference, v_adj.settlement_id USING ERRCODE = '42501';
        END IF;

        SELECT operator_id INTO v_adj_operator FROM public.loads WHERE id = v_adj.load_id;
        IF v_adj_operator IS DISTINCT FROM v_operator THEN
          RAISE EXCEPTION 'Adjustment % belongs to another driver''s load and cannot be paid on this settlement.',
            v_adj.reference USING ERRCODE = '42501';
        END IF;

        UPDATE public.accessorial_adjustments
           SET status = 'settled',
               settlement_id = v_id,
               settlement_line_item_id = v_line_id,
               updated_at = now(),
               updated_by = v_actor
         WHERE id = v_adj.id;
      END IF;
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
$function$;

REVOKE ALL ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_settlement_run(date, date, date, jsonb, text) TO service_role;