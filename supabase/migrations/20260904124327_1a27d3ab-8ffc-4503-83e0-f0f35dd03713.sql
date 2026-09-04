-- ---------------------------------------------------------------------
-- MODULE 7, PASS 1 FOLLOW-UP — company_id is STAMPED, not defaulted.
--
-- A column DEFAULT is evaluated as the CALLER. Making current_company_id()
-- the default therefore made the tenancy column a privilege problem: every
-- role that ever inserts a billing row would need its own EXECUTE grant, and
-- a role without one gets "permission denied for function current_company_id"
-- instead of an invoice. Verified live: the migration harness role hit exactly
-- that on the first run.
--
-- A BEFORE INSERT trigger runs as the FUNCTION OWNER, needs no caller grant,
-- and — unlike a default — also overrides a value the caller supplied. Tenancy
-- is not a field a client gets to assert. Same reasoning as
-- stamp_invoice_actors.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_billing_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.company_id := public.current_company_id();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_billing_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_billing_company_id() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_billing_company_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_billing_company_id() TO service_role;

COMMENT ON FUNCTION public.stamp_billing_company_id() IS
  'Stamps the tenant on every Module 7 row. Deliberately OVERWRITES whatever '
  'the caller sent: company_id is not a field a client asserts. Runs as owner, '
  'so no caller needs EXECUTE on current_company_id() to write a billing row.';

-- Sorts before every other BEFORE INSERT trigger on these tables, so the
-- immutability and line guards see the tenant already resolved.
CREATE TRIGGER aa_stamp_billing_company_id BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();
CREATE TRIGGER aa_stamp_billing_company_id BEFORE INSERT ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();
CREATE TRIGGER aa_stamp_billing_company_id BEFORE INSERT ON public.invoice_batches
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();
CREATE TRIGGER aa_stamp_billing_company_id BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();
CREATE TRIGGER aa_stamp_billing_company_id BEFORE INSERT ON public.ar_aging_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.stamp_billing_company_id();

ALTER TABLE public.invoices           ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.invoice_line_items ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.invoice_batches    ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.payments           ALTER COLUMN company_id DROP DEFAULT;
ALTER TABLE public.ar_aging_snapshots ALTER COLUMN company_id DROP DEFAULT;

-- current_company_id() is still needed by `authenticated`: the RLS policies
-- call it, and a policy expression IS evaluated as the caller.
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_company_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;