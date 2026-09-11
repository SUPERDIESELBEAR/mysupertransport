DROP FUNCTION IF EXISTS public.my_fuel_transactions();

CREATE FUNCTION public.my_fuel_transactions()
RETURNS TABLE(
  id uuid, invoice_no text, invoice_date date, merchant_name text, city text, state text,
  total_amount numeric, fuel_discount_amount numeric, diesel_amount numeric, diesel_gallons numeric,
  lines jsonb, settlement_id uuid, period_start date, period_end date, payday date,
  settlement_status text, work_week_start_dow integer, discount_passthrough boolean
)
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
    COALESCE((SELECT ss.work_week_start_dow FROM public.settlement_settings ss LIMIT 1), 3),
    -- THE SAME RESOLUTION ORDER THE SETTLEMENT ENGINE USES: the per-driver
    -- setting first, the company default policy as the fallback, off if
    -- neither says otherwise. The driver cannot read pay_policies, so this is
    -- the only way his screen can know whether a discount is his to see.
    COALESCE(
      o.fuel_discount_passthrough_override,
      (SELECT pp.fuel_discount_passthrough FROM public.pay_policies pp
        WHERE pp.is_company_default LIMIT 1),
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

REVOKE ALL ON FUNCTION public.my_fuel_transactions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_fuel_transactions() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_fuel_transactions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_fuel_transactions() TO service_role;