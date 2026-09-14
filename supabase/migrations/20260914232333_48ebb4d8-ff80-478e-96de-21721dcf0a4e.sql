-- =====================================================================
-- THE THREE FEDERAL BREAKS
-- inspection_documents / inspection_document_versions / eld_sync_alerts /
-- eld_malfunction_notifications get their OWN company_id, explicitly.
-- Nullable -> backfill -> NOT NULL, no surviving default, FK RESTRICT.
-- =====================================================================

-- ---------- 1. columns (nullable first) ----------
ALTER TABLE public.inspection_documents          ADD COLUMN company_id uuid;
ALTER TABLE public.inspection_document_versions  ADD COLUMN company_id uuid;
ALTER TABLE public.eld_sync_alerts               ADD COLUMN company_id uuid;
ALTER TABLE public.eld_malfunction_notifications ADD COLUMN company_id uuid;

-- ---------- 2. backfill, by provenance ----------

-- per_driver documents: the company comes from the DRIVER, not from the carrier
-- table. driver_id is an auth user id (operators.user_id) -- verified live:
-- 768/768 resolve to an operator row.
UPDATE public.inspection_documents d
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.user_id = d.driver_id
   AND d.driver_id IS NOT NULL;

-- company_wide documents (driver_id IS NULL): these are the carrier's own
-- authority/insurance/permit documents. Bare scalar subquery: a second carrier
-- raises 21000 rather than guessing.
UPDATE public.inspection_documents
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE driver_id IS NULL;

-- Refuse to continue if any federal row's carrier could not be derived.
DO $$
DECLARE v_unresolved integer;
BEGIN
  SELECT count(*) INTO v_unresolved
    FROM public.inspection_documents WHERE company_id IS NULL;
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION
      '% inspection_documents rows have no derivable carrier. Refusing to default them to SUPERTRANSPORT.',
      v_unresolved;
  END IF;
END $$;

-- versions inherit from their parent document (document_id is NOT NULL FK).
-- The immutability trigger refuses ANY update, including this one-time tenancy
-- backfill. It is suspended for exactly this statement and restored below.
ALTER TABLE public.inspection_document_versions
  DISABLE TRIGGER trg_inspection_document_versions_immutable;

UPDATE public.inspection_document_versions v
   SET company_id = d.company_id
  FROM public.inspection_documents d
 WHERE d.id = v.document_id;

ALTER TABLE public.inspection_document_versions
  ENABLE TRIGGER trg_inspection_document_versions_immutable;

-- eld_sync_alerts and eld_malfunction_notifications hold ZERO rows live, so
-- these are no-ops that exist to keep the sequence identical for every table.
UPDATE public.eld_sync_alerts a
   SET company_id = o.company_id
  FROM public.operators o
 WHERE o.id = a.operator_id AND a.operator_id IS NOT NULL;

UPDATE public.eld_sync_alerts
   SET company_id = (SELECT id FROM public.carrier_profile)
 WHERE operator_id IS NULL;

UPDATE public.eld_malfunction_notifications n
   SET company_id = COALESCE(
     (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = n.recipient_user_id LIMIT 1),
     (SELECT o.company_id  FROM public.operators o       WHERE o.user_id  = n.recipient_user_id LIMIT 1)
   );

DO $$
DECLARE v_unresolved integer;
BEGIN
  SELECT (SELECT count(*) FROM public.inspection_document_versions WHERE company_id IS NULL)
       + (SELECT count(*) FROM public.eld_sync_alerts WHERE company_id IS NULL)
       + (SELECT count(*) FROM public.eld_malfunction_notifications WHERE company_id IS NULL)
    INTO v_unresolved;
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION '% federal rows have no derivable carrier. Refusing to default them.', v_unresolved;
  END IF;
END $$;

-- ---------- 3. NOT NULL + FK RESTRICT, no default ----------
ALTER TABLE public.inspection_documents
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT inspection_documents_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

ALTER TABLE public.inspection_document_versions
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT inspection_document_versions_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

ALTER TABLE public.eld_sync_alerts
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT eld_sync_alerts_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

ALTER TABLE public.eld_malfunction_notifications
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT eld_malfunction_notifications_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

CREATE INDEX idx_inspection_documents_company          ON public.inspection_documents (company_id);
CREATE INDEX idx_inspection_document_versions_company  ON public.inspection_document_versions (company_id);
CREATE INDEX idx_eld_sync_alerts_company               ON public.eld_sync_alerts (company_id);
CREATE INDEX idx_eld_malfunction_notifications_company ON public.eld_malfunction_notifications (company_id);

-- ---------- 4. stamping ----------

