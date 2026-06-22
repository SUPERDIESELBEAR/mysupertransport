
-- ── 1. Backfill per-driver inspection_documents from applications ────────
INSERT INTO public.inspection_documents (name, scope, driver_id, expires_at, uploaded_at, updated_at)
SELECT 'CDL (Front)', 'per_driver', o.user_id, a.cdl_expiration, now(), now()
FROM public.operators o
JOIN public.applications a ON a.id = o.application_id
WHERE o.is_active = true
  AND o.user_id IS NOT NULL
  AND a.cdl_expiration IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inspection_documents d
    WHERE d.scope = 'per_driver' AND d.driver_id = o.user_id AND d.name = 'CDL (Front)'
  );

INSERT INTO public.inspection_documents (name, scope, driver_id, expires_at, uploaded_at, updated_at)
SELECT 'Medical Certificate', 'per_driver', o.user_id, a.medical_cert_expiration, now(), now()
FROM public.operators o
JOIN public.applications a ON a.id = o.application_id
WHERE o.is_active = true
  AND o.user_id IS NOT NULL
  AND a.medical_cert_expiration IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inspection_documents d
    WHERE d.scope = 'per_driver' AND d.driver_id = o.user_id AND d.name = 'Medical Certificate'
  );

-- ── 2. Sync trigger: applications expiry edits → inspection_documents ────
CREATE OR REPLACE FUNCTION public.sync_application_expiry_to_binder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.operators WHERE application_id = NEW.id LIMIT 1;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.cdl_expiration IS DISTINCT FROM OLD.cdl_expiration AND NEW.cdl_expiration IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.inspection_documents WHERE scope='per_driver' AND driver_id=v_user_id AND name='CDL (Front)') THEN
      UPDATE public.inspection_documents
      SET expires_at = NEW.cdl_expiration, updated_at = now()
      WHERE scope='per_driver' AND driver_id=v_user_id AND name='CDL (Front)';
    ELSE
      INSERT INTO public.inspection_documents (name, scope, driver_id, expires_at, uploaded_at, updated_at)
      VALUES ('CDL (Front)', 'per_driver', v_user_id, NEW.cdl_expiration, now(), now());
    END IF;
  END IF;

  IF NEW.medical_cert_expiration IS DISTINCT FROM OLD.medical_cert_expiration AND NEW.medical_cert_expiration IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.inspection_documents WHERE scope='per_driver' AND driver_id=v_user_id AND name='Medical Certificate') THEN
      UPDATE public.inspection_documents
      SET expires_at = NEW.medical_cert_expiration, updated_at = now()
      WHERE scope='per_driver' AND driver_id=v_user_id AND name='Medical Certificate';
    ELSE
      INSERT INTO public.inspection_documents (name, scope, driver_id, expires_at, uploaded_at, updated_at)
      VALUES ('Medical Certificate', 'per_driver', v_user_id, NEW.medical_cert_expiration, now(), now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_application_expiry_to_binder ON public.applications;
CREATE TRIGGER trg_sync_application_expiry_to_binder
AFTER UPDATE OF cdl_expiration, medical_cert_expiration ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.sync_application_expiry_to_binder();

-- ── 3. compliance_status() function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compliance_status(days int, window_days int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN days IS NULL THEN 'missing'
    WHEN days < 0 THEN 'expired'
    WHEN days <= 30 THEN 'critical'
    WHEN days <= window_days THEN 'warning'
    ELSE 'valid'
  END;
$$;

-- ── 4. v_compliance_items view ───────────────────────────────────────────
-- A row per (entity, doc). Fleet rows for Insurance & IFTA are always emitted
-- even if no inspection_documents row exists. Per-driver CDL & Med Cert rows
-- come from inspection_documents (post-backfill).
CREATE OR REPLACE VIEW public.v_compliance_items
WITH (security_invoker = on)
AS
WITH today AS (
  SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d
),
fleet AS (
  SELECT 'fleet'::text AS entity_kind,
         NULL::uuid    AS operator_id,
         'Fleet (all drivers)'::text AS operator_name,
         doc.doc_key,
         d.id AS inspection_doc_id,
         d.expires_at,
         CASE WHEN d.expires_at IS NULL THEN NULL
              ELSE (d.expires_at - (SELECT d FROM today)) END AS days_until
  FROM (VALUES ('Insurance','Insurance'), ('IFTA License','IFTA License')) AS doc(doc_key, name)
  LEFT JOIN public.inspection_documents d
    ON d.scope = 'company_wide' AND d.name = doc.name
),
drivers AS (
  SELECT 'driver'::text AS entity_kind,
         o.id AS operator_id,
         COALESCE(NULLIF(TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,'')), ''), 'Unknown') AS operator_name,
         doc.doc_key,
         d.id AS inspection_doc_id,
         d.expires_at,
         CASE WHEN d.expires_at IS NULL THEN NULL
              ELSE (d.expires_at - (SELECT d FROM today)) END AS days_until
  FROM public.operators o
  JOIN public.applications a ON a.id = o.application_id
  CROSS JOIN (VALUES ('CDL', 'CDL (Front)'), ('Medical Certificate', 'Medical Certificate')) AS doc(doc_key, name)
  LEFT JOIN public.inspection_documents d
    ON d.scope = 'per_driver' AND d.driver_id = o.user_id AND d.name = doc.name
  WHERE o.is_active = true
    AND o.application_id IS NOT NULL
)
SELECT * FROM fleet
UNION ALL
SELECT * FROM drivers;

GRANT SELECT ON public.v_compliance_items TO authenticated;

-- ── 5. Audit trigger on inspection_documents.expires_at ──────────────────
CREATE OR REPLACE FUNCTION public.log_inspection_expiry_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_name text;
  v_label text;
  v_doc_key text;
  v_driver_name text;
BEGIN
  IF NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN
    RETURN NEW;
  END IF;

  v_actor_id := auth.uid();
  SELECT TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))
    INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  IF v_actor_name IS NULL OR v_actor_name = '' THEN v_actor_name := 'A staff member'; END IF;

  v_doc_key := CASE NEW.name
    WHEN 'CDL (Front)' THEN 'CDL'
    WHEN 'Medical Certificate' THEN 'Medical Certificate'
    WHEN 'Insurance' THEN 'Insurance'
    WHEN 'IFTA License' THEN 'IFTA License'
    ELSE NEW.name
  END;

  IF NEW.scope = 'per_driver' AND NEW.driver_id IS NOT NULL THEN
    SELECT TRIM(COALESCE(a.first_name,'') || ' ' || COALESCE(a.last_name,''))
      INTO v_driver_name
      FROM public.operators o
      JOIN public.applications a ON a.id = o.application_id
      WHERE o.user_id = NEW.driver_id
      LIMIT 1;
    v_label := COALESCE(NULLIF(v_driver_name,''),'Driver') || ' — ' || v_doc_key;
  ELSE
    v_label := 'Fleet ' || v_doc_key;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, entity_type, entity_id, entity_label, action, metadata)
  VALUES (
    v_actor_id, v_actor_name, 'compliance', NEW.id, v_label, 'expiry_updated',
    jsonb_build_object(
      'document_type', v_doc_key,
      'old_expiry', OLD.expires_at,
      'new_expiry', NEW.expires_at,
      'scope', NEW.scope,
      'source', 'trigger'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_inspection_expiry_change ON public.inspection_documents;
CREATE TRIGGER trg_log_inspection_expiry_change
AFTER UPDATE OF expires_at ON public.inspection_documents
FOR EACH ROW
EXECUTE FUNCTION public.log_inspection_expiry_change();
