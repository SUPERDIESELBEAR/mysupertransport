CREATE OR REPLACE FUNCTION public.move_revisions_to_pending(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_app record;
BEGIN
  IF NOT public.is_staff(v_actor) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT id, first_name, last_name, email, review_status, revision_count
  INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found';
  END IF;

  IF v_app.review_status <> 'revisions_requested' THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_actor_name
  FROM public.profiles WHERE id = v_actor;

  UPDATE public.applications
  SET review_status = 'pending',
      revision_requested_at = NULL,
      revision_request_message = NULL,
      revision_requested_by = NULL,
      pre_revision_status = NULL,
      updated_at = now()
  WHERE id = p_application_id;

  UPDATE public.application_resume_tokens
  SET used_at = now()
  WHERE application_id = p_application_id
    AND used_at IS NULL;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    v_actor_name,
    'application.revisions_moved_to_pending',
    'application',
    p_application_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', v_app.first_name, v_app.last_name)), ''), v_app.email),
    jsonb_build_object('previous_revision_count', v_app.revision_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_revisions_to_pending(uuid) TO authenticated;