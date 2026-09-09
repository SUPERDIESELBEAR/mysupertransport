DROP FUNCTION IF EXISTS public.my_fuel_transactions();

CREATE FUNCTION public.my_fuel_transactions()
RETURNS TABLE (
  id uuid,
  invoice_no text,
  invoice_date date,
  merchant_name text,
  city text,
  state text,
  total_amount numeric,
  fuel_discount_amount numeric,
  diesel_amount numeric,
  diesel_gallons numeric,
  lines jsonb,
  settlement_id uuid,
  period_start date,
  period_end date,
  payday date,
  settlement_status text,
  work_week_start_dow integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
    COALESCE((SELECT ss.work_week_start_dow FROM public.settlement_settings ss LIMIT 1), 3)
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
$$;

COMMENT ON FUNCTION public.my_fuel_transactions() IS
  'The driver''s OWN fuel, and nothing else. Takes no argument on purpose: the operator is resolved server-side from auth.uid() via operators.user_id, the same self-scoping the operator settlement surfaces use, so there is no parameter a client could change to reach another driver. Carries the configured work_week_start_dow so the driver''s weeks are the office''s weeks — operators cannot read settlement_settings, and a defaulted dow would be a way for the two screens to diverge. Staff-only record-quality fields (match_status, reconciliation_ok/delta, disagreement_fields) are deliberately not returned; they are facts about OUR records, not about his purchases, and no money figure depends on them.';

REVOKE ALL ON FUNCTION public.my_fuel_transactions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_fuel_transactions() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_fuel_transactions() TO authenticated;