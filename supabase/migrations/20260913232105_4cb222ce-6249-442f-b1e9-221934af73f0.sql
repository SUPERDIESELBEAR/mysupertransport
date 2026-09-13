-- Tenancy step 2, batch B2 part one: company_id on operators, brokers, facilities.
-- Order per the 2026-09-13 batching plan: nullable column, backfill, NOT NULL.
-- No column default at any point.

-- 1. Nullable columns, FK shape copied from the Module 7 billing tables.
ALTER TABLE public.operators
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.brokers
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.facilities
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

-- 2. Backfill from the company row directly. A bare scalar subquery raises
--    21000 if carrier_profile ever holds more than one row, which is the
--    fail-closed behaviour we want rather than an arbitrary pick.
--    brokers is backfilled from the company row and NOT from broker_documents:
--    brokers.primary_document_id -> broker_documents -> brokers is the one FK
--    cycle in the schema, and broker_documents has no company_id yet.
--
--    All user triggers on the three tables are disabled for the duration of the
--    backfill so the UPDATE touches exactly one column. Without this the
--    update_*_updated_at triggers would rewrite updated_at on all 168 rows —
--    an unrelated change the plan's own verification forbids. None of the
--    disabled triggers is an immutability or federal-record lock.
ALTER TABLE public.operators DISABLE TRIGGER USER;
ALTER TABLE public.brokers DISABLE TRIGGER USER;
ALTER TABLE public.facilities DISABLE TRIGGER USER;

UPDATE public.operators  SET company_id = (SELECT id FROM public.carrier_profile) WHERE company_id IS NULL;
UPDATE public.brokers    SET company_id = (SELECT id FROM public.carrier_profile) WHERE company_id IS NULL;
UPDATE public.facilities SET company_id = (SELECT id FROM public.carrier_profile) WHERE company_id IS NULL;

ALTER TABLE public.operators ENABLE TRIGGER USER;
ALTER TABLE public.brokers ENABLE TRIGGER USER;
ALTER TABLE public.facilities ENABLE TRIGGER USER;

-- 3. NOT NULL, no default.
ALTER TABLE public.operators  ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.brokers    ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.facilities ALTER COLUMN company_id SET NOT NULL;

-- 4. Server-side stamp.
--    stamp_billing_company_id() assigns current_company_id() unconditionally.
--    That is correct for the eight billing tables, which have no service-role
--    insert path. operators does: invite-operator, provision-demo-driver,
--    provision-test-driver and create-test-operator all insert with the
--    service-role key, where auth.uid() is absent, current_company_id()
--    resolves NULL, and an unconditional stamp would make every driver
--    invitation fail the NOT NULL constraint.
--
--    So: a resolvable caller's membership ALWAYS wins and always overwrites
--    whatever arrived (a client can never choose its company). Only a
--    service_role caller — a server context, never a browser — may name the
--    company explicitly, and only when membership cannot be resolved.
--    Anything else is refused. No fallback to "the first carrier row".
CREATE OR REPLACE FUNCTION public.stamp_tenant_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_company uuid := public.current_company_id();
BEGIN
  IF v_company IS NOT NULL THEN
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Cannot resolve a company for this %.% row: the caller holds no company_members row and no server-side company was named. Refusing rather than defaulting to a carrier.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501',
          HINT = 'Staff must have a company_members row; service-role callers must pass company_id explicitly.';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stamp_tenant_company_id() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();
CREATE TRIGGER aa_stamp_tenant_company_id BEFORE INSERT ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- 5. The one index decision in this batch.
--    PER-COMPANY, stated deliberately per the standing rule: each carrier keeps
--    its own facility list, and two carriers may legitimately both haul out of
--    a facility with the same name in the same city.
--    Shape follows invoice_number_config_company_id_year_key: company_id leads.
DROP INDEX IF EXISTS public.uq_facilities_name_city_state_active;
CREATE UNIQUE INDEX uq_facilities_company_name_city_state_active
  ON public.facilities (
    company_id,
    lower(facility_name),
    lower(COALESCE(city, ''::text)),
    COALESCE(state, ''::text)
  )
  WHERE is_active;

-- operators_user_id_key stays GLOBAL, stated deliberately: one auth user is one
-- operator record, and a person leased to two carriers would need a second auth
-- identity. Revisit only if that becomes a real requirement.
-- brokers has no unique index other than its primary key. Nothing to scope.

CREATE INDEX IF NOT EXISTS idx_operators_company_id ON public.operators (company_id);
CREATE INDEX IF NOT EXISTS idx_brokers_company_id ON public.brokers (company_id);
CREATE INDEX IF NOT EXISTS idx_facilities_company_id ON public.facilities (company_id);