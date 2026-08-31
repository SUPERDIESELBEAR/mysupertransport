CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_column_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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

CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN public.enforce_ica_contracts_operator_column_whitelist();
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_osas_operator_sign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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

CREATE OR REPLACE FUNCTION public.sync_dot_binder_to_vh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_operator_id uuid;
  v_latest_id uuid;
BEGIN
  IF NEW.name <> 'Periodic DOT Inspections' OR NEW.scope <> 'per_driver' THEN
    RETURN NEW;
  END IF;
  IF NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN RETURN NEW; END IF;
  IF NEW.expires_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  IF current_setting('app.skip_doc_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_operator_id
  FROM public.operators
  WHERE user_id = NEW.driver_id
  LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('app.skip_dot_sync', 'on', true);

  SELECT id INTO v_latest_id
  FROM public.truck_dot_inspections
  WHERE operator_id = v_operator_id
  ORDER BY inspection_date DESC, created_at DESC
  LIMIT 1;

  IF v_latest_id IS NOT NULL THEN
    UPDATE public.truck_dot_inspections
    SET inspection_date = NEW.expires_at
    WHERE id = v_latest_id
      AND inspection_date IS DISTINCT FROM NEW.expires_at;
  ELSE
    INSERT INTO public.truck_dot_inspections (
      operator_id, inspection_date, reminder_interval, result,
      certificate_file_url, certificate_file_path, created_by
    ) VALUES (
      v_operator_id,
      NEW.expires_at,
      COALESCE((SELECT default_dot_reminder_interval_days FROM public.fleet_settings ORDER BY updated_at DESC LIMIT 1), 360),
      'pass',
      NEW.file_url,
      NEW.file_path,
      NEW.uploaded_by
    );
  END IF;

  PERFORM set_config('app.skip_dot_sync', 'off', true);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_dot_to_inspection_documents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id      uuid;
  v_existing_id  uuid;
  v_latest_date  date;
  v_file_path    text;
BEGIN
  -- Skip if this insert/update was caused by the reverse sync trigger
  IF current_setting('app.skip_dot_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Resolve the operator's auth user_id (binder rows are keyed by driver_id = user_id)
  SELECT user_id INTO v_user_id
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Only sync if THIS record is the latest inspection for the operator
  SELECT MAX(inspection_date) INTO v_latest_date
  FROM public.truck_dot_inspections
  WHERE operator_id = NEW.operator_id;

  IF NEW.inspection_date < COALESCE(v_latest_date, NEW.inspection_date) THEN
    RETURN NEW;
  END IF;

  v_file_path := CASE
    WHEN NEW.certificate_file_path IS NULL THEN NULL
    ELSE 'fleet-documents/' || NEW.certificate_file_path
  END;

  SELECT id INTO v_existing_id
  FROM public.inspection_documents
  WHERE driver_id = v_user_id
    AND name = 'Periodic DOT Inspections'
    AND scope = 'per_driver'
  ORDER BY uploaded_at DESC
  LIMIT 1;

  PERFORM set_config('app.skip_doc_sync', 'on', true);

  IF v_existing_id IS NULL THEN
    INSERT INTO public.inspection_documents (
      name, scope, driver_id, file_url, file_path, expires_at, uploaded_by
    ) VALUES (
      'Periodic DOT Inspections', 'per_driver', v_user_id,
      NEW.certificate_file_url, v_file_path, NEW.inspection_date, NEW.created_by
    );
  ELSE
    UPDATE public.inspection_documents
    SET file_url    = COALESCE(NEW.certificate_file_url, file_url),
        file_path   = COALESCE(v_file_path, file_path),
        expires_at  = NEW.inspection_date,
        updated_at  = now(),
        uploaded_by = COALESCE(NEW.created_by, uploaded_by)
    WHERE id = v_existing_id;
  END IF;

  PERFORM set_config('app.skip_doc_sync', 'off', true);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_contact_from_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_phone text;
  v_state text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.application_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(a.phone, ''), NULLIF(a.address_state, '')
    INTO v_phone, v_state
  FROM public.applications a
  WHERE a.id = NEW.application_id;

  IF v_phone IS NULL AND v_state IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles p
     SET phone      = COALESCE(NULLIF(p.phone, ''), v_phone),
         home_state = COALESCE(NULLIF(p.home_state, ''), v_state)
   WHERE p.user_id = NEW.user_id
     AND (NULLIF(p.phone, '') IS NULL OR NULLIF(p.home_state, '') IS NULL);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_ica_contracts_operator_column_whitelist() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_ica_contracts_operator_column_whitelist() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_ica_contracts_operator_column_whitelist() FROM authenticated;

REVOKE ALL ON FUNCTION public.enforce_ica_contracts_operator_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_ica_contracts_operator_update() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_ica_contracts_operator_update() FROM authenticated;

REVOKE ALL ON FUNCTION public.enforce_osas_operator_sign() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_osas_operator_sign() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_osas_operator_sign() FROM authenticated;

REVOKE ALL ON FUNCTION public.sync_dot_binder_to_vh() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_dot_binder_to_vh() FROM anon;
REVOKE ALL ON FUNCTION public.sync_dot_binder_to_vh() FROM authenticated;

REVOKE ALL ON FUNCTION public.sync_dot_to_inspection_documents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_dot_to_inspection_documents() FROM anon;
REVOKE ALL ON FUNCTION public.sync_dot_to_inspection_documents() FROM authenticated;

REVOKE ALL ON FUNCTION public.sync_profile_contact_from_application() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_profile_contact_from_application() FROM anon;
REVOKE ALL ON FUNCTION public.sync_profile_contact_from_application() FROM authenticated;