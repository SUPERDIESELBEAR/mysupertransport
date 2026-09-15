-- Parent-derived tenancy stamping for the three history tables.
--
-- These tables are written almost entirely by SECURITY DEFINER functions and
-- triggers, some of which run for a SERVICE-ROLE caller (the daily dispatch
-- rollover). In that context auth.uid() is NULL, so current_company_id()
-- resolves to NULL and the generic stamp trigger correctly refuses with 42501.
-- The parent row (the load, or the driver's operators row) is already
-- carrier-scoped and is the authoritative source, so derive from it instead:
-- strictly stronger than caller-derived stamping, and it cannot be spoofed.

CREATE OR REPLACE FUNCTION public.stamp_company_from_load()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT l.company_id INTO v_company FROM public.loads l WHERE l.id = NEW.load_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for load %: refusing to write % without tenancy',
      NEW.load_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_company_from_load() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stamp_company_from_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT o.company_id INTO v_company FROM public.operators o WHERE o.id = NEW.operator_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for operator %: refusing to write % without tenancy',
      NEW.operator_id, TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_company_from_operator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aa_stamp_tenant_company_id ON public.load_status_history;
CREATE TRIGGER aa_stamp_company_from_load
  BEFORE INSERT ON public.load_status_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_load();

DROP TRIGGER IF EXISTS aa_stamp_tenant_company_id ON public.load_change_history;
CREATE TRIGGER aa_stamp_company_from_load
  BEFORE INSERT ON public.load_change_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_load();

DROP TRIGGER IF EXISTS aa_stamp_tenant_company_id ON public.dispatch_status_history;
CREATE TRIGGER aa_stamp_company_from_operator
  BEFORE INSERT ON public.dispatch_status_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_company_from_operator();