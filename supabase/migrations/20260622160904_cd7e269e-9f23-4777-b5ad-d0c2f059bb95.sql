-- ── 1. Extend cert_reminders for cron + dedupe ────────────────────────────
ALTER TABLE public.cert_reminders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS threshold text;

-- Partial unique index: only enforced for cron-sent rows.
-- (operator_id, doc_type, threshold, day) so 45d / 14d / 3d / 0d / -1d
-- each get exactly one send per driver per day from the cron job.
CREATE UNIQUE INDEX IF NOT EXISTS cert_reminders_cron_dedupe_idx
  ON public.cert_reminders (operator_id, doc_type, threshold, ((sent_at AT TIME ZONE 'America/Chicago')::date))
  WHERE source = 'cron';

-- ── 2. Rebuild v_compliance_items with IRP per-driver + stale-data fields ──
DROP VIEW IF EXISTS public.v_compliance_items;

CREATE VIEW public.v_compliance_items
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
         d.file_path,
         d.uploaded_at,
         d.updated_at AS expires_updated_at,
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
         d.file_path,
         d.uploaded_at,
         d.updated_at AS expires_updated_at,
         CASE WHEN d.expires_at IS NULL THEN NULL
              ELSE (d.expires_at - (SELECT d FROM today)) END AS days_until
  FROM public.operators o
  JOIN public.applications a ON a.id = o.application_id
  CROSS JOIN (VALUES
    ('CDL', 'CDL (Front)'),
    ('Medical Certificate', 'Medical Certificate'),
    ('IRP Registration (cab card)', 'IRP Registration (cab card)')
  ) AS doc(doc_key, name)
  LEFT JOIN public.inspection_documents d
    ON d.scope = 'per_driver' AND d.driver_id = o.user_id AND d.name = doc.name
  WHERE o.is_active = true
    AND o.application_id IS NOT NULL
)
SELECT * FROM fleet
UNION ALL
SELECT * FROM drivers;

GRANT SELECT ON public.v_compliance_items TO authenticated;