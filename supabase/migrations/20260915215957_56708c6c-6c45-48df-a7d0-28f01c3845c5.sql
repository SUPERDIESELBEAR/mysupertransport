-- B7 table 2 of 4: dispatch_daily_log (5,890 rows).
-- SHAPE: derive-from-parent (the operator), reusing the existing
-- public.stamp_company_from_operator() already used by dispatch_status_history.
-- Why not the resolver stamp: rollover-dispatch-status runs as service-role with
-- no auth.uid() and does not name a company, so the resolver stamp would 42501
-- every nightly carry-forward.

-- The duplicate unique index: dispatch_daily_log_op_date_uniq and
-- unique_operator_log_date are byte-identical on (operator_id, log_date).
-- unique_operator_log_date is CONSTRAINT-backed, so the plain index is the one
-- dropped; the surviving constraint keeps the one-row-per-driver-per-day rule.
-- Not rescoped per company: operator_id references operators, which is already
-- carrier-scoped, so the key cannot collide across carriers.
DROP INDEX IF EXISTS public.dispatch_daily_log_op_date_uniq;

ALTER TABLE public.dispatch_daily_log ADD COLUMN company_id uuid;

UPDATE public.dispatch_daily_log d
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.id = d.operator_id;

DO $$
DECLARE v_null bigint;
BEGIN
  SELECT count(*) INTO v_null FROM public.dispatch_daily_log WHERE company_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'dispatch_daily_log: % rows could not derive a company; refusing to default them', v_null;
  END IF;
END $$;

ALTER TABLE public.dispatch_daily_log ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.dispatch_daily_log
  ADD CONSTRAINT dispatch_daily_log_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_dispatch_daily_log_company_id ON public.dispatch_daily_log (company_id);

CREATE TRIGGER aa_stamp_company_from_operator
  BEFORE INSERT ON public.dispatch_daily_log
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_operator();
