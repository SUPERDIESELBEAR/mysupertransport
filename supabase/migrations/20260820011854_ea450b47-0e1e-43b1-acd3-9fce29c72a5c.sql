-- Re-pin search_path to "public, extensions" on SECURITY DEFINER functions
-- still pinned to public alone (part 2 of 3).
-- Bodies are byte-identical to the live definitions (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.enforce_load_stops_operator_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := ARRAY['actual_arrival_at','actual_departure_at','arrival_latitude','arrival_longitude','departure_latitude','departure_longitude','updated_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
     OR public.has_role(auth.uid(), 'dispatcher') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'operator') THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Operators may only update arrival, departure, and location fields on their stops';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_loads_operator_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  allowed text[] := ARRAY['driver_accepted_at','driver_declined_at','driver_decline_reason','reefer_acknowledged_at','updated_at'];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
     OR public.has_role(auth.uid(), 'dispatcher') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'operator') THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'Operators may only update driver action fields on their loads';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_load_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cfg public.load_number_config%ROWTYPE;
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

  SELECT * INTO cfg FROM public.load_number_config ORDER BY updated_at NULLS LAST LIMIT 1 FOR UPDATE;
  IF cfg.id IS NULL THEN
    RAISE EXCEPTION 'Load number configuration is missing';
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_ica_review_link(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row public.ica_review_links%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ica_review_links WHERE token = _token;
  IF NOT FOUND OR v_row.revoked OR v_row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  IF v_row.opened_at IS NULL THEN
    UPDATE public.ica_review_links SET opened_at = now() WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'recipient_name', v_row.recipient_name,
    'note', v_row.note,
    'expires_at', v_row.expires_at
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_share_bundle_meta(p_token uuid)
 RETURNS TABLE(driver_name text, unit_number text, doc_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT b.driver_name, b.unit_number, coalesce(array_length(b.doc_tokens, 1), 0)
  FROM public.binder_share_bundles b
  WHERE b.token = p_token AND b.expires_at > now();
$function$
;

CREATE OR REPLACE FUNCTION public.get_staff_contact_info(_user_ids uuid[])
 RETURNS TABLE(user_id uuid, first_name text, last_name text, avatar_url text, primary_role app_role)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.is_staff(auth.uid()) OR public.has_role(auth.uid(), 'operator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    (
      SELECT ur.role
      FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role IN ('owner','management','onboarding_staff','dispatcher')
      ORDER BY CASE ur.role
        WHEN 'owner' THEN 1
        WHEN 'management' THEN 2
        WHEN 'onboarding_staff' THEN 3
        WHEN 'dispatcher' THEN 4
        ELSE 5
      END
      LIMIT 1
    ) AS primary_role
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids)
    AND public.is_staff(p.user_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_broker_factoring_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.broker_factoring_history (broker_id, previous_status, new_status, reason, changed_by)
  VALUES (NEW.id, OLD.factoring_status, NEW.factoring_status, NEW.factoring_status_reason, public.current_profile_id());
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_claim_flag_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_action text;
  v_actor uuid := public.current_profile_id();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.claim_flag_history (
      claim_flag_id, load_id, action,
      new_flag_level, new_is_active, new_resolution,
      new_estimated_amount, new_actual_amount, changed_by
    ) VALUES (
      NEW.id, NEW.load_id, 'created',
      NEW.flag_level, NEW.is_active, NEW.resolution,
      NEW.estimated_claim_amount, NEW.actual_claim_amount, v_actor
    );
    RETURN NEW;
  END IF;

  IF NEW.flag_level IS DISTINCT FROM OLD.flag_level
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.resolution IS DISTINCT FROM OLD.resolution
     OR NEW.estimated_claim_amount IS DISTINCT FROM OLD.estimated_claim_amount
     OR NEW.actual_claim_amount IS DISTINCT FROM OLD.actual_claim_amount
  THEN
    IF OLD.is_active IS TRUE AND NEW.is_active IS FALSE THEN
      v_action := 'resolved';
    ELSIF OLD.is_active IS FALSE AND NEW.is_active IS TRUE THEN
      v_action := 'reopened';
    ELSE
      v_action := 'updated';
    END IF;

    INSERT INTO public.claim_flag_history (
      claim_flag_id, load_id, action,
      previous_flag_level, new_flag_level,
      previous_is_active, new_is_active,
      previous_resolution, new_resolution,
      previous_estimated_amount, new_estimated_amount,
      previous_actual_amount, new_actual_amount,
      changed_by
    ) VALUES (
      NEW.id, NEW.load_id, v_action,
      OLD.flag_level, NEW.flag_level,
      OLD.is_active, NEW.is_active,
      OLD.resolution, NEW.resolution,
      OLD.estimated_claim_amount, NEW.estimated_claim_amount,
      OLD.actual_claim_amount, NEW.actual_claim_amount,
      v_actor
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_load_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  INSERT INTO public.load_status_history (load_id, previous_status, new_status, changed_by)
  VALUES (NEW.id, OLD.status, NEW.status, public.current_profile_id());
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.manage_claim_flag(p_action text, p_load_id uuid DEFAULT NULL::uuid, p_claim_id uuid DEFAULT NULL::uuid, p_flag_level claim_flag_level DEFAULT NULL::claim_flag_level, p_claim_type claim_type DEFAULT NULL::claim_type, p_description text DEFAULT NULL::text, p_reported_by_contact text DEFAULT NULL::text, p_estimated_amount numeric DEFAULT NULL::numeric, p_documentation_url text DEFAULT NULL::text, p_resolution text DEFAULT NULL::text, p_resolution_notes text DEFAULT NULL::text, p_actual_amount numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_mgmt boolean;
  v_is_disp boolean;
  v_profile uuid;
  v_id uuid;
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_notes text := nullif(btrim(coalesce(p_resolution_notes, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_existing public.claim_flags%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_mgmt := public.has_role(v_uid, 'management') OR public.has_role(v_uid, 'owner');
  v_is_disp := public.has_role(v_uid, 'dispatcher');
  v_profile := public.current_profile_id();

  IF p_action = 'reopen' THEN
    IF NOT v_is_mgmt THEN
      RAISE EXCEPTION 'Only management may reopen a resolved claim';
    END IF;
  ELSE
    IF NOT (v_is_mgmt OR v_is_disp) THEN
      RAISE EXCEPTION 'You do not have permission to manage claims';
    END IF;
  END IF;

  IF p_action = 'raise' THEN
    IF p_load_id IS NULL THEN
      RAISE EXCEPTION 'A load is required';
    END IF;
    IF p_flag_level IS NULL OR p_flag_level = 'cleared'::claim_flag_level THEN
      RAISE EXCEPTION 'A new claim must be raised as watch or hold';
    END IF;
    IF p_claim_type IS NULL THEN
      RAISE EXCEPTION 'A claim type is required';
    END IF;
    IF v_desc IS NULL THEN
      RAISE EXCEPTION 'A description is required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.loads WHERE id = p_load_id) THEN
      RAISE EXCEPTION 'Load not found';
    END IF;

    INSERT INTO public.claim_flags (
      load_id, flag_level, claim_type, description, reported_by_contact,
      estimated_claim_amount, documentation_url, reported_at, is_active,
      created_by, updated_by
    ) VALUES (
      p_load_id, p_flag_level, p_claim_type, v_desc,
      nullif(btrim(coalesce(p_reported_by_contact, '')), ''),
      p_estimated_amount,
      nullif(btrim(coalesce(p_documentation_url, '')), ''),
      now(), true, v_profile, v_profile
    )
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  IF p_claim_id IS NULL THEN
    RAISE EXCEPTION 'A claim is required';
  END IF;

  SELECT * INTO v_existing FROM public.claim_flags WHERE id = p_claim_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF p_action = 'resolve' THEN
    IF NOT v_existing.is_active THEN
      RAISE EXCEPTION 'This claim is already resolved';
    END IF;
    IF nullif(btrim(coalesce(p_resolution, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A resolution outcome is required';
    END IF;
    IF v_notes IS NULL THEN
      RAISE EXCEPTION 'Resolution notes are required';
    END IF;
    IF p_resolution IN ('approved_in_full', 'approved_in_part') AND p_actual_amount IS NULL THEN
      RAISE EXCEPTION 'An actual claim amount is required for approved outcomes';
    END IF;

    UPDATE public.claim_flags
    SET resolution = p_resolution,
        resolution_notes = v_notes,
        actual_claim_amount = COALESCE(p_actual_amount, actual_claim_amount),
        updated_by = v_profile
    WHERE id = p_claim_id;

    RETURN p_claim_id;
  END IF;

  IF p_action = 'reopen' THEN
    IF v_existing.is_active THEN
      RAISE EXCEPTION 'This claim is already active';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required to reopen a claim';
    END IF;

    UPDATE public.claim_flags
    SET resolution = NULL,
        resolution_notes = trim(both E'\n' FROM
          coalesce(resolution_notes || E'\n\n', '')
          || 'Reopened ' || to_char(now() AT TIME ZONE 'America/Chicago', 'Mon DD, YYYY HH12:MI AM')
          || ': ' || v_reason),
        flag_level = CASE WHEN v_existing.flag_level = 'cleared'::claim_flag_level
                          THEN 'watch'::claim_flag_level ELSE v_existing.flag_level END,
        updated_by = v_profile
    WHERE id = p_claim_id;

    RETURN p_claim_id;
  END IF;

  RAISE EXCEPTION 'Unknown claim action';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_load_document_uploader()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.uploaded_by := public.current_profile_id();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stamp_broker_factoring_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.factoring_status_updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stamp_document_exception_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    NEW.resolved_by := public.current_profile_id();
    NEW.resolved_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stamp_facilities_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, public.current_profile_id());
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(public.current_profile_id(), OLD.updated_by);
  END IF;
  RETURN NEW;
END;
$function$
;