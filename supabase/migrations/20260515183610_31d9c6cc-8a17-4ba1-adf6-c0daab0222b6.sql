-- ============================================================
-- Application correction requests (staff edits with applicant approval)
-- ============================================================

CREATE TYPE public.application_correction_status AS ENUM (
  'pending', 'approved', 'rejected', 'cancelled', 'expired'
);

CREATE TABLE public.application_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requested_by_staff_id uuid NOT NULL,
  requested_by_staff_name text,
  reason_for_changes text NOT NULL,
  courtesy_message text,
  status public.application_correction_status NOT NULL DEFAULT 'pending',
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  signed_typed_name text,
  signature_image_url text,
  signed_ip inet,
  signed_user_agent text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_acr_application ON public.application_correction_requests(application_id);
CREATE INDEX idx_acr_status ON public.application_correction_requests(status);
CREATE INDEX idx_acr_token ON public.application_correction_requests(token);

CREATE TRIGGER update_acr_updated_at
BEFORE UPDATE ON public.application_correction_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.application_correction_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.application_correction_requests(id) ON DELETE CASCADE,
  field_path text NOT NULL,
  field_label text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_acf_request ON public.application_correction_fields(request_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.application_correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_correction_fields   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read correction requests"
  ON public.application_correction_requests FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff can read correction fields"
  ON public.application_correction_fields FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Writes happen only via SECURITY DEFINER functions below.

-- ============================================================
-- Helpers
-- ============================================================

-- Whitelist of editable application columns (everything except SSN, signature,
-- consent checkboxes, system fields).
CREATE OR REPLACE FUNCTION public._app_correction_editable_columns()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'first_name','last_name','dob','phone','email',
    'address_street','address_line2','address_city','address_state','address_zip','address_duration',
    'prev_address_street','prev_address_line2','prev_address_city','prev_address_state','prev_address_zip',
    'cdl_state','cdl_number','cdl_class','cdl_expiration','cdl_10_years',
    'endorsements','referral_source',
    'employers','employment_gaps','employment_gaps_explanation',
    'years_experience','equipment_operated',
    'dot_accidents','dot_accidents_description',
    'moving_violations','moving_violations_description',
    'sap_process',
    'dl_front_url','dl_rear_url','medical_cert_url','medical_cert_expiration',
    'dot_positive_test_past_2yr','dot_return_to_duty_docs'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public._gen_correction_token()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+','-'), '/','_'), '=','');
$$;

-- ============================================================
-- Staff: submit a correction request
-- p_fields: jsonb array of { field_path, field_label, old_value, new_value }
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_application_correction(
  p_application_id uuid,
  p_reason text,
  p_courtesy_message text,
  p_fields jsonb
) RETURNS TABLE(request_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_staff_name text;
  v_token text;
  v_req_id uuid;
  v_field jsonb;
  v_path text;
  v_editable text[] := public._app_correction_editable_columns();
  v_app_label text;
BEGIN
  IF NOT public.is_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF p_fields IS NULL OR jsonb_array_length(p_fields) = 0 THEN
    RAISE EXCEPTION 'no_fields';
  END IF;

  -- Validate every field path is in the whitelist
  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    v_path := v_field->>'field_path';
    IF v_path IS NULL OR NOT (v_path = ANY(v_editable)) THEN
      RAISE EXCEPTION 'invalid_field: %', v_path;
    END IF;
  END LOOP;

  -- Block when there is already a pending request
  IF EXISTS (
    SELECT 1 FROM public.application_correction_requests
    WHERE application_id = p_application_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'pending_request_exists';
  END IF;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO v_staff_name
    FROM public.profiles WHERE user_id = v_actor;
  IF v_staff_name IS NULL OR length(v_staff_name) = 0 THEN v_staff_name := 'Staff'; END IF;

  v_token := public._gen_correction_token();

  INSERT INTO public.application_correction_requests (
    application_id, requested_by_staff_id, requested_by_staff_name,
    reason_for_changes, courtesy_message, token
  ) VALUES (
    p_application_id, v_actor, v_staff_name,
    trim(p_reason), nullif(trim(coalesce(p_courtesy_message,'')),''), v_token
  ) RETURNING id INTO v_req_id;

  INSERT INTO public.application_correction_fields (request_id, field_path, field_label, old_value, new_value)
  SELECT v_req_id,
         (f->>'field_path'),
         coalesce(f->>'field_label', f->>'field_path'),
         f->'old_value',
         f->'new_value'
  FROM jsonb_array_elements(p_fields) f;

  -- Audit log
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) || ' — ' || coalesce(email,'')
    INTO v_app_label FROM public.applications WHERE id = p_application_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_staff_name, 'application_correction_sent', 'application', p_application_id,
          coalesce(v_app_label, p_application_id::text),
          jsonb_build_object('request_id', v_req_id, 'field_count', jsonb_array_length(p_fields), 'reason', p_reason));

  request_id := v_req_id;
  token := v_token;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- Public: fetch correction by token (no auth)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_application_correction_by_token(p_token text)
RETURNS TABLE(
  request_id uuid,
  application_id uuid,
  applicant_first_name text,
  applicant_last_name text,
  requested_by_staff_name text,
  reason_for_changes text,
  courtesy_message text,
  status public.application_correction_status,
  sent_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  fields jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.id, r.application_id,
    a.first_name, a.last_name,
    r.requested_by_staff_name,
    r.reason_for_changes, r.courtesy_message,
    r.status, r.sent_at, r.expires_at, r.responded_at,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'field_path', f.field_path,
        'field_label', f.field_label,
        'old_value', f.old_value,
        'new_value', f.new_value
      ) ORDER BY f.field_label)
      FROM public.application_correction_fields f
      WHERE f.request_id = r.id
    ), '[]'::jsonb)
  FROM public.application_correction_requests r
  JOIN public.applications a ON a.id = r.application_id
  WHERE r.token = p_token
  LIMIT 1;
$$;

-- ============================================================
-- Public: approve correction (applies diff)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_application_correction(
  p_token text,
  p_signed_name text,
  p_signature_url text,
  p_meta jsonb
) RETURNS TABLE(request_id uuid, application_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Apply each field change. Casting via jsonb -> text -> column type.
  FOR v_field IN
    SELECT field_path, new_value FROM public.application_correction_fields WHERE request_id = v_req.id
  LOOP
    IF NOT (v_field.field_path = ANY(v_editable)) THEN CONTINUE; END IF;

    -- For arrays/jsonb columns, cast appropriately. The applications table has:
    --   endorsements text[], equipment_operated text[], employers jsonb,
    --   booleans, dates, text. We handle the common shapes.
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

  -- Audit
  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (NULL, trim(p_signed_name), 'application_correction_approved', 'application',
          v_req.application_id, trim(p_signed_name),
          jsonb_build_object('request_id', v_req.id, 'signed_ip', v_ip::text));

  -- Notify the requesting staff member
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
$$;

-- ============================================================
-- Public: reject correction
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_application_correction(
  p_token text,
  p_reason text,
  p_meta jsonb
) RETURNS TABLE(request_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req RECORD;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_ip inet;
BEGIN
  SELECT * INTO v_req
    FROM public.application_correction_requests
    WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  BEGIN v_ip := (v_meta->>'signed_ip')::inet; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  UPDATE public.application_correction_requests SET
    status = 'rejected',
    responded_at = now(),
    rejection_reason = nullif(trim(coalesce(p_reason,'')),''),
    signed_ip = v_ip,
    signed_user_agent = nullif(v_meta->>'signed_user_agent','')
  WHERE id = v_req.id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (NULL, 'Applicant', 'application_correction_rejected', 'application',
          v_req.application_id, v_req.application_id::text,
          jsonb_build_object('request_id', v_req.id, 'reason', p_reason, 'signed_ip', v_ip::text));

  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (
    v_req.requested_by_staff_id,
    'Correction rejected',
    'The applicant rejected your requested corrections.' ||
      coalesce(' Reason: ' || nullif(trim(coalesce(p_reason,'')),''), ''),
    'application_correction_response', 'in_app',
    '/management?application=' || v_req.application_id::text
  );

  request_id := v_req.id;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- Staff: cancel pending correction
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_application_correction(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_req RECORD;
BEGIN
  IF NOT public.is_staff(v_actor) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_req FROM public.application_correction_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  UPDATE public.application_correction_requests SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_actor
  WHERE id = p_request_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, 'application_correction_cancelled', 'application',
          v_req.application_id, v_req.application_id::text,
          jsonb_build_object('request_id', p_request_id));
END;
$$;

-- ============================================================
-- Grants for public RPCs (anon + authenticated)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_application_correction_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_application_correction(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_application_correction(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_application_correction(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_application_correction(uuid) TO authenticated;