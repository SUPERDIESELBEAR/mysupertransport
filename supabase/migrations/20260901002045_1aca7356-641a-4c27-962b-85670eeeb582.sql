CREATE TABLE IF NOT EXISTS public.settlement_withheld_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  load_id uuid REFERENCES public.loads(id) ON DELETE SET NULL,
  load_number text NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('paperwork','claim_hold','scale_ticket')),
  message text NOT NULL,
  outstanding text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_settlement_withheld_loads_settlement
  ON public.settlement_withheld_loads(settlement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_withheld_loads TO authenticated;
GRANT ALL ON public.settlement_withheld_loads TO service_role;
ALTER TABLE public.settlement_withheld_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management manages settlement withheld loads"
ON public.settlement_withheld_loads FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Operators read their own settlements"
ON public.settlements FOR SELECT TO authenticated
USING (
  operator_id IN (SELECT o.id FROM public.operators o WHERE o.user_id = auth.uid())
);

CREATE POLICY "Operators read their own settlement line items"
ON public.settlement_line_items FOR SELECT TO authenticated
USING (
  settlement_id IN (
    SELECT s.id FROM public.settlements s
    JOIN public.operators o ON o.id = s.operator_id
    WHERE o.user_id = auth.uid()
  )
);

CREATE POLICY "Operators read their own withheld loads"
ON public.settlement_withheld_loads FOR SELECT TO authenticated
USING (
  settlement_id IN (
    SELECT s.id FROM public.settlements s
    JOIN public.operators o ON o.id = s.operator_id
    WHERE o.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.my_rm_deposit()
RETURNS TABLE (current_balance numeric, target_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
  SELECT d.current_balance,
         COALESCE(d.target_amount, (SELECT s.rm_deposit_target FROM public.settlement_settings s LIMIT 1))
    FROM public.rm_deposits d
    JOIN public.operators o ON o.id = d.operator_id
   WHERE o.user_id = auth.uid()
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.my_rm_deposit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_rm_deposit() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_rm_deposit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_rm_deposit() TO service_role;