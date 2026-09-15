-- 1. Resolver third source: membership -> own operator row -> truck_owners row.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  -- Tenancy is resolved server-side only: no client input, no JWT claim, no
  -- carrier fallback. MEMBERSHIP FIRST (staff), then the caller's OWN operator
  -- row (drivers, who deliberately hold no company_members row because
  -- membership implies staff capability in the billing policies), then his
  -- TRUCK OWNER row -- read DIRECTLY, never walked to the operators he owns, so
  -- an owner between hires with no drivers still resolves.
  -- An unresolvable caller still gets NULL, which the NOT NULL company_id
  -- columns and the billing RLS predicates both refuse.
  SELECT COALESCE(
    (SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid() LIMIT 1),
    (SELECT o.company_id FROM public.operators o
      WHERE o.user_id = auth.uid() LIMIT 1),
    (SELECT t.company_id FROM public.truck_owners t
      WHERE t.user_id = auth.uid() LIMIT 1)
  )
$function$;

-- 2. operator_documents: nullable -> backfill from parent operator -> NOT NULL.
ALTER TABLE public.operator_documents ADD COLUMN company_id uuid;

UPDATE public.operator_documents d
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.id = d.operator_id;

DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad FROM public.operator_documents WHERE company_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'operator_documents backfill left % unresolved rows', v_bad;
  END IF;
END $$;

ALTER TABLE public.operator_documents ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.operator_documents
  ADD CONSTRAINT operator_documents_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX operator_documents_company_id_idx ON public.operator_documents(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.operator_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();

-- 3. document_acknowledgments: person-owned. Backfill in the SAME order as the
--    resolver -- membership, own operator row, truck_owners row.
ALTER TABLE public.document_acknowledgments ADD COLUMN company_id uuid;

UPDATE public.document_acknowledgments a
   SET company_id = COALESCE(
     (SELECT m.company_id FROM public.company_members m WHERE m.user_id = a.user_id LIMIT 1),
     (SELECT o.company_id FROM public.operators o WHERE o.user_id = a.user_id AND o.company_id IS NOT NULL LIMIT 1),
     (SELECT t.company_id FROM public.truck_owners t WHERE t.user_id = a.user_id AND t.company_id IS NOT NULL LIMIT 1)
   );

DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad FROM public.document_acknowledgments WHERE company_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'document_acknowledgments backfill left % unresolved rows', v_bad;
  END IF;
END $$;

ALTER TABLE public.document_acknowledgments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.document_acknowledgments
  ADD CONSTRAINT document_acknowledgments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
CREATE INDEX document_acknowledgments_company_id_idx ON public.document_acknowledgments(company_id);
CREATE TRIGGER aa_stamp_tenant_company_id
  BEFORE INSERT ON public.document_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_company_id();