CREATE OR REPLACE VIEW public.v_compliance_items AS
WITH today AS (
  SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d
),
fleet AS (
  SELECT 'fleet'::text AS entity_kind,
         NULL::uuid AS operator_id,
         'Fleet (all drivers)'::text AS operator_name,
         doc.doc_key,
         d.id AS inspection_doc_id,
         d.expires_at,
         d.file_path,
         d.uploaded_at,
         d.updated_at AS expires_updated_at,
         CASE WHEN d.expires_at IS NULL THEN NULL::integer
              ELSE d.expires_at - (SELECT today.d FROM today) END AS days_until
    FROM (VALUES ('Insurance'::text,'Insurance'::text),
                 ('IFTA License'::text,'IFTA License'::text)) doc(doc_key, name)
    LEFT JOIN inspection_documents d
      ON d.scope = 'company_wide'::inspection_doc_scope AND d.name = doc.name
),
drivers AS (
  SELECT 'driver'::text AS entity_kind,
         o.id AS operator_id,
         COALESCE(NULLIF(TRIM(BOTH FROM (COALESCE(a.first_name,'') || ' ') || COALESCE(a.last_name,'')), ''), 'Unknown') AS operator_name,
         doc.doc_key,
         d.id AS inspection_doc_id,
         d.expires_at,
         d.file_path,
         d.uploaded_at,
         d.updated_at AS expires_updated_at,
         CASE WHEN d.expires_at IS NULL THEN NULL::integer
              ELSE d.expires_at - (SELECT today.d FROM today) END AS days_until
    FROM operators o
    JOIN applications a ON a.id = o.application_id
    JOIN onboarding_status os ON os.operator_id = o.id
    CROSS JOIN (VALUES ('CDL'::text,'CDL (Front)'::text),
                       ('Medical Certificate'::text,'Medical Certificate'::text),
                       ('IRP Registration (cab card)'::text,'IRP Registration (cab card)'::text)) doc(doc_key, name)
    LEFT JOIN inspection_documents d
      ON d.scope = 'per_driver'::inspection_doc_scope
     AND d.driver_id = o.user_id
     AND d.name = doc.name
   WHERE o.is_active = true
     AND o.application_id IS NOT NULL
     AND os.insurance_added_date IS NOT NULL
     AND os.go_live_date IS NOT NULL
)
SELECT * FROM fleet
UNION ALL
SELECT * FROM drivers;