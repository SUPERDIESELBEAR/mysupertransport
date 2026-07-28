
ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_label text,
  ADD COLUMN IF NOT EXISTS demo_scenario text,
  ADD COLUMN IF NOT EXISTS demo_owner_user_id uuid;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_operators_is_demo ON public.operators (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_profiles_is_demo ON public.profiles (is_demo) WHERE is_demo;

-- Guard: only management/owner may flip the demo flag on operators
CREATE OR REPLACE FUNCTION public.enforce_demo_flag_management_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    IF auth.uid() IS NOT NULL
       AND NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
      RAISE EXCEPTION 'Only management may change demo status';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.is_demo THEN
    IF auth.uid() IS NOT NULL
       AND NOT (public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')) THEN
      RAISE EXCEPTION 'Only management may create demo accounts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operators_demo_flag ON public.operators;
CREATE TRIGGER trg_operators_demo_flag
BEFORE INSERT OR UPDATE ON public.operators
FOR EACH ROW EXECUTE FUNCTION public.enforce_demo_flag_management_only();

DROP TRIGGER IF EXISTS trg_profiles_demo_flag ON public.profiles;
CREATE TRIGGER trg_profiles_demo_flag
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_demo_flag_management_only();

-- Compliance summary excludes demo drivers
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
             CROSS JOIN ( VALUES ('CDL'::text,'CDL (Front)'::text), ('Medical Certificate'::text,'Medical Certificate'::text), ('IRP Registration (cab card)'::text,'IRP Registration (cab card)'::text), ('Registration'::text,'Registration'::text), ('Form 2290'::text,'Form 2290'::text)) doc(doc_key, name)
             LEFT JOIN inspection_documents d ON d.scope = 'per_driver'::inspection_doc_scope AND d.driver_id = o.user_id AND d.name = doc.name
          WHERE o.is_active = true AND o.is_demo = false AND o.application_id IS NOT NULL AND os.insurance_added_date IS NOT NULL AND os.go_live_date IS NOT NULL
        )
 SELECT * FROM fleet
UNION ALL
 SELECT * FROM drivers;
