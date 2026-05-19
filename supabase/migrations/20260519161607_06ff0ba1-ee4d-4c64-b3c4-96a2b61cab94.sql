
CREATE OR REPLACE FUNCTION public.approve_application_correction(p_token text, p_signed_name text, p_signature_url text, p_meta jsonb)
RETURNS TABLE(request_id uuid, application_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req RECORD;
  v_field RECORD;
  v_sql text;
  v_editable text[] := public._app_correction_editable_columns();
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_ip inet;
BEGIN
  SELECT * INTO v_req
    FROM public.application_correction_requests
    WHERE token = p_token
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF v_req.expires_at < now() THEN
    UPDATE public.application_correction_requests SET status = 'expired' WHERE id = v_req.id;
    RAISE EXCEPTION 'expired';
  END IF;
  IF p_signed_name IS NULL OR length(trim(p_signed_name)) < 2 THEN
    RAISE EXCEPTION 'signature_required';
  END IF;

  BEGIN v_ip := (v_meta->>'signed_ip')::inet; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  FOR v_field IN
    SELECT f.field_path, f.new_value
    FROM public.application_correction_fields f
    WHERE f.request_id = v_req.id
  LOOP
    IF NOT (v_field.field_path = ANY(v_editable)) THEN CONTINUE; END IF;

    IF v_field.field_path IN ('endorsements','equipment_operated') THEN
      v_sql := format(
        'UPDATE public.applications SET %I = ARRAY(SELECT jsonb_array_elements_text($1)) WHERE id = $2',
        v_field.field_path
      );
      EXECUTE v_sql USING coalesce(v_field.new_value, '[]'::jsonb), v_req.application_id;
    ELSIF v_field.field_path = 'employers' THEN
      EXECUTE 'UPDATE public.applications SET employers = $1 WHERE id = $2'
        USING coalesce(v_field.new_value, '[]'::jsonb), v_req.application_id;
    ELSIF v_field.field_path IN (
      'cdl_10_years','employment_gaps','dot_accidents','moving_violations',
      'sap_process','dot_positive_test_past_2yr','dot_return_to_duty_docs'
    ) THEN
      v_sql := format('UPDATE public.applications SET %I = ($1)::boolean WHERE id = $2', v_field.field_path);
      EXECUTE v_sql USING (v_field.new_value #>> '{}'), v_req.application_id;
    ELSIF v_field.field_path IN ('dob','cdl_expiration','medical_cert_expiration') THEN
      v_sql := format('UPDATE public.applications SET %I = nullif(($1),'''')::date WHERE id = $2', v_field.field_path);
      EXECUTE v_sql USING (v_field.new_value #>> '{}'), v_req.application_id;
    ELSE
      v_sql := format('UPDATE public.applications SET %I = ($1) WHERE id = $2', v_field.field_path);
      EXECUTE v_sql USING (v_field.new_value #>> '{}'), v_req.application_id;
    END IF;
  END LOOP;

  UPDATE public.application_correction_requests SET
    status = 'approved',
    responded_at = now(),
    signed_typed_name = trim(p_signed_name),
    signature_image_url = p_signature_url,
    signed_ip = v_ip,
    signed_user_agent = nullif(v_meta->>'signed_user_agent','')
  WHERE id = v_req.id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (NULL, trim(p_signed_name), 'application_correction_approved', 'application',
          v_req.application_id, trim(p_signed_name),
          jsonb_build_object('request_id', v_req.id, 'signed_ip', v_ip::text));

  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (
    v_req.requested_by_staff_id,
    'Correction approved ✓',
    trim(p_signed_name) || ' approved your requested corrections to their application.',
    'application_correction_response', 'in_app',
    '/management?application=' || v_req.application_id::text
  );

  request_id := v_req.id;
  application_id := v_req.application_id;
  RETURN NEXT;
END;
$function$;
