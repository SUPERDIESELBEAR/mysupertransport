-- save_application_draft announces the carrier it resolved from the apply slug, so
-- the stamp trigger (0050) can trust it. Body otherwise identical to 0048.

CREATE OR REPLACE FUNCTION public.save_application_draft(p_token uuid, p_payload jsonb)
 RETURNS TABLE(id uuid, current_step smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.applications;
  v_email    text;
  v_step     smallint;
  v_slug     text;
  v_company  uuid;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token_required';
  END IF;

  v_email := nullif(btrim(p_payload->>'email'), '');
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  v_slug := nullif(btrim(coalesce(p_payload->>'carrier_slug', '')), '');
  IF v_slug IS NOT NULL THEN
    SELECT c.id INTO v_company
    FROM public.carrier_profile c
    WHERE lower(c.apply_slug) = lower(v_slug)
    LIMIT 1;

    IF v_company IS NULL THEN
      RAISE EXCEPTION 'unknown_carrier';
    END IF;

    -- Announce the SERVER-RESOLVED carrier to the stamp trigger, transaction-local.
    -- Without this the trigger cannot tell a carrier resolved from a slug apart
    -- from one a browser invented, so it discards it and falls back to "the sole
    -- carrier, or refuse" -- which would refuse every linked application the day a
    -- second carrier exists. The browser cannot set this: this definer function is
    -- its only writer, and it dies with the transaction.
    PERFORM set_config('app.apply_link_company', v_company::text, true);
  END IF;

  v_step := GREATEST(1, LEAST(9, COALESCE((p_payload->>'current_step')::int, 1)))::smallint;

  SELECT * INTO v_existing
  FROM public.applications
  WHERE draft_token = p_token::text
  LIMIT 1;

  IF FOUND AND v_existing.is_draft = false THEN
    RAISE EXCEPTION 'cannot_edit_submitted_application';
  END IF;

  IF FOUND THEN
    v_step := GREATEST(v_step, COALESCE(v_existing.current_step, 1));

    UPDATE public.applications SET
      email                       = v_email,
      first_name                  = p_payload->>'first_name',
      last_name                   = p_payload->>'last_name',
      dob                         = NULLIF(p_payload->>'dob','')::date,
      phone                       = p_payload->>'phone',
      address_street              = p_payload->>'address_street',
      address_line2               = p_payload->>'address_line2',
      address_city                = p_payload->>'address_city',
      address_state               = p_payload->>'address_state',
      address_zip                 = p_payload->>'address_zip',
      address_duration            = p_payload->>'address_duration',
      prev_address_street         = p_payload->>'prev_address_street',
      prev_address_line2          = p_payload->>'prev_address_line2',
      prev_address_city           = p_payload->>'prev_address_city',
      prev_address_state          = p_payload->>'prev_address_state',
      prev_address_zip            = p_payload->>'prev_address_zip',
      cdl_state                   = p_payload->>'cdl_state',
      cdl_number                  = p_payload->>'cdl_number',
      cdl_class                   = p_payload->>'cdl_class',
      cdl_expiration              = NULLIF(p_payload->>'cdl_expiration','')::date,
      endorsements                = CASE
                                      WHEN jsonb_typeof(p_payload->'endorsements') = 'array'
                                        THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'endorsements'))
                                      WHEN p_payload ? 'endorsements'
                                        THEN NULL
                                      ELSE endorsements
                                    END,
      cdl_10_years                = NULLIF(p_payload->>'cdl_10_years','')::boolean,
      referral_source             = p_payload->>'referral_source',
      employers                   = COALESCE(p_payload->'employers', employers),
      employment_gaps             = NULLIF(p_payload->>'employment_gaps','')::boolean,
      employment_gaps_explanation = p_payload->>'employment_gaps_explanation',
      years_experience            = p_payload->>'years_experience',
      equipment_operated          = CASE
                                      WHEN jsonb_typeof(p_payload->'equipment_operated') = 'array'
                                        THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'equipment_operated'))
                                      WHEN p_payload ? 'equipment_operated'
                                        THEN NULL
                                      ELSE equipment_operated
                                    END,
      dot_accidents               = NULLIF(p_payload->>'dot_accidents','')::boolean,
      dot_accidents_description   = p_payload->>'dot_accidents_description',
      moving_violations           = NULLIF(p_payload->>'moving_violations','')::boolean,
      moving_violations_description = p_payload->>'moving_violations_description',
      sap_process                 = NULLIF(p_payload->>'sap_process','')::boolean,
      dl_front_url                = p_payload->>'dl_front_url',
      dl_rear_url                 = p_payload->>'dl_rear_url',
      medical_cert_url            = p_payload->>'medical_cert_url',
      auth_safety_history         = COALESCE((p_payload->>'auth_safety_history')::boolean, auth_safety_history),
      auth_drug_alcohol           = COALESCE((p_payload->>'auth_drug_alcohol')::boolean, auth_drug_alcohol),
      auth_previous_employers     = COALESCE((p_payload->>'auth_previous_employers')::boolean, auth_previous_employers),
      dot_positive_test_past_2yr  = NULLIF(p_payload->>'dot_positive_test_past_2yr','')::boolean,
      dot_return_to_duty_docs     = NULLIF(p_payload->>'dot_return_to_duty_docs','')::boolean,
      testing_policy_accepted     = COALESCE((p_payload->>'testing_policy_accepted')::boolean, testing_policy_accepted),
      ssn_encrypted               = COALESCE(p_payload->>'ssn_encrypted', ssn_encrypted),
      typed_full_name             = p_payload->>'typed_full_name',
      signature_image_url         = p_payload->>'signature_image_url',
      signed_date                 = CASE WHEN p_payload->>'signed_date' ~ '^\d{4}-\d{2}-\d{2}$'
                                         THEN (p_payload->>'signed_date')::date
                                         ELSE signed_date END,
      current_step                = v_step,
      is_draft                    = true,
      updated_at                  = now()
    WHERE applications.id = v_existing.id;

    id := v_existing.id;
    current_step := v_step;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.applications (
    company_id,
    draft_token, is_draft, email,
    first_name, last_name, dob, phone,
    address_street, address_line2, address_city, address_state, address_zip, address_duration,
    prev_address_street, prev_address_line2, prev_address_city, prev_address_state, prev_address_zip,
    cdl_state, cdl_number, cdl_class, cdl_expiration, endorsements, cdl_10_years, referral_source,
    employers, employment_gaps, employment_gaps_explanation,
    years_experience, equipment_operated,
    dot_accidents, dot_accidents_description, moving_violations, moving_violations_description, sap_process,
    dl_front_url, dl_rear_url, medical_cert_url,
    auth_safety_history, auth_drug_alcohol, auth_previous_employers,
    dot_positive_test_past_2yr, dot_return_to_duty_docs, testing_policy_accepted,
    ssn_encrypted, typed_full_name, signature_image_url, signed_date,
    current_step
  ) VALUES (
    v_company,
    p_token::text, true, v_email,
    p_payload->>'first_name', p_payload->>'last_name',
    NULLIF(p_payload->>'dob','')::date, p_payload->>'phone',
    p_payload->>'address_street', p_payload->>'address_line2', p_payload->>'address_city',
    p_payload->>'address_state', p_payload->>'address_zip', p_payload->>'address_duration',
    p_payload->>'prev_address_street', p_payload->>'prev_address_line2', p_payload->>'prev_address_city',
    p_payload->>'prev_address_state', p_payload->>'prev_address_zip',
    p_payload->>'cdl_state', p_payload->>'cdl_number', p_payload->>'cdl_class',
    NULLIF(p_payload->>'cdl_expiration','')::date,
    CASE WHEN jsonb_typeof(p_payload->'endorsements') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'endorsements'))
         ELSE NULL END,
    NULLIF(p_payload->>'cdl_10_years','')::boolean,
    p_payload->>'referral_source',
    COALESCE(p_payload->'employers', '[]'::jsonb),
    NULLIF(p_payload->>'employment_gaps','')::boolean,
    p_payload->>'employment_gaps_explanation',
    p_payload->>'years_experience',
    CASE WHEN jsonb_typeof(p_payload->'equipment_operated') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'equipment_operated'))
         ELSE NULL END,
    NULLIF(p_payload->>'dot_accidents','')::boolean,
    p_payload->>'dot_accidents_description',
    NULLIF(p_payload->>'moving_violations','')::boolean,
    p_payload->>'moving_violations_description',
    NULLIF(p_payload->>'sap_process','')::boolean,
    p_payload->>'dl_front_url', p_payload->>'dl_rear_url', p_payload->>'medical_cert_url',
    COALESCE((p_payload->>'auth_safety_history')::boolean, false),
    COALESCE((p_payload->>'auth_drug_alcohol')::boolean, false),
    COALESCE((p_payload->>'auth_previous_employers')::boolean, false),
    NULLIF(p_payload->>'dot_positive_test_past_2yr','')::boolean,
    NULLIF(p_payload->>'dot_return_to_duty_docs','')::boolean,
    COALESCE((p_payload->>'testing_policy_accepted')::boolean, false),
    p_payload->>'ssn_encrypted',
    p_payload->>'typed_full_name',
    p_payload->>'signature_image_url',
    CASE WHEN p_payload->>'signed_date' ~ '^\d{4}-\d{2}-\d{2}$'
         THEN (p_payload->>'signed_date')::date
         ELSE NULL END,
    v_step
  )
  RETURNING applications.id, applications.current_step INTO id, current_step;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_application_draft(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_application_draft(uuid, jsonb) TO anon, authenticated, service_role;