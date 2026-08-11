CREATE OR REPLACE FUNCTION public.submit_application_draft(p_token uuid, p_payload jsonb, p_ssn_encrypted text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_payload jsonb;
  v_existing public.applications;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token_required';
  END IF;

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

  v_payload := COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('current_step', 9);
  IF p_ssn_encrypted IS NOT NULL AND length(btrim(p_ssn_encrypted)) > 0 THEN
    v_payload := v_payload || jsonb_build_object('ssn_encrypted', p_ssn_encrypted);
  END IF;

  SELECT id INTO v_id FROM public.save_application_draft(p_token, v_payload);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Flip to submitted. A draft that was reopened for revisions returns to
  -- pending so staff get their review actions back; pre_revision_status is
  -- preserved so a previously approved application routes to re-approval.
  UPDATE public.applications
     SET is_draft     = false,
         submitted_at = now(),
         review_status = CASE
           WHEN review_status IS NULL THEN 'pending'::review_status
           WHEN review_status = 'revisions_requested'::review_status THEN 'pending'::review_status
           ELSE review_status
         END,
         updated_at   = now()
   WHERE id = v_id
     AND is_draft = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  RETURN v_id;
END;
$function$;