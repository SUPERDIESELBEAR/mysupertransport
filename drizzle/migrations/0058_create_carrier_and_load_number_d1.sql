-- Demo carrier, stage 4, part 2b (2026-09-23).
-- D1: generate_load_number() numbers from the CALLER'S carrier only.
-- create_carrier(): the one transactional path that makes a carrier (P43-P47).

-- ── D1 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_load_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cfg public.load_number_config%ROWTYPE;
  v_company uuid := public.current_company_id();
  yr int := EXTRACT(YEAR FROM now())::int;
  seq int;
  parts text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'Not authorized to generate load numbers';
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No carrier resolves for this caller; a load number cannot be generated.'
      USING ERRCODE = '42501';
  END IF;

  -- Stage 4 part 2b, D1: the caller's OWN carrier's row, never "the first row".
  SELECT * INTO cfg FROM public.load_number_config
   WHERE company_id = v_company
   ORDER BY updated_at NULLS LAST LIMIT 1 FOR UPDATE;
  IF cfg.id IS NULL THEN
    RAISE EXCEPTION 'This carrier has no load numbering configured; a load number cannot be generated.'
      USING ERRCODE = 'P0002';
  END IF;

  IF cfg.reset_annually AND (cfg.current_year IS DISTINCT FROM yr) THEN
    cfg.next_sequence := 1;
    cfg.current_year := yr;
  END IF;

  seq := cfg.next_sequence;

  parts := cfg.prefix;
  IF cfg.include_year THEN
    parts := parts || cfg.separator || to_char(now(), 'YY');
  END IF;
  parts := parts || cfg.separator || lpad(seq::text, GREATEST(cfg.sequence_padding, 1), '0');

  UPDATE public.load_number_config
     SET next_sequence = seq + 1,
         current_year = cfg.current_year,
         updated_at = now()
   WHERE id = cfg.id;

  RETURN parts;
END;
$function$;

-- ── Billing stamp: one narrow exception for carrier creation ────────────────
-- The stamp stays unconditional for every caller that resolves a company, and
-- for every service-role write. The ONLY exception: inside create_carrier(),
-- which announces the new carrier transaction-locally, a service-role insert
-- that names exactly that carrier keeps it (the caller resolves no company, so
-- the unconditional assignment would write NULL and refuse the row).
CREATE OR REPLACE FUNCTION public.stamp_billing_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF public.current_company_id() IS NULL
     AND auth.role() = 'service_role'
     AND NEW.company_id IS NOT NULL
     AND NEW.company_id::text = current_setting('app.creating_carrier', true) THEN
    RETURN NEW;
  END IF;
  NEW.company_id := public.current_company_id();
  RETURN NEW;
END;
$function$;

-- ── create_carrier ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_carrier(p_inputs jsonb, p_owner uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_dry      boolean := COALESCE((p_inputs->>'dry_run')::boolean, false);
  v_company  uuid := gen_random_uuid();
  v_req      text;
  v_val      text;
  v_email    text := lower(btrim(p_inputs->>'owner_email'));
  v_slug     text := lower(btrim(p_inputs->>'apply_slug'));
  v_ingest   text := nullif(lower(btrim(p_inputs->>'rate_con_ingest_address')), '');
  v_pay      jsonb := COALESCE(p_inputs->'pay', '{}'::jsonb);
  v_pct      jsonb := '{}'::jsonb;
  v_key      text;
  v_num      numeric;
  v_actor_profile uuid;
  v_actor_name text;
  v_perm     int;
  v_year_ct  int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Chicago'))::int;
  v_rows     jsonb := '[]'::jsonb;
  v_n        int;
BEGIN
  -- Platform power (P43), re-checked here so a leaked service path still needs a platform actor.
  IF NOT public.is_platform_admin(p_actor) THEN
    RAISE EXCEPTION 'Only a SUPERDRIVE platform operator can create a carrier.' USING ERRCODE = '42501';
  END IF;

  -- Required inputs (Part C, P45). Refuse naming the first missing field.
  FOREACH v_req IN ARRAY ARRAY[
    'legal_name','usdot_number','mc_number','main_office_address','home_terminal_address',
    'home_terminal_timezone','fmcsa_division_state','applicant_locality','apply_slug',
    'load_number_prefix','invoice_number_prefix','owner_first_name','owner_last_name',
    'owner_email','signature_typed_name','signature_title','dispatch_pct','factoring_pct',
    'inspection_submission_email'
  ] LOOP
    IF nullif(btrim(COALESCE(p_inputs->>v_req, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Missing required input: %', v_req USING ERRCODE = '22023', HINT = v_req;
    END IF;
  END LOOP;

  -- Formats.
  IF v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$' THEN
    RAISE EXCEPTION 'Invalid input: apply_slug must be 3-32 lowercase letters, digits or dashes.' USING ERRCODE = '22023', HINT = 'apply_slug';
  END IF;
  IF (p_inputs->>'usdot_number') !~ '^[0-9]{1,8}$' THEN
    RAISE EXCEPTION 'Invalid input: usdot_number must be digits only.' USING ERRCODE = '22023', HINT = 'usdot_number';
  END IF;
  IF upper(p_inputs->>'fmcsa_division_state') !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Invalid input: fmcsa_division_state must be a two-letter state.' USING ERRCODE = '22023', HINT = 'fmcsa_division_state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_inputs->>'home_terminal_timezone') THEN
    RAISE EXCEPTION 'Invalid input: home_terminal_timezone is not a known time zone.' USING ERRCODE = '22023', HINT = 'home_terminal_timezone';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid input: owner_email is not an email address.' USING ERRCODE = '22023', HINT = 'owner_email';
  END IF;
  IF lower(p_inputs->>'inspection_submission_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid input: inspection_submission_email is not an email address.' USING ERRCODE = '22023', HINT = 'inspection_submission_email';
  END IF;
  IF v_ingest IS NOT NULL AND v_ingest !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid input: rate_con_ingest_address is not an email address.' USING ERRCODE = '22023', HINT = 'rate_con_ingest_address';
  END IF;
  FOREACH v_req IN ARRAY ARRAY['dispatch_pct','factoring_pct'] LOOP
    BEGIN
      v_num := (p_inputs->>v_req)::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid input: % must be a number.', v_req USING ERRCODE = '22023', HINT = v_req;
    END;
    IF v_num < 0 OR v_num > 100 THEN
      RAISE EXCEPTION 'Invalid input: % must be between 0 and 100.', v_req USING ERRCODE = '22023', HINT = v_req;
    END IF;
  END LOOP;

  -- P44: SUPERDRIVE standard percentages unless the platform operator changed them.
  v_pct := jsonb_build_object(
    'linehaul_pct', 72, 'fsc_pct', 72, 'tonu_pct', 72, 'stopoff_pct', 72, 'loadout_pct', 72,
    'per_ton_pct', 72, 'other_accessorial_pct', 72,
    'detention_pct', 100, 'layover_pct', 100, 'lumper_reimbursement_pct', 100);
  FOR v_key IN SELECT jsonb_object_keys(v_pct) LOOP
    IF v_pay ? v_key AND nullif(v_pay->>v_key, '') IS NOT NULL THEN
      BEGIN
        v_num := (v_pay->>v_key)::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid input: pay.% must be a number.', v_key USING ERRCODE = '22023', HINT = 'pay.' || v_key;
      END;
      IF v_num < 0 OR v_num > 100 THEN
        RAISE EXCEPTION 'Invalid input: pay.% must be between 0 and 100.', v_key USING ERRCODE = '22023', HINT = 'pay.' || v_key;
      END IF;
      v_pct := jsonb_set(v_pct, ARRAY[v_key], to_jsonb(v_num));
    END IF;
  END LOOP;

  -- Uniqueness, named (the unique indexes back each one).
  IF EXISTS (SELECT 1 FROM public.carrier_profile WHERE usdot_number = btrim(p_inputs->>'usdot_number')) THEN
    RAISE EXCEPTION 'A carrier with USDOT % already exists.', btrim(p_inputs->>'usdot_number') USING ERRCODE = '23505', HINT = 'usdot_number';
  END IF;
  IF EXISTS (SELECT 1 FROM public.carrier_profile WHERE lower(apply_slug) = v_slug) THEN
    RAISE EXCEPTION 'The apply link name "%" is already taken.', v_slug USING ERRCODE = '23505', HINT = 'apply_slug';
  END IF;
  IF v_ingest IS NOT NULL AND EXISTS (SELECT 1 FROM public.carrier_profile WHERE lower(rate_con_ingest_address) = v_ingest) THEN
    RAISE EXCEPTION 'The rate confirmation address % is already in use.', v_ingest USING ERRCODE = '23505', HINT = 'rate_con_ingest_address';
  END IF;

  -- P47 and the owner step.
  IF v_dry THEN
    IF p_owner IS NOT NULL THEN
      RAISE EXCEPTION 'A dry run takes no owner account.' USING ERRCODE = '22023', HINT = 'owner';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'The owner email % already belongs to a SUPERDRIVE user; a person linked to two carriers resolves to neither.', v_email
        USING ERRCODE = '23505', HINT = 'owner_email';
    END IF;
  ELSE
    IF p_owner IS NULL THEN
      RAISE EXCEPTION 'An owner account is required.' USING ERRCODE = '22023', HINT = 'owner';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner AND lower(email) = v_email) THEN
      RAISE EXCEPTION 'The owner account does not match owner_email.' USING ERRCODE = '22023', HINT = 'owner_email';
    END IF;
    IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = p_owner)
       OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_owner)
       OR EXISTS (SELECT 1 FROM public.operators WHERE user_id = p_owner)
       OR EXISTS (SELECT 1 FROM public.truck_owners WHERE user_id = p_owner) THEN
      RAISE EXCEPTION 'The owner already belongs to a carrier; a person linked to two carriers resolves to neither.'
        USING ERRCODE = '23505', HINT = 'owner_email';
    END IF;
  END IF;

  SELECT p.id, nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_actor_profile, v_actor_name
    FROM public.profiles p WHERE p.user_id = p_actor;

  -- Announce the carrier being created, transaction-locally (billing stamp exception).
  PERFORM set_config('app.creating_carrier', v_company::text, true);

  -- 1. carrier_profile
  INSERT INTO public.carrier_profile (id, legal_name, usdot_number, mc_number, main_office_address,
    home_terminal_address, home_terminal_timezone, fmcsa_division_state, applicant_locality,
    apply_slug, rate_con_ingest_address)
  VALUES (v_company, btrim(p_inputs->>'legal_name'), btrim(p_inputs->>'usdot_number'),
    btrim(p_inputs->>'mc_number'), btrim(p_inputs->>'main_office_address'),
    btrim(p_inputs->>'home_terminal_address'), p_inputs->>'home_terminal_timezone',
    upper(btrim(p_inputs->>'fmcsa_division_state')), btrim(p_inputs->>'applicant_locality'),
    v_slug, v_ingest);
  v_rows := v_rows || jsonb_build_object('table','carrier_profile','rows',1,'summary',
    btrim(p_inputs->>'legal_name') || ', USDOT ' || btrim(p_inputs->>'usdot_number') || ', MC ' || btrim(p_inputs->>'mc_number') || ', apply link /apply/' || v_slug);

  -- 2. owner (bootstrap_assign_owner: owner role + company membership)
  IF v_dry THEN
    v_rows := v_rows || jsonb_build_object('table','user_roles + company_members','rows',2,'summary',
      'Owner ' || btrim(p_inputs->>'owner_first_name') || ' ' || btrim(p_inputs->>'owner_last_name') || ' <' || v_email || '> — written when the real login exists (checked only in a dry run)');
  ELSE
    PERFORM public.bootstrap_assign_owner(p_owner, v_company);
    v_rows := v_rows || jsonb_build_object('table','user_roles + company_members','rows',2,'summary','Owner ' || v_email);
  END IF;

  -- 3. role permissions
  v_perm := public.seed_role_permissions(v_company);
  v_rows := v_rows || jsonb_build_object('table','role_permissions','rows',v_perm,'summary','SUPERDRIVE standard staff permissions');

  -- 4. pay policy v1 (P44)
  INSERT INTO public.pay_policies (company_id, name, description, is_company_default, is_active,
    effective_from, effective_date, linehaul_pct, fsc_pct, detention_pct, layover_pct, tonu_pct,
    stopoff_pct, lumper_reimbursement_pct, per_ton_pct, loadout_pct, other_accessorial_pct,
    created_by, updated_by)
  VALUES (v_company, btrim(p_inputs->>'legal_name') || ' Standard',
    'Version 1, set at carrier creation (P44).', true, true, DATE '2000-01-01', CURRENT_DATE,
    (v_pct->>'linehaul_pct')::numeric, (v_pct->>'fsc_pct')::numeric, (v_pct->>'detention_pct')::numeric,
    (v_pct->>'layover_pct')::numeric, (v_pct->>'tonu_pct')::numeric, (v_pct->>'stopoff_pct')::numeric,
    (v_pct->>'lumper_reimbursement_pct')::numeric, (v_pct->>'per_ton_pct')::numeric,
    (v_pct->>'loadout_pct')::numeric, (v_pct->>'other_accessorial_pct')::numeric,
    v_actor_profile, v_actor_profile);
  v_rows := v_rows || jsonb_build_object('table','pay_policies','rows',1,'summary',v_pct);

  -- 5. settlement settings (SUPERDRIVE defaults) + dispatch/factoring rates (P45, required)
  INSERT INTO public.settlement_settings (company_id, minimum_net_pay_threshold, hold_buffer,
    equipment_value_per_driver, rm_deposit_target, rm_weekly_deduction, work_week_start_dow)
  VALUES (v_company, 100, 500, 1200, 2000, 200, 3);
  v_rows := v_rows || jsonb_build_object('table','settlement_settings','rows',1,'summary',
    'Minimum net pay $100, R&M Deposit $2,000 at $200/week, work week starts Wednesday');

  INSERT INTO public.dispatch_settlement_rates (company_id, dispatch_pct, factoring_pct, effective_from, created_by, updated_by)
  VALUES (v_company, (p_inputs->>'dispatch_pct')::numeric, (p_inputs->>'factoring_pct')::numeric,
    COALESCE(nullif(p_inputs->>'dispatch_rates_effective_from','')::date, (now() AT TIME ZONE 'America/Chicago')::date),
    v_actor_profile, v_actor_profile);
  v_rows := v_rows || jsonb_build_object('table','dispatch_settlement_rates','rows',1,'summary',
    'Dispatch ' || (p_inputs->>'dispatch_pct') || '%, factoring ' || (p_inputs->>'factoring_pct') || '%');

  -- 6. numbering, the carrier's own prefixes
  INSERT INTO public.load_number_config (company_id, prefix, include_year, separator, sequence_padding, current_year, next_sequence, reset_annually)
  VALUES (v_company, upper(btrim(p_inputs->>'load_number_prefix')), true, '', 3, EXTRACT(YEAR FROM now())::int, 1, true);
  INSERT INTO public.invoice_number_config (company_id, year, prefix, separator, sequence_padding, next_sequence)
  VALUES (v_company, v_year_ct, upper(btrim(p_inputs->>'invoice_number_prefix')), '-', 4, 1);
  INSERT INTO public.unit_number_config (company_id, sequence_min, sequence_max_offered, excluded_units)
  VALUES (v_company, 1, 999, '{}'::text[]);
  v_rows := v_rows || jsonb_build_object('table','load_number_config','rows',1,'summary',
    'First load ' || upper(btrim(p_inputs->>'load_number_prefix')) || to_char(now(), 'YY') || '001');
  v_rows := v_rows || jsonb_build_object('table','invoice_number_config','rows',1,'summary',
    'First invoice ' || upper(btrim(p_inputs->>'invoice_number_prefix')) || to_char(make_date(v_year_ct,1,1),'YY') || '-0001');
  v_rows := v_rows || jsonb_build_object('table','unit_number_config','rows',1,'summary','Unit numbers 1-999, none excluded');

  -- 7. carrier signature
  INSERT INTO public.carrier_signature_settings (company_id, typed_name, title, updated_by)
  VALUES (v_company, btrim(p_inputs->>'signature_typed_name'), btrim(p_inputs->>'signature_title'), v_actor_profile);
  v_rows := v_rows || jsonb_build_object('table','carrier_signature_settings','rows',1,'summary',
    btrim(p_inputs->>'signature_typed_name') || ', ' || btrim(p_inputs->>'signature_title') || ' (signature image uploaded later)');

  -- 8. notification role defaults (SUPERDRIVE matrix)
  INSERT INTO public.notification_role_defaults (company_id, role, category, email_enabled)
  SELECT v_company, d.role::public.app_role, d.category, d.on_
    FROM (VALUES
      ('owner','applications',false),('management','applications',true),('onboarding_staff','applications',true),('dispatcher','applications',false),('truck_owner','applications',false),
      ('owner','onboarding',true),('management','onboarding',true),('onboarding_staff','onboarding',true),('dispatcher','onboarding',false),('truck_owner','onboarding',false),
      ('owner','compliance',false),('management','compliance',true),('onboarding_staff','compliance',true),('dispatcher','compliance',true),('truck_owner','compliance',false),
      ('owner','dispatch',false),('management','dispatch',true),('onboarding_staff','dispatch',false),('dispatcher','dispatch',true),('truck_owner','dispatch',false),
      ('owner','messaging',true),('management','messaging',true),('onboarding_staff','messaging',true),('dispatcher','messaging',true),('truck_owner','messaging',false),
      ('owner','fleet_documents',true),('management','fleet_documents',true),('onboarding_staff','fleet_documents',true),('dispatcher','fleet_documents',false),('truck_owner','fleet_documents',false),
      ('owner','staff_admin',true),('management','staff_admin',true),('onboarding_staff','staff_admin',true),('dispatcher','staff_admin',true),('truck_owner','staff_admin',false)
    ) AS d(role, category, on_);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('table','notification_role_defaults','rows',v_n,'summary','SUPERDRIVE standard email switches by role');

  -- 9. fleet settings
  INSERT INTO public.fleet_settings (company_id, default_dot_reminder_interval_days) VALUES (v_company, 360);
  v_rows := v_rows || jsonb_build_object('table','fleet_settings','rows',1,'summary','DOT inspection reminder every 360 days');

  -- 10. PEI cadence
  INSERT INTO public.pei_cadence_settings (company_id, auto_follow_ups_enabled, follow_up_interval_days, gfe_after_days)
  VALUES (v_company, true, 10, 30);
  v_rows := v_rows || jsonb_build_object('table','pei_cadence_settings','rows',1,'summary','Follow up every 10 days, good-faith effort after 30, automatic');

  -- 11. binder order
  INSERT INTO public.inspection_binder_order (company_id, scope, doc_order) VALUES
    (v_company, 'company_wide', '["IFTA License","Insurance","UCR","MC Authority","State Specific Permits","ELD Procedures","Accident Packet","Overweight/Oversize Permits","Hazmat"]'::jsonb),
    (v_company, 'per_driver', '["IRP Registration (cab card)","Periodic DOT Inspections","CDL (Front)","CDL (Back)","Medical Certificate","DOT Inspections","Lease Agreement (ICA)"]'::jsonb);
  v_rows := v_rows || jsonb_build_object('table','inspection_binder_order','rows',2,'summary','Standard binder order, company and per-driver');

  -- 12. company settings
  INSERT INTO public.company_settings (company_id, setting_key, setting_value, description)
  VALUES (v_company, 'auto_cover_on_assignment', 'true'::jsonb,
    'When enabled, assigning a driver to a load in available status automatically advances it to covered, and unassigning a driver from a covered load returns it to available. Carriers with a separate brokerage or load-planning team may prefer this disabled so assignment and status progression stay independent.');
  v_rows := v_rows || jsonb_build_object('table','company_settings','rows',1,'summary','Assigning a driver marks the load covered');

  -- 13. inspection programme, OFF (P46)
  INSERT INTO public.inspection_program_settings (company_id, programme_enabled, submission_email, updated_by)
  VALUES (v_company, false, lower(btrim(p_inputs->>'inspection_submission_email')), v_actor_profile);
  v_rows := v_rows || jsonb_build_object('table','inspection_program_settings','rows',1,'summary',
    'Inspection bonus programme OFF; submissions to ' || lower(btrim(p_inputs->>'inspection_submission_email')));

  -- 14. audit
  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (p_actor, COALESCE(v_actor_name, 'platform operator'), 'carrier_created', 'carrier', v_company,
    btrim(p_inputs->>'legal_name'),
    jsonb_build_object('company_id', v_company, 'usdot_number', btrim(p_inputs->>'usdot_number'),
      'apply_slug', v_slug, 'owner_user_id', p_owner, 'owner_email', v_email, 'platform_actor', p_actor,
      'mechanism', 'create_carrier'));
  v_rows := v_rows || jsonb_build_object('table','audit_log','rows',1,'summary','carrier_created by ' || COALESCE(v_actor_name, p_actor::text));

  IF v_dry THEN
    RAISE EXCEPTION 'CREATE_CARRIER_DRY_RUN'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object('dry_run', true, 'company_id', v_company, 'rows', v_rows)::text;
  END IF;

  RETURN jsonb_build_object('dry_run', false, 'company_id', v_company, 'rows', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_carrier(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_carrier(jsonb, uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.create_carrier(jsonb, uuid, uuid) IS
  'Stage 4 part 2b (P43-P47): the only path that makes a carrier. service_role only, re-checks is_platform_admin(p_actor), one transaction, explicit company_id on every row. p_inputs.dry_run=true writes everything except the owner step and then raises CREATE_CARRIER_DRY_RUN with the would-be rows in DETAIL.';