-- inspection_documents. Driver-written (operators insert their own per_driver
-- rows through RLS) AND service-role-written (sync-onboarding-doc-to-binder,
-- file-executed-ica). Shape 3 (derived owner) for per_driver rows -- the
-- document belongs to the DRIVER'S carrier, whoever uploaded it; Shape 1/2
-- (caller membership, service-role may name) for company_wide rows.
CREATE OR REPLACE FUNCTION public.stamp_inspection_document_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_company uuid;
BEGIN
  IF NEW.driver_id IS NOT NULL THEN
    -- Derived owner: the driver named on the federal record.
    SELECT o.company_id INTO v_company
      FROM public.operators o WHERE o.user_id = NEW.driver_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION
        'inspection_documents.driver_id % matches no operator, so the carrier of this federal record cannot be derived. Refusing rather than defaulting to a carrier.',
        NEW.driver_id
        USING ERRCODE = '42501';
    END IF;
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;

  -- company_wide: the carrier's own document.
  v_company := public.current_company_id();
  IF v_company IS NOT NULL THEN
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'Cannot resolve a company for this company-wide inspection document: the caller holds no company_members row and no server-side company was named. Refusing rather than defaulting to a carrier.'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS aa_stamp_inspection_document_company_id ON public.inspection_documents;
CREATE TRIGGER aa_stamp_inspection_document_company_id
  BEFORE INSERT OR UPDATE OF company_id, driver_id ON public.inspection_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_inspection_document_company_id();

-- inspection_document_versions. Shape 3: derived parent. Written by
-- archive_inspection_document_version (definer trigger) and by staff.
CREATE OR REPLACE FUNCTION public.stamp_inspection_document_version_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT d.company_id INTO v_company
    FROM public.inspection_documents d WHERE d.id = NEW.document_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION
      'inspection_document_versions.document_id % resolves to no inspection document, so its carrier cannot be derived. Refusing.',
      NEW.document_id
      USING ERRCODE = '42501';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS aa_stamp_inspection_document_version_company_id ON public.inspection_document_versions;
CREATE TRIGGER aa_stamp_inspection_document_version_company_id
  BEFORE INSERT OR UPDATE OF company_id, document_id ON public.inspection_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_inspection_document_version_company_id();

-- eld_sync_alerts. Written only by raise_eld_sync_alert (definer), which
-- accepts a NULL operator_id: an alert whose condition is real but whose
-- driver is not resolvable. Shape 3 from the operator when present; Shape 1/2
-- from the caller (a signed-in staff member or driver -- the RPC already
-- requires a session) when it is not.
CREATE OR REPLACE FUNCTION public.stamp_eld_sync_alert_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_company uuid;
BEGIN
  IF NEW.operator_id IS NOT NULL THEN
    SELECT o.company_id INTO v_company
      FROM public.operators o WHERE o.id = NEW.operator_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION
        'eld_sync_alerts.operator_id % matches no operator; carrier not derivable. Refusing.',
        NEW.operator_id USING ERRCODE = '42501';
    END IF;
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;

  -- Driver-unattributable alert: the carrier is the one the RAISER belongs to.
  v_company := public.current_company_id();
  IF v_company IS NOT NULL THEN
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'An ELD sync alert with no operator can only be attributed to the carrier of the caller who raised it, and that caller resolves to no company. Refusing rather than defaulting to a carrier.'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS aa_stamp_eld_sync_alert_company_id ON public.eld_sync_alerts;
CREATE TRIGGER aa_stamp_eld_sync_alert_company_id
  BEFORE INSERT OR UPDATE OF company_id, operator_id ON public.eld_sync_alerts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_eld_sync_alert_company_id();

-- eld_malfunction_notifications. event_id is nullable AND
-- eld_malfunction_events carries no company_id, so the parent cannot supply
-- the carrier at all. recipient_user_id is NOT NULL, and the owner's
-- ONE PERSON, ONE CARRIER decision makes the recipient an authoritative
-- source: company_members for staff, operators for drivers. System-written by
-- process-eld-escalations under service role, which may also name the company.
CREATE OR REPLACE FUNCTION public.stamp_eld_malfunction_notification_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_company uuid;
BEGIN
  SELECT COALESCE(
    (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = NEW.recipient_user_id LIMIT 1),
    (SELECT o.company_id  FROM public.operators o       WHERE o.user_id  = NEW.recipient_user_id LIMIT 1)
  ) INTO v_company;

  IF v_company IS NOT NULL THEN
    NEW.company_id := v_company;
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' AND NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION
    'The recipient % of this ELD malfunction notification belongs to no carrier (no company_members row, no operator row), and eld_malfunction_events carries no company of its own. Refusing rather than defaulting to a carrier.',
    NEW.recipient_user_id
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS aa_stamp_eld_malfunction_notification_company_id ON public.eld_malfunction_notifications;
CREATE TRIGGER aa_stamp_eld_malfunction_notification_company_id
  BEFORE INSERT OR UPDATE OF company_id, recipient_user_id ON public.eld_malfunction_notifications
  FOR EACH ROW EXECUTE FUNCTION public.stamp_eld_malfunction_notification_company_id();

COMMENT ON COLUMN public.inspection_documents.company_id IS
  'Carrier that owns this federal inspection record. Derived from the driver for per_driver rows, from the caller carrier for company_wide rows. Never defaulted.';
COMMENT ON COLUMN public.eld_malfunction_notifications.company_id IS
  'Carrier that owns this ELD notification. Derived from recipient_user_id because eld_malfunction_events carries no company and event_id is nullable.';
