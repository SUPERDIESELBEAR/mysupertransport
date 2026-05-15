-- 1) Events table
CREATE TABLE public.pei_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pei_request_id uuid NOT NULL REFERENCES public.pei_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('opened_response_link','opened_release_link','submitted')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  metadata jsonb
);

CREATE INDEX idx_pei_request_events_request_time
  ON public.pei_request_events (pei_request_id, occurred_at DESC);

ALTER TABLE public.pei_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view PEI events"
  ON public.pei_request_events FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- No INSERT/UPDATE/DELETE policy: only service-role (edge functions) can write.

-- 2) Signature provenance on responses
ALTER TABLE public.pei_responses
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_ip inet,
  ADD COLUMN IF NOT EXISTS signed_user_agent text;

-- 3) Extend submit_pei_response RPC with optional p_meta
CREATE OR REPLACE FUNCTION public.submit_pei_response(
  p_token uuid,
  p_response jsonb,
  p_accidents jsonb DEFAULT '[]'::jsonb,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pei_requests;
  v_response_id uuid;
  v_acc jsonb;
BEGIN
  SELECT * INTO v_request
  FROM public.pei_requests
  WHERE response_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_request.response_token_used = true THEN RAISE EXCEPTION 'token_already_used'; END IF;
  IF v_request.status IN ('completed','gfe_documented') THEN RAISE EXCEPTION 'request_already_closed'; END IF;

  INSERT INTO public.pei_responses (
    pei_request_id,
    was_employed, dates_accurate, actual_start_date, actual_end_date,
    safe_and_efficient,
    equipment_straight_truck, equipment_tractor_semi, equipment_bus,
    reason_for_leaving, reason_detail,
    had_accidents,
    drug_alcohol_violation, failed_rehab, post_rehab_violations, drug_alcohol_notes,
    rating_quality_of_work, rating_cooperation, rating_safety_habits,
    rating_personal_habits, rating_driving_skills, rating_attitude,
    trailer_van, trailer_flatbed, trailer_reefer, trailer_cargo_tank,
    trailer_triples, trailer_doubles, trailer_na,
    responder_name, responder_title, responder_company, responder_phone,
    responder_email, responder_city, responder_state, responder_postal_code,
    responder_signature_data, date_signed, submission_method,
    signed_at, signed_ip, signed_user_agent
  ) VALUES (
    v_request.id,
    NULLIF(p_response->>'was_employed','')::boolean,
    NULLIF(p_response->>'dates_accurate','')::boolean,
    NULLIF(p_response->>'actual_start_date','')::date,
    NULLIF(p_response->>'actual_end_date','')::date,
    NULLIF(p_response->>'safe_and_efficient','')::boolean,
    COALESCE(NULLIF(p_response->>'equipment_straight_truck','')::boolean, false),
    COALESCE(NULLIF(p_response->>'equipment_tractor_semi','')::boolean, false),
    COALESCE(NULLIF(p_response->>'equipment_bus','')::boolean, false),
    NULLIF(p_response->>'reason_for_leaving','')::pei_leaving_reason,
    p_response->>'reason_detail',
    NULLIF(p_response->>'had_accidents','')::boolean,
    NULLIF(p_response->>'drug_alcohol_violation','')::boolean,
    NULLIF(p_response->>'failed_rehab','')::boolean,
    NULLIF(p_response->>'post_rehab_violations','')::boolean,
    p_response->>'drug_alcohol_notes',
    NULLIF(p_response->>'rating_quality_of_work','')::pei_performance_rating,
    NULLIF(p_response->>'rating_cooperation','')::pei_performance_rating,
    NULLIF(p_response->>'rating_safety_habits','')::pei_performance_rating,
    NULLIF(p_response->>'rating_personal_habits','')::pei_performance_rating,
    NULLIF(p_response->>'rating_driving_skills','')::pei_performance_rating,
    NULLIF(p_response->>'rating_attitude','')::pei_performance_rating,
    COALESCE(NULLIF(p_response->>'trailer_van','')::boolean, false),
    COALESCE(NULLIF(p_response->>'trailer_flatbed','')::boolean, false),
    COALESCE(NULLIF(p_response->>'trailer_reefer','')::boolean, false),
    COALESCE(NULLIF(p_response->>'trailer_cargo_tank','')::boolean, false),
    COALESCE(NULLIF(p_response->>'trailer_triples','')::boolean, false),
    COALESCE(NULLIF(p_response->>'trailer_doubles','')::boolean, false),
    COALESCE(NULLIF(p_response->>'trailer_na','')::boolean, false),
    COALESCE(NULLIF(p_response->>'responder_name',''), 'Unknown'),
    p_response->>'responder_title',
    p_response->>'responder_company',
    p_response->>'responder_phone',
    p_response->>'responder_email',
    p_response->>'responder_city',
    p_response->>'responder_state',
    p_response->>'responder_postal_code',
    p_response->>'responder_signature_data',
    COALESCE(NULLIF(p_response->>'date_signed','')::timestamptz, now()),
    COALESCE(NULLIF(p_response->>'submission_method',''), 'web_form'),
    COALESCE(NULLIF(p_meta->>'signed_at','')::timestamptz, now()),
    NULLIF(p_meta->>'signed_ip','')::inet,
    NULLIF(p_meta->>'signed_user_agent','')
  )
  RETURNING id INTO v_response_id;

  IF jsonb_typeof(p_accidents) = 'array' THEN
    FOR v_acc IN SELECT * FROM jsonb_array_elements(p_accidents)
    LOOP
      INSERT INTO public.pei_accidents (
        pei_response_id, accident_date, location_city_state,
        number_of_injuries, number_of_fatalities, hazmat_spill
      ) VALUES (
        v_response_id,
        NULLIF(v_acc->>'accident_date','')::date,
        v_acc->>'location_city_state',
        NULLIF(v_acc->>'number_of_injuries','')::int,
        NULLIF(v_acc->>'number_of_fatalities','')::int,
        COALESCE(NULLIF(v_acc->>'hazmat_spill','')::boolean, false)
      );
    END LOOP;
  END IF;

  RETURN v_response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_pei_response(uuid, jsonb, jsonb, jsonb) TO anon, authenticated;