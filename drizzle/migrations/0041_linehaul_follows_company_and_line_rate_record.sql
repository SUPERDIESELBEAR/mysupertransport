-- ---------------------------------------------------------------------------
-- PER-DRIVER PAY — Part A (P42) and Pass 4 (the settlement line rate record).
--
-- PART A / P42 (owner, 2026-09-22): a driver FOLLOWS THE COMPANY linehaul rate
-- unless the owner has deliberately set his own. The Pass 3 backfill pinned all
-- 157 drivers to their own 72%; those versions are closed as of 2026-09-21 (a
-- DATA change, run separately through the query path, visibly and deliberately),
-- so from 2026-09-22 they follow the company version again.
--
-- This migration carries the two SCHEMA halves of that decision:
--   1. the mirror now follows a COMPANY policy change too, so a driver with no
--      current version of his own shows the company rate in
--      operators.pay_percentage (the earnings forecast reads that column);
--   2. Pass 4: every new driver settlement line records the percentage that
--      produced it, where that percentage came from, and the id of the version
--      it came from — mirroring dispatch_settlement_line_items.resolved_pct.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- PART A.3 — THE MIRROR FOLLOWS THE COMPANY WHEN A DRIVER HAS NO VERSION.
--
-- Before: only drivers WITH a version in force were mirrored, so a driver whose
-- versions are all closed would keep whatever number was last written — exactly
-- the 157 drivers Part A closes. After: his version if he has one, else the
-- company version's linehaul_pct in force today, resolved through the one dated
-- resolver (public.company_pay_policy_on) rather than a second policy lookup.
--
-- A NULL company rate (no active version covering today) leaves every mirror
-- untouched rather than writing a guess — fail closed, as elsewhere.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_operator_linehaul_pct_mirror()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer;
  v_company_pct numeric;
BEGIN
  SELECT p.linehaul_pct INTO v_company_pct
  FROM public.company_pay_policy_on(CURRENT_DATE) p;

  WITH target AS (
    SELECT o.id,
           coalesce(v.pct, v_company_pct) AS pct
      FROM public.operators o
      LEFT JOIN public.operator_linehaul_pct_versions v
             ON v.operator_id = o.id
            AND v.effective_from <= CURRENT_DATE
            AND (v.effective_to IS NULL OR v.effective_to >= CURRENT_DATE)
  ), moved AS (
    UPDATE public.operators o
       SET pay_percentage = t.pct::int
      FROM target t
     WHERE o.id = t.id
       AND t.pct IS NOT NULL
       AND o.pay_percentage IS DISTINCT FROM t.pct::int
    RETURNING o.id
  )
  SELECT count(*) INTO v_count FROM moved;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.sync_operator_linehaul_pct_mirror() IS
  'Catches operators.pay_percentage up to the rate in force TODAY: the driver''s own version if he has one, else the company pay policy version (P42). Runs daily on cron job sync-operator-linehaul-pct-mirror at 05:10 UTC, so a version or company policy starting on a date is mirrored during that date. Settlements never read the mirror; only the earnings forecast does.';

-- ---------------------------------------------------------------------------
-- PASS 4 — THE LINE RECORDS ITS RATE.
--
-- NULLABLE, and deliberately NOT backfilled: every settlement line written
-- before this pass keeps all three columns NULL, including the paid settlement
-- f77911b0, which is never modified. "No record" and "recorded as the company
-- rate" therefore stay different facts.
--
-- pct_source distinguishes a DRIVER's dated linehaul version from a PAY POLICY
-- version (company default, driver assignment or load-specific override);
-- pct_version_id names whichever row was read. There is no foreign key for that
-- reason — the id points at operator_linehaul_pct_versions or at pay_policies
-- depending on the source — and both tables refuse deletes outright, which is
-- the integrity a foreign key would have been buying.
-- ---------------------------------------------------------------------------
ALTER TABLE public.settlement_line_items
  ADD COLUMN IF NOT EXISTS resolved_pct   numeric(5,2),
  ADD COLUMN IF NOT EXISTS pct_source     text,
  ADD COLUMN IF NOT EXISTS pct_version_id uuid;

ALTER TABLE public.settlement_line_items
  DROP CONSTRAINT IF EXISTS settlement_line_items_pct_source_check;
ALTER TABLE public.settlement_line_items
  ADD CONSTRAINT settlement_line_items_pct_source_check
  CHECK (pct_source IS NULL OR pct_source IN ('driver_version', 'company_policy'));

ALTER TABLE public.settlement_line_items
  DROP CONSTRAINT IF EXISTS settlement_line_items_resolved_pct_range;
ALTER TABLE public.settlement_line_items
  ADD CONSTRAINT settlement_line_items_resolved_pct_range
  CHECK (resolved_pct IS NULL OR (resolved_pct >= 0 AND resolved_pct <= 100));

-- A percentage with no stated origin, or an origin with no percentage, would be
-- a half-record nobody could audit. Both or neither.
ALTER TABLE public.settlement_line_items
  DROP CONSTRAINT IF EXISTS settlement_line_items_pct_record_paired;
ALTER TABLE public.settlement_line_items
  ADD CONSTRAINT settlement_line_items_pct_record_paired
  CHECK ((resolved_pct IS NULL) = (pct_source IS NULL));

COMMENT ON COLUMN public.settlement_line_items.resolved_pct IS
  'The percentage that produced this line. NULL on lines written before per-driver pay Pass 4, and on lines no percentage priced (fuel, deductions, cash advances, the R&M Deposit, carry-forward, a reimbursement paid at cost, a Clean Roadside bonus paid at 100%).';
COMMENT ON COLUMN public.settlement_line_items.pct_source IS
  'Where resolved_pct came from: driver_version (his own dated operator_linehaul_pct_versions row) or company_policy (the pay_policies version in force — company default, driver assignment or load override).';
COMMENT ON COLUMN public.settlement_line_items.pct_version_id IS
  'The id of the version resolved_pct was read from: operator_linehaul_pct_versions.id when pct_source is driver_version, pay_policies.id when it is company_policy. No FK: it names one of two tables, and neither admits a delete.';

-- ---------------------------------------------------------------------------
-- The one writer records all three. Everything else about this function is
-- unchanged from 0026/0038-era text; only the line INSERT grew three columns.
-- ---------------------------------------------------------------------------
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
  v_pay public.inspection_program_payments%ROWTYPE;
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

      -- Same release for inspection program payments consumed by this settlement.
      UPDATE public.inspection_program_payments
         SET status = 'approved',
             settlement_id = NULL,
             settled_at = NULL,
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
      -- THE RATE RECORD (Pass 4). The engine states the percentage, its source
      -- and the id of the version it was read from on every line a percentage
      -- priced; the rest arrive NULL and stay NULL.
      INSERT INTO public.settlement_line_items (
        settlement_id, line_type, amount, description, source_table, source_id,
        resolved_pct, pct_source, pct_version_id, created_by
      ) VALUES (
        v_id, v_line->>'line_type', coalesce((v_line->>'amount')::numeric, 0),
        v_line->>'description',
        nullif(v_line->>'source_table', ''),
        nullif(v_line->>'source_id', '')::uuid,
        nullif(v_line->>'resolved_pct', '')::numeric,
        nullif(v_line->>'pct_source', ''),
        nullif(v_line->>'pct_version_id', '')::uuid,
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

      -- Same write-back for an approved Clean Roadside bonus. Validated, not
      -- trusted: must exist, be approved, belong to THIS operator, and be
      -- unsettled. Stamped settled in the same transaction as the line.
      IF nullif(v_line->>'source_table', '') = 'inspection_program_payments'
         AND nullif(v_line->>'source_id', '') IS NOT NULL THEN
        SELECT * INTO v_pay
        FROM public.inspection_program_payments
        WHERE id = (v_line->>'source_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Settlement line references inspection payment % which does not exist.',
            v_line->>'source_id' USING ERRCODE = '23503';
        END IF;

        IF v_pay.status <> 'approved' THEN
          RAISE EXCEPTION 'Inspection payment % is %, not approved; it cannot be settled.',
            v_pay.id, v_pay.status USING ERRCODE = '42501';
        END IF;

        IF v_pay.settlement_id IS NOT NULL THEN
          RAISE EXCEPTION 'Inspection payment % is already settled on settlement %.',
            v_pay.id, v_pay.settlement_id USING ERRCODE = '42501';
        END IF;

        IF v_pay.operator_id IS DISTINCT FROM v_operator THEN
          RAISE EXCEPTION 'Inspection payment % belongs to another driver and cannot be paid on this settlement.',
            v_pay.id USING ERRCODE = '42501';
        END IF;

        UPDATE public.inspection_program_payments
           SET status = 'settled',
               settlement_id = v_id,
               settled_at = now(),
               updated_at = now(),
               updated_by = v_actor
         WHERE id = v_pay.id;
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