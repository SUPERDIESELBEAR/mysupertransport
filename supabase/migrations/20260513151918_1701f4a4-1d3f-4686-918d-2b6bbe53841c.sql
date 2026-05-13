
-- ============================================================================
-- PEI Module — Phase 1 Schema
-- Regulatory Authority: 49 CFR §391.23
-- ============================================================================

-- 1. ENUMS
CREATE TYPE public.pei_request_status AS ENUM (
  'pending', 'sent', 'follow_up_sent', 'final_notice_sent', 'completed', 'gfe_documented'
);

CREATE TYPE public.pei_gfe_reason AS ENUM (
  'no_response', 'refused', 'not_located', 'no_longer_in_business',
  'not_dot_regulated', 'owner_of_company', 'other'
);

CREATE TYPE public.pei_performance_rating AS ENUM ('excellent', 'good', 'poor');

CREATE TYPE public.pei_leaving_reason AS ENUM ('discharged', 'laid_off', 'resigned', 'other');

CREATE TYPE public.pei_applicant_status AS ENUM ('not_started', 'in_progress', 'complete');

-- 2. TABLES

CREATE TABLE public.pei_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_name TEXT NOT NULL,
  employer_contact_name TEXT,
  employer_contact_email TEXT,
  employer_phone TEXT,
  employer_address TEXT,
  employer_city TEXT,
  employer_state TEXT,
  employer_country TEXT DEFAULT 'United States',
  employer_postal_code TEXT,
  employment_start_date DATE,
  employment_end_date DATE,
  is_dot_regulated BOOLEAN NOT NULL DEFAULT true,
  status public.pei_request_status NOT NULL DEFAULT 'pending',
  date_sent TIMESTAMPTZ,
  date_follow_up_sent TIMESTAMPTZ,
  date_final_notice_sent TIMESTAMPTZ,
  date_response_received TIMESTAMPTZ,
  date_gfe_created TIMESTAMPTZ,
  gfe_reason public.pei_gfe_reason,
  gfe_other_reason TEXT,
  gfe_signed_by_staff_id UUID,
  gfe_signed_by_name TEXT,
  gfe_document_url TEXT,
  response_token UUID NOT NULL DEFAULT gen_random_uuid(),
  response_token_used BOOLEAN NOT NULL DEFAULT false,
  sent_by_staff_id UUID,
  response_document_url TEXT,
  deadline_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pei_requests_application ON public.pei_requests(application_id);
CREATE INDEX idx_pei_requests_status ON public.pei_requests(status);
CREATE INDEX idx_pei_requests_deadline ON public.pei_requests(deadline_date)
  WHERE status IN ('sent', 'follow_up_sent', 'final_notice_sent');
CREATE UNIQUE INDEX idx_pei_requests_token ON public.pei_requests(response_token);

CREATE TABLE public.pei_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pei_request_id UUID NOT NULL UNIQUE REFERENCES public.pei_requests(id) ON DELETE CASCADE,
  was_employed BOOLEAN,
  dates_accurate BOOLEAN,
  actual_start_date DATE,
  actual_end_date DATE,
  safe_and_efficient BOOLEAN,
  equipment_straight_truck BOOLEAN DEFAULT false,
  equipment_tractor_semi BOOLEAN DEFAULT false,
  equipment_bus BOOLEAN DEFAULT false,
  reason_for_leaving public.pei_leaving_reason,
  reason_detail TEXT,
  had_accidents BOOLEAN DEFAULT false,
  drug_alcohol_violation BOOLEAN DEFAULT false,
  failed_rehab BOOLEAN DEFAULT false,
  post_rehab_violations BOOLEAN DEFAULT false,
  drug_alcohol_notes TEXT,
  rating_quality_of_work public.pei_performance_rating,
  rating_cooperation public.pei_performance_rating,
  rating_safety_habits public.pei_performance_rating,
  rating_personal_habits public.pei_performance_rating,
  rating_driving_skills public.pei_performance_rating,
  rating_attitude public.pei_performance_rating,
  trailer_van BOOLEAN DEFAULT false,
  trailer_flatbed BOOLEAN DEFAULT false,
  trailer_reefer BOOLEAN DEFAULT false,
  trailer_cargo_tank BOOLEAN DEFAULT false,
  trailer_triples BOOLEAN DEFAULT false,
  trailer_doubles BOOLEAN DEFAULT false,
  trailer_na BOOLEAN DEFAULT false,
  responder_name TEXT NOT NULL,
  responder_title TEXT,
  responder_company TEXT,
  responder_phone TEXT,
  responder_email TEXT,
  responder_city TEXT,
  responder_state TEXT,
  responder_postal_code TEXT,
  responder_signature_data TEXT,
  date_signed DATE,
  submission_method TEXT DEFAULT 'online',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pei_responses_request ON public.pei_responses(pei_request_id);

CREATE TABLE public.pei_accidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pei_response_id UUID NOT NULL REFERENCES public.pei_responses(id) ON DELETE CASCADE,
  accident_date DATE,
  location_city_state TEXT,
  number_of_injuries INTEGER DEFAULT 0,
  number_of_fatalities INTEGER DEFAULT 0,
  hazmat_spill BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pei_accidents_response ON public.pei_accidents(pei_response_id);

-- 3. APPLICATIONS COLUMNS
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS pei_status public.pei_applicant_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS pei_deadline DATE,
  ADD COLUMN IF NOT EXISTS driver_rights_notice_acknowledged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_rights_notice_date TIMESTAMPTZ;

-- 4. TRIGGERS

-- updated_at on pei_requests
CREATE TRIGGER trg_pei_requests_updated_at
  BEFORE UPDATE ON public.pei_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Set deadline 30 days after first send
CREATE OR REPLACE FUNCTION public.set_pei_deadline()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.date_sent IS NOT NULL AND OLD.date_sent IS NULL THEN
    NEW.deadline_date := (NEW.date_sent::date + INTERVAL '30 days')::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pei_set_deadline
  BEFORE UPDATE ON public.pei_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pei_deadline();

-- Roll request statuses up to applications.pei_status
CREATE OR REPLACE FUNCTION public.update_application_pei_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total INTEGER;
  v_done INTEGER;
  v_any_active INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.pei_requests WHERE application_id = NEW.application_id;
  SELECT COUNT(*) INTO v_done FROM public.pei_requests
    WHERE application_id = NEW.application_id AND status IN ('completed', 'gfe_documented');
  SELECT COUNT(*) INTO v_any_active FROM public.pei_requests
    WHERE application_id = NEW.application_id AND status <> 'pending';

  IF v_total > 0 AND v_done = v_total THEN
    UPDATE public.applications SET pei_status = 'complete' WHERE id = NEW.application_id;
  ELSIF v_done > 0 OR v_any_active > 0 THEN
    UPDATE public.applications SET pei_status = 'in_progress' WHERE id = NEW.application_id;
  ELSE
    UPDATE public.applications SET pei_status = 'not_started' WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_application_pei_status
  AFTER INSERT OR UPDATE OF status ON public.pei_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_application_pei_status();

-- Auto-complete request when a response arrives
CREATE OR REPLACE FUNCTION public.complete_pei_request_on_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pei_requests
  SET status = 'completed',
      date_response_received = now(),
      response_token_used = true
  WHERE id = NEW.pei_request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complete_request_on_response
  AFTER INSERT ON public.pei_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_pei_request_on_response();

-- 5. RPC HELPERS

CREATE OR REPLACE FUNCTION public.get_pei_queue()
RETURNS TABLE (
  request_id UUID,
  application_id UUID,
  applicant_first_name TEXT,
  applicant_last_name TEXT,
  employer_name TEXT,
  employer_city TEXT,
  employer_state TEXT,
  status public.pei_request_status,
  date_sent TIMESTAMPTZ,
  deadline_date DATE,
  days_remaining INTEGER,
  is_overdue BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.application_id, a.first_name, a.last_name,
    pr.employer_name, pr.employer_city, pr.employer_state,
    pr.status, pr.date_sent, pr.deadline_date,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date - CURRENT_DATE ELSE NULL END,
    CASE WHEN pr.deadline_date IS NOT NULL AND pr.deadline_date < CURRENT_DATE THEN true ELSE false END
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  WHERE pr.status NOT IN ('completed', 'gfe_documented')
  ORDER BY
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date ELSE '2099-12-31'::date END ASC,
    pr.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_application_pei_summary(p_application_id UUID)
RETURNS TABLE (
  request_id UUID,
  employer_name TEXT,
  employer_city TEXT,
  employer_state TEXT,
  employment_start_date DATE,
  employment_end_date DATE,
  is_dot_regulated BOOLEAN,
  status public.pei_request_status,
  date_sent TIMESTAMPTZ,
  deadline_date DATE,
  days_remaining INTEGER,
  gfe_reason public.pei_gfe_reason,
  has_response BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.employer_name, pr.employer_city, pr.employer_state,
    pr.employment_start_date, pr.employment_end_date, pr.is_dot_regulated,
    pr.status, pr.date_sent, pr.deadline_date,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date - CURRENT_DATE ELSE NULL END,
    pr.gfe_reason,
    EXISTS (SELECT 1 FROM public.pei_responses r WHERE r.pei_request_id = pr.id)
  FROM public.pei_requests pr
  WHERE pr.application_id = p_application_id
  ORDER BY pr.employment_end_date DESC NULLS LAST, pr.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pei_requests_needing_action()
RETURNS TABLE (
  request_id UUID,
  application_id UUID,
  applicant_first_name TEXT,
  applicant_last_name TEXT,
  employer_name TEXT,
  employer_contact_email TEXT,
  status public.pei_request_status,
  date_sent TIMESTAMPTZ,
  deadline_date DATE,
  days_since_sent INTEGER,
  action_needed TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT pr.id, pr.application_id, a.first_name, a.last_name,
    pr.employer_name, pr.employer_contact_email, pr.status, pr.date_sent, pr.deadline_date,
    (CURRENT_DATE - pr.date_sent::date)::INTEGER AS days_since_sent,
    CASE
      WHEN pr.status IN ('sent', 'follow_up_sent', 'final_notice_sent')
        AND (CURRENT_DATE - pr.date_sent::date) >= 30 THEN 'auto_gfe'
      WHEN pr.status IN ('sent', 'follow_up_sent')
        AND (CURRENT_DATE - pr.date_sent::date) >= 25 THEN 'final_notice'
      WHEN pr.status = 'sent'
        AND (CURRENT_DATE - pr.date_sent::date) >= 15 THEN 'follow_up'
      ELSE NULL
    END AS action_needed
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  WHERE pr.status IN ('sent', 'follow_up_sent', 'final_notice_sent')
    AND pr.date_sent IS NOT NULL
    AND (CURRENT_DATE - pr.date_sent::date) >= 15;
END;
$$;

-- 6. RLS

ALTER TABLE public.pei_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pei_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pei_accidents ENABLE ROW LEVEL SECURITY;

-- pei_requests
CREATE POLICY "Staff view PEI requests" ON public.pei_requests
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert PEI requests" ON public.pei_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff update PEI requests" ON public.pei_requests
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Management delete PEI requests" ON public.pei_requests
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
  );

-- pei_responses
CREATE POLICY "Staff view PEI responses" ON public.pei_responses
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert PEI responses" ON public.pei_responses
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- Public can submit a response only when token is unused and request is in flight.
-- Anonymous role only; no select/update/delete.
CREATE POLICY "Public submit PEI response via token" ON public.pei_responses
  FOR INSERT TO anon WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pei_requests pr
      WHERE pr.id = pei_request_id
        AND pr.response_token_used = false
        AND pr.status IN ('sent', 'follow_up_sent', 'final_notice_sent')
    )
  );

CREATE POLICY "Management delete PEI responses" ON public.pei_responses
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
  );

-- pei_accidents
CREATE POLICY "Staff view PEI accidents" ON public.pei_accidents
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert PEI accidents" ON public.pei_accidents
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Public submit PEI accidents via response" ON public.pei_accidents
  FOR INSERT TO anon WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pei_responses r
      JOIN public.pei_requests pr ON pr.id = r.pei_request_id
      WHERE r.id = pei_response_id
        AND pr.status IN ('completed', 'sent', 'follow_up_sent', 'final_notice_sent')
    )
  );

CREATE POLICY "Management delete PEI accidents" ON public.pei_accidents
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'owner')
  );

-- 7. STORAGE BUCKET

INSERT INTO storage.buckets (id, name, public)
VALUES ('pei-documents', 'pei-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff manage PEI documents - select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'pei-documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff manage PEI documents - insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pei-documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff manage PEI documents - update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'pei-documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff manage PEI documents - delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'pei-documents' AND public.is_staff(auth.uid()));
