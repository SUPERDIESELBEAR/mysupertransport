-- PER-DRIVER PAY, PASS 1 of 5 (design 2026-09-22, option (c)).
--
-- Adds the effective window to pay_policies and ONE dated resolver that every
-- reader consults. No second version is created here, and the
-- single-company-default index is deliberately NOT re-scoped — that is Pass 2.
--
-- Why this must land before any second version exists: six readers took the
-- company default with .maybeSingle() or a bare LIMIT 1 and no date test, so the
-- moment a second row existed they would either error or silently pick the wrong
-- rate (contradiction C of docs/passes/2026-09-22-1230-pay-policy-history.md).

ALTER TABLE public.pay_policies
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to   date;

COMMENT ON COLUMN public.pay_policies.effective_from IS
  'First date this VERSION of the policy applies. NULL means open-start (covers every earlier date). Set once; a change opens a new version rather than editing this row (P41).';
COMMENT ON COLUMN public.pay_policies.effective_to IS
  'Last date this version applies; NULL means it is the CURRENT version. Closing a version is the only permitted update to a superseded row (guard arrives in Pass 2).';
COMMENT ON COLUMN public.pay_policies.effective_date IS
  'Original single-date column, kept untouched for existing readers and audit. The versioning window is effective_from / effective_to (P41).';

-- Backfill of the new column only. Version one must cover every settlement that
-- already exists, so its start is the EARLIEST of its own effective_date, the
-- earliest settlement period_start, and 2000-01-01. effective_date itself is not
-- edited. effective_to stays NULL: the one row is the current version.
UPDATE public.pay_policies pp
   SET effective_from = LEAST(
         COALESCE(pp.effective_date, DATE '2000-01-01'),
         COALESCE((SELECT min(s.period_start) FROM public.settlements s), DATE '2000-01-01'),
         DATE '2000-01-01')
 WHERE pp.effective_from IS NULL;

-- THE ONE RESOLVER, database side. SETOF so "no version in force" is zero rows
-- rather than a row of NULLs. SECURITY INVOKER on purpose: its three callers are
-- already SECURITY DEFINER, so it runs with their privileges and adds no new
-- client-reachable definer surface.
CREATE OR REPLACE FUNCTION public.company_pay_policy_on(_as_of date)
RETURNS SETOF public.pay_policies
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT pp.*
    FROM public.pay_policies pp
   WHERE pp.is_company_default
     AND pp.is_active
     AND (pp.effective_from IS NULL OR pp.effective_from <= _as_of)
     AND (pp.effective_to   IS NULL OR pp.effective_to   >= _as_of)
   ORDER BY pp.effective_from DESC NULLS LAST,
            pp.effective_date DESC NULLS LAST,
            pp.created_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.company_pay_policy_on(date) IS
  'The company-default pay policy VERSION in force on a date. The single database-side resolver; called only from SECURITY DEFINER functions, never by a client role.';

REVOKE ALL ON FUNCTION public.company_pay_policy_on(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_pay_policy_on(date) FROM anon;
REVOKE ALL ON FUNCTION public.company_pay_policy_on(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.company_pay_policy_on(date) TO service_role;

-- The driver's fuel statement: the switch now comes from the version in force
-- today instead of an unordered LIMIT 1. Body otherwise byte-identical.
CREATE OR REPLACE FUNCTION public.my_fuel_transactions()
 RETURNS TABLE(id uuid, invoice_no text, invoice_date date, merchant_name text, city text, state text, total_amount numeric, fuel_discount_amount numeric, diesel_amount numeric, diesel_gallons numeric, lines jsonb, settlement_id uuid, period_start date, period_end date, payday date, settlement_status text, work_week_start_dow integer, discount_passthrough boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    ft.id,
    ft.invoice_no,
    ft.invoice_date,
    ft.merchant_name,
    ft.city,
    ft.state,
    ft.total_amount,
    ft.fuel_discount_amount,
    ft.diesel_amount,
    ft.diesel_gallons,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('line_type', l.line_type, 'amount', l.amount))
        FROM public.fuel_transaction_lines l
       WHERE l.transaction_id = ft.id
    ), '[]'::jsonb),
    s.id,
    s.period_start,
    s.period_end,
    s.payday,
    s.status::text,
    COALESCE((SELECT ss.work_week_start_dow FROM public.settlement_settings ss WHERE ss.company_id = public.current_company_id()), 3),
    -- THE SAME RESOLUTION ORDER THE SETTLEMENT ENGINE USES: the per-driver
    -- setting first, the company default policy as the fallback, off if
    -- neither says otherwise. The driver cannot read pay_policies, so this is
    -- the only way his screen can know whether a discount is his to see.
    -- PASS 1: the fallback is the VERSION IN FORCE TODAY, not an arbitrary row.
    COALESCE(
      o.fuel_discount_passthrough_override,
      (SELECT p.fuel_discount_passthrough
         FROM public.company_pay_policy_on((now() AT TIME ZONE 'America/Chicago')::date) p),
      false
    )
  FROM public.fuel_transactions ft
  JOIN public.operators o
    ON o.id = ft.operator_id
   AND o.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT s2.id, s2.period_start, s2.period_end, s2.payday, s2.status
      FROM public.settlement_line_items sli
      JOIN public.settlements s2 ON s2.id = sli.settlement_id
     WHERE sli.source_table = 'fuel_transactions'
       AND sli.source_id = ft.id
     LIMIT 1
  ) s ON TRUE
  WHERE auth.uid() IS NOT NULL;
$function$;

-- The two long definer functions are re-created from their OWN live definition
-- with only the policy lookup substituted, so nothing else in their bodies can
-- drift through transcription. Each substitution is asserted to have happened.
DO $do$
DECLARE
  v_def  text;
  v_old  text;
  v_new  text;
BEGIN
  -- driver_load_pay_estimate: the driver's own estimate, resolved on Chicago today.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'driver_load_pay_estimate';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'driver_load_pay_estimate not found';
  END IF;

  v_old := 'SELECT pp.* INTO v_policy
      FROM public.pay_policies pp
     WHERE pp.is_company_default AND pp.is_active
     ORDER BY pp.effective_date DESC
     LIMIT 1;';
  v_new := 'SELECT p.* INTO v_policy FROM public.company_pay_policy_on(v_today) p;';
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'driver_load_pay_estimate: the company-default lookup is not in the expected shape; refusing to guess';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);

  -- create_accessorial_adjustment: prices a late accessorial against the version
  -- in force on the carrier-zone date it is recorded.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_accessorial_adjustment';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'create_accessorial_adjustment not found';
  END IF;

  v_old := 'SELECT charge_pay_classes INTO v_policy
    FROM public.pay_policies
   WHERE is_company_default AND is_active
   ORDER BY effective_date DESC NULLS LAST, created_at DESC
   LIMIT 1;';
  v_new := 'SELECT p.charge_pay_classes INTO v_policy
    FROM public.company_pay_policy_on((now() AT TIME ZONE ''America/Chicago'')::date) p;';
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'create_accessorial_adjustment: the company-default lookup is not in the expected shape; refusing to guess';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;
