-- 1. ICA contracts: allowlist enforcement for operator / truck-owner signers
CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_column_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_truck_owner boolean := false;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_generated text[];
  v_allowed text[] := ARRAY[
    'contractor_typed_name',
    'contractor_signature_url',
    'contractor_signed_at',
    'deposit_elected',
    'deposit_initials',
    'deposit_elected_date',
    'updated_at'
  ];
BEGIN
  IF v_uid IS NULL OR public.is_staff(v_uid) THEN
    RETURN NEW;
  END IF;

  v_is_truck_owner := public.is_truck_owner_for_operator(v_uid, OLD.operator_id);
  IF v_is_truck_owner THEN
    v_allowed := v_allowed || ARRAY[
      'owner_address', 'owner_city', 'owner_state',
      'owner_zip', 'owner_phone', 'owner_email'
    ];
  END IF;

  SELECT COALESCE(array_agg(attname), '{}') INTO v_generated
    FROM pg_attribute WHERE attrelid = TG_RELID AND attgenerated <> '';

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
      IF v_key = ANY(v_allowed) OR v_key = ANY(v_generated) THEN
        CONTINUE;
      END IF;

      IF v_key = 'status' AND NEW.status::text IN ('fully_executed', 'complete') THEN
        CONTINUE;
      END IF;

      RAISE EXCEPTION 'Signers may only update signature, deposit%s fields on ICA contracts (blocked column: %)',
        CASE WHEN v_is_truck_owner THEN ' and owner contact' ELSE '' END, v_key;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- keep the second (legacy) trigger function aligned with the same allowlist
CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.enforce_ica_contracts_operator_column_whitelist();
END;
$function$;

-- 2. Onboard assignment sheets: allowlist enforcement for driver signing
CREATE OR REPLACE FUNCTION public.enforce_osas_operator_sign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_generated text[];
  v_allowed text[] := ARRAY[
    'driver_signature_data_url',
    'driver_signature_name',
    'driver_ip',
    'signed_at',
    'updated_at'
  ];
BEGIN
  IF v_uid IS NULL OR public.is_staff(v_uid) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(attname), '{}') INTO v_generated
    FROM pg_attribute WHERE attrelid = TG_RELID AND attgenerated <> '';

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_new->v_key IS DISTINCT FROM v_old->v_key THEN
      IF v_key = ANY(v_allowed) OR v_key = ANY(v_generated) THEN
        CONTINUE;
      END IF;

      IF v_key = 'status' AND NEW.status::text = 'signed' THEN
        CONTINUE;
      END IF;

      RAISE EXCEPTION 'Operators may only submit their signature on assignment sheets (blocked column: %)', v_key;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_osas_operator_sign() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_osas_operator_sign() FROM anon;

DROP TRIGGER IF EXISTS trg_enforce_osas_operator_sign ON public.onboard_assignment_sheets;
CREATE TRIGGER trg_enforce_osas_operator_sign
  BEFORE UPDATE ON public.onboard_assignment_sheets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_osas_operator_sign();

-- 3. staff_messaging_settings: restrict reads to staff and the owning staff member
DROP POLICY IF EXISTS sms_read_all_auth ON public.staff_messaging_settings;
CREATE POLICY sms_read_staff_or_self ON public.staff_messaging_settings
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR staff_id = auth.uid());