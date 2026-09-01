-- ============================================================
-- Module 4, Pass 4 — persisting a settlement.
-- A settlement is a STATEMENT, not a live calculation: once stored it is read,
-- never recomputed, and once PAID it is immutable.
-- ============================================================

-- A transaction-local flag that only the writer below sets. Child-row guards
-- consult it so the writer can build a settlement that is born PAID, while
-- nothing else may touch a paid settlement's lines afterwards.
CREATE OR REPLACE FUNCTION public.settlement_writer_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT coalesce(current_setting('app.settlement_write', true), '') = 'on';
$$;

REVOKE ALL ON FUNCTION public.settlement_writer_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settlement_writer_active() FROM anon;
GRANT EXECUTE ON FUNCTION public.settlement_writer_active() TO authenticated;

-- ------------------------------------------------------------
-- Immutability of a PAID settlement
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_settlement_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'paid' AND NOT public.settlement_writer_active() THEN
      RAISE EXCEPTION 'Settlement % is PAID and cannot be deleted. Corrections go through an adjustment on a later settlement.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'paid' THEN
    IF NEW.operator_id IS DISTINCT FROM OLD.operator_id
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
       OR NEW.payday IS DISTINCT FROM OLD.payday
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.deductions_amount IS DISTINCT FROM OLD.deductions_amount
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.carry_forward_in IS DISTINCT FROM OLD.carry_forward_in
       OR NEW.carry_forward_out IS DISTINCT FROM OLD.carry_forward_out
       OR NEW.hold_reason IS DISTINCT FROM OLD.hold_reason
    THEN
      RAISE EXCEPTION 'Settlement % is PAID and is immutable. Corrections go through an adjustment on a later settlement, referencing the original.', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_settlement_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_settlement_immutability() FROM anon;

DROP TRIGGER IF EXISTS enforce_settlement_immutability ON public.settlements;
CREATE TRIGGER enforce_settlement_immutability
BEFORE UPDATE OR DELETE ON public.settlements
FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_immutability();

-- Children of a paid settlement are frozen too: a breakdown that can be edited
-- after the fact is not a breakdown a driver can check.
CREATE OR REPLACE FUNCTION public.enforce_settlement_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_settlement uuid;
  v_status settlement_status;
BEGIN
  v_settlement := CASE WHEN TG_OP = 'DELETE' THEN OLD.settlement_id ELSE NEW.settlement_id END;
  SELECT s.status INTO v_status FROM public.settlements s WHERE s.id = v_settlement;

  IF v_status = 'paid' AND NOT public.settlement_writer_active() THEN
    RAISE EXCEPTION 'Settlement % is PAID; its breakdown is immutable.', v_settlement
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_settlement_child_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_settlement_child_immutability() FROM anon;

DROP TRIGGER IF EXISTS enforce_settlement_line_immutability ON public.settlement_line_items;
CREATE TRIGGER enforce_settlement_line_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_line_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_child_immutability();

DROP TRIGGER IF EXISTS enforce_settlement_withheld_immutability ON public.settlement_withheld_loads;
CREATE TRIGGER enforce_settlement_withheld_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_withheld_loads
FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_child_immutability();

-- ------------------------------------------------------------
-- The writer
-- ------------------------------------------------------------
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
      VALUES (v_actor, public._audit_actor_name(), 'settlement_recomputed', 'settlements', v_existing.id,
              to_char(p_period_start, 'YYYY-MM-DD') || ' → ' || to_char(p_period_end, 'YYYY-MM-DD'),
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
    VALUES (v_actor, public._audit_actor_name(), 'settlement_stored', 'settlements', v_id,
            to_char(p_period_start, 'YYYY-MM-DD') || ' → ' || to_char(p_period_end, 'YYYY-MM-DD'),
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