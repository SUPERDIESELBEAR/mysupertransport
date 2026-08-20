CREATE OR REPLACE FUNCTION public.manage_claim_flag(
  p_action text,
  p_load_id uuid DEFAULT NULL,
  p_claim_id uuid DEFAULT NULL,
  p_flag_level claim_flag_level DEFAULT NULL,
  p_claim_type claim_type DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_reported_by_contact text DEFAULT NULL,
  p_estimated_amount numeric DEFAULT NULL,
  p_documentation_url text DEFAULT NULL,
  p_resolution text DEFAULT NULL,
  p_resolution_notes text DEFAULT NULL,
  p_actual_amount numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.manage_claim_flag(text, uuid, uuid, claim_flag_level, claim_type, text, text, numeric, text, text, text, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.manage_claim_flag(text, uuid, uuid, claim_flag_level, claim_type, text, text, numeric, text, text, text, numeric, text) TO authenticated;