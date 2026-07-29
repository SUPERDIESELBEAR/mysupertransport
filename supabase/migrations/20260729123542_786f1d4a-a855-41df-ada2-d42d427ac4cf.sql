CREATE OR REPLACE VIEW public.v_compliance_items AS
 WITH today AS (
         SELECT (now() AT TIME ZONE 'America/Chicago'::text)::date AS d
        ), fleet AS (
         SELECT 'fleet'::text AS entity_kind,
            NULL::uuid AS operator_id,
            'Fleet (all drivers)'::text AS operator_name,
            doc.doc_key,
            d.id AS inspection_doc_id,
            d.expires_at,
            d.file_path,
            d.uploaded_at,
            d.updated_at AS expires_updated_at,
                CASE
                    WHEN d.expires_at IS NULL THEN NULL::integer
                    ELSE d.expires_at - (( SELECT today.d FROM today))
                END AS days_until
           FROM ( VALUES ('Insurance'::text,'Insurance'::text), ('IFTA License'::text,'IFTA License'::text)) doc(doc_key, name)
             LEFT JOIN inspection_documents d ON d.scope = 'company_wide'::inspection_doc_scope AND d.name = doc.name
        ), drivers AS (
         SELECT 'driver'::text AS entity_kind,
            o.id AS operator_id,
            COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(a.first_name, ''::text) || ' '::text) || COALESCE(a.last_name, ''::text)), ''::text), 'Unknown'::text) AS operator_name,
            doc.doc_key,
            d.id AS inspection_doc_id,
            d.expires_at,
            d.file_path,
            d.uploaded_at,
            d.updated_at AS expires_updated_at,
                CASE
                    WHEN d.expires_at IS NULL THEN NULL::integer
                    ELSE d.expires_at - (( SELECT today.d FROM today))
                END AS days_until
           FROM operators o
             JOIN applications a ON a.id = o.application_id
             JOIN onboarding_status os ON os.operator_id = o.id
             CROSS JOIN ( VALUES ('CDL'::text,'CDL (Front)'::text), ('Medical Certificate'::text,'Medical Certificate'::text), ('IRP Registration (cab card)'::text,'IRP Registration (cab card)'::text), ('Form 2290'::text,'Form 2290'::text)) doc(doc_key, name)
             LEFT JOIN inspection_documents d ON d.scope = 'per_driver'::inspection_doc_scope AND d.driver_id = o.user_id AND d.name = doc.name
          WHERE o.is_active = true AND o.is_demo = false AND o.application_id IS NOT NULL AND os.insurance_added_date IS NOT NULL AND os.go_live_date IS NOT NULL
        )
 SELECT fleet.entity_kind, fleet.operator_id, fleet.operator_name, fleet.doc_key, fleet.inspection_doc_id, fleet.expires_at, fleet.file_path, fleet.uploaded_at, fleet.expires_updated_at, fleet.days_until
   FROM fleet
UNION ALL
 SELECT drivers.entity_kind, drivers.operator_id, drivers.operator_name, drivers.doc_key, drivers.inspection_doc_id, drivers.expires_at, drivers.file_path, drivers.uploaded_at, drivers.expires_updated_at, drivers.days_until
   FROM drivers;

CREATE OR REPLACE FUNCTION public.sync_mo_plate_expiry_to_irp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_driver_user_id uuid;
BEGIN
  IF NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN RETURN NEW; END IF;
  IF NEW.expires_at IS NULL THEN RETURN NEW; END IF;

  SELECT operator_id INTO v_operator_id
  FROM public.mo_plate_assignments
  WHERE plate_id = NEW.id
    AND event_type = 'assignment'
    AND returned_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO v_driver_user_id FROM public.operators WHERE id = v_operator_id LIMIT 1;
  IF v_driver_user_id IS NULL THEN RETURN NEW; END IF;

  -- Only push the plate expiry onto the cab card when it is NEWER than what the
  -- document already has (or the document has none). Prevents a stale plate date
  -- from overwriting a freshly uploaded registration.
  UPDATE public.inspection_documents
  SET expires_at = NEW.expires_at
  WHERE scope = 'per_driver'
    AND name = 'IRP Registration (cab card)'
    AND driver_id = v_driver_user_id
    AND (expires_at IS NULL OR NEW.expires_at > expires_at);

  RETURN NEW;
END;
$$;