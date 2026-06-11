CREATE OR REPLACE FUNCTION public.submit_application_draft(
  p_token uuid,
  p_payload jsonb,
  p_ssn_encrypted text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_payload jsonb;
  v_existing public.applications;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token_required';
  END IF;

  -- Pre-check: row must exist and still be a draft
  SELECT * INTO v_existing
  FROM public.applications
  WHERE draft_token = p_token::text
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_existing.is_draft = false THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  -- Inject ssn_encrypted + force current_step so save_application_draft is happy
  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('current_step', 9);
  IF p_ssn_encrypted IS NOT NULL AND length(btrim(p_ssn_encrypted)) > 0 THEN
    v_payload := v_payload || jsonb_build_object('ssn_encrypted', p_ssn_encrypted);
  END IF;

  -- Re-use existing save logic to write every field (keeps array guards, title-casing-ready)
  SELECT id INTO v_id FROM public.save_application_draft(p_token, v_payload);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Flip to submitted
  UPDATE public.applications
     SET is_draft     = false,
         submitted_at = now(),
         review_status = COALESCE(review_status, 'pending'::review_status),
         updated_at   = now()
   WHERE id = v_id
     AND is_draft = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_application_draft(uuid, jsonb, text) TO anon, authenticated, service_role;

-- One-time recovery for Emma Mueller's stuck draft (a7a1fb75-7e87-4c24-a300-b3f71156ee6b).
-- All fields were saved (signature, typed name, signed date present); only the
-- final is_draft/submitted_at flip was blocked by the now-fixed RLS path.
UPDATE public.applications
   SET is_draft     = false,
       submitted_at = COALESCE(submitted_at, updated_at),
       review_status = COALESCE(review_status, 'pending'::review_status),
       updated_at   = now()
 WHERE id = 'a7a1fb75-7e87-4c24-a300-b3f71156ee6b'
   AND is_draft = true;