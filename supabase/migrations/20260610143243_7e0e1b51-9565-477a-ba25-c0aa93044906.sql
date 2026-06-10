
-- 1. Furthest step the applicant has advanced past (1-9)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS current_step smallint NOT NULL DEFAULT 1
  CHECK (current_step BETWEEN 1 AND 9);

-- 2. Save-draft RPC for anonymous applicants (and authenticated, harmless).
-- SECURITY DEFINER + scoped by draft_token (UUID held only by the applicant).
CREATE OR REPLACE FUNCTION public.save_application_draft(
  p_token   uuid,
  p_payload jsonb
)
RETURNS TABLE(id uuid, current_step smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.applications;
  v_email    text;
  v_step     smallint;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token_required';
  END IF;

  v_email := nullif(btrim(p_payload->>'email'), '');
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  v_step := GREATEST(1, LEAST(9, COALESCE((p_payload->>'current_step')::int, 1)))::smallint;

  SELECT * INTO v_existing
  FROM public.applications
  WHERE draft_token = p_token::text
  LIMIT 1;

  IF FOUND AND v_existing.is_draft = false THEN
    -- Submitted apps must go through the revisions flow, not draft save.
    RAISE EXCEPTION 'cannot_edit_submitted_application';
  END IF;

  IF FOUND THEN
    -- Preserve the higher step number so a back-then-save doesn't regress
    -- the resume point below what they've already completed.
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
      endorsements                = CASE WHEN p_payload ? 'endorsements'
                                         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'endorsements'))
                                         ELSE endorsements END,
      cdl_10_years                = NULLIF(p_payload->>'cdl_10_years','')::boolean,
      referral_source             = p_payload->>'referral_source',
      employers                   = COALESCE(p_payload->'employers', employers),
      employment_gaps             = NULLIF(p_payload->>'employment_gaps','')::boolean,
      employment_gaps_explanation = p_payload->>'employment_gaps_explanation',
      years_experience            = p_payload->>'years_experience',
      equipment_operated          = CASE WHEN p_payload ? 'equipment_operated'
                                         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'equipment_operated'))
                                         ELSE equipment_operated END,
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
      signed_date                 = p_payload->>'signed_date',
      current_step                = v_step,
      is_draft                    = true,
      updated_at                  = now()
    WHERE applications.id = v_existing.id;

    id := v_existing.id;
    current_step := v_step;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Insert new draft
  INSERT INTO public.applications (
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
    p_token::text, true, v_email,
    p_payload->>'first_name', p_payload->>'last_name',
    NULLIF(p_payload->>'dob','')::date, p_payload->>'phone',
    p_payload->>'address_street', p_payload->>'address_line2', p_payload->>'address_city',
    p_payload->>'address_state', p_payload->>'address_zip', p_payload->>'address_duration',
    p_payload->>'prev_address_street', p_payload->>'prev_address_line2', p_payload->>'prev_address_city',
    p_payload->>'prev_address_state', p_payload->>'prev_address_zip',
    p_payload->>'cdl_state', p_payload->>'cdl_number', p_payload->>'cdl_class',
    NULLIF(p_payload->>'cdl_expiration','')::date,
    CASE WHEN p_payload ? 'endorsements'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'endorsements'))
         ELSE NULL END,
    NULLIF(p_payload->>'cdl_10_years','')::boolean,
    p_payload->>'referral_source',
    COALESCE(p_payload->'employers', '[]'::jsonb),
    NULLIF(p_payload->>'employment_gaps','')::boolean,
    p_payload->>'employment_gaps_explanation',
    p_payload->>'years_experience',
    CASE WHEN p_payload ? 'equipment_operated'
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
    p_payload->>'signed_date',
    v_step
  )
  RETURNING applications.id, applications.current_step INTO id, current_step;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_application_draft(uuid, jsonb) TO anon, authenticated;
