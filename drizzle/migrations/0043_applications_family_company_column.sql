-- Stage 3, pass 3a: the carrier column and the backfill.
-- No policy change, no writer change, no behaviour change.

-- STEP 1 — the two roots.
ALTER TABLE public.applications
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.application_invites
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

-- STEP 2 — the nine children.
ALTER TABLE public.application_correction_requests
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.application_correction_fields
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.application_document_history
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.application_interview_notes
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.application_revision_attachments
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.pei_requests
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.pei_responses
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.pei_accidents
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;
ALTER TABLE public.pei_request_events
  ADD COLUMN company_id uuid REFERENCES public.carrier_profile(id) ON DELETE RESTRICT;

-- Derivation: a child's carrier is ALWAYS its parent's. Whatever a caller supplies is
-- overwritten, so a cross-carrier child cannot be stored. TG_ARGV[0] is the parent table,
-- TG_ARGV[1] the child's foreign-key column.
CREATE OR REPLACE FUNCTION public.stamp_child_company_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_parent text := TG_ARGV[0];
  v_fk     text := TG_ARGV[1];
  v_key    uuid;
  v_company uuid;
BEGIN
  v_key := nullif(to_jsonb(NEW) ->> v_fk, '')::uuid;
  IF v_key IS NULL THEN
    NEW.company_id := NULL;
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', v_parent)
    INTO v_company USING v_key;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.application_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('applications', 'application_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.application_correction_fields
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('application_correction_requests', 'request_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.application_document_history
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('applications', 'application_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.application_interview_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('applications', 'application_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.application_revision_attachments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('applications', 'application_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.pei_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('applications', 'application_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.pei_responses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('pei_requests', 'pei_request_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.pei_accidents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('pei_responses', 'pei_response_id');
CREATE TRIGGER trg_stamp_company_from_parent
  BEFORE INSERT OR UPDATE ON public.pei_request_events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_company_from_parent('pei_requests', 'pei_request_id');

-- Backfill. The family's existing triggers are suspended for the duration: this is a
-- column stamp, not an edit, and firing them would bump updated_at, log correction and
-- attachment events, re-derive PEI deadlines and statuses, and be refused outright by
-- application_document_history's append-only guard. Foreign-key triggers are internal and
-- stay armed throughout. Re-armed below, in the same transaction.
ALTER TABLE public.applications DISABLE TRIGGER USER;
ALTER TABLE public.application_invites DISABLE TRIGGER USER;
ALTER TABLE public.application_correction_requests DISABLE TRIGGER USER;
ALTER TABLE public.application_correction_fields DISABLE TRIGGER USER;
ALTER TABLE public.application_document_history DISABLE TRIGGER USER;
ALTER TABLE public.application_interview_notes DISABLE TRIGGER USER;
ALTER TABLE public.application_revision_attachments DISABLE TRIGGER USER;
ALTER TABLE public.pei_requests DISABLE TRIGGER USER;
ALTER TABLE public.pei_responses DISABLE TRIGGER USER;
ALTER TABLE public.pei_accidents DISABLE TRIGGER USER;
ALTER TABLE public.pei_request_events DISABLE TRIGGER USER;

-- Parents before children, so every derivation has something to read.
-- Safe today and only today: exactly one carrier_profile row exists.
UPDATE public.applications SET company_id = (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365')
  WHERE company_id IS NULL;
UPDATE public.application_invites SET company_id = (SELECT id FROM public.carrier_profile WHERE usdot_number = '2309365')
  WHERE company_id IS NULL;

UPDATE public.application_correction_requests c SET company_id = p.company_id
  FROM public.applications p WHERE p.id = c.application_id;
UPDATE public.application_correction_fields c SET company_id = p.company_id
  FROM public.application_correction_requests p WHERE p.id = c.request_id;
UPDATE public.application_document_history c SET company_id = p.company_id
  FROM public.applications p WHERE p.id = c.application_id;
UPDATE public.application_interview_notes c SET company_id = p.company_id
  FROM public.applications p WHERE p.id = c.application_id;
UPDATE public.application_revision_attachments c SET company_id = p.company_id
  FROM public.applications p WHERE p.id = c.application_id;
UPDATE public.pei_requests c SET company_id = p.company_id
  FROM public.applications p WHERE p.id = c.application_id;
UPDATE public.pei_responses c SET company_id = p.company_id
  FROM public.pei_requests p WHERE p.id = c.pei_request_id;
UPDATE public.pei_accidents c SET company_id = p.company_id
  FROM public.pei_responses p WHERE p.id = c.pei_response_id;
UPDATE public.pei_request_events c SET company_id = p.company_id
  FROM public.pei_requests p WHERE p.id = c.pei_request_id;

ALTER TABLE public.applications ENABLE TRIGGER USER;
ALTER TABLE public.application_invites ENABLE TRIGGER USER;
ALTER TABLE public.application_correction_requests ENABLE TRIGGER USER;
ALTER TABLE public.application_correction_fields ENABLE TRIGGER USER;
ALTER TABLE public.application_document_history ENABLE TRIGGER USER;
ALTER TABLE public.application_interview_notes ENABLE TRIGGER USER;
ALTER TABLE public.application_revision_attachments ENABLE TRIGGER USER;
ALTER TABLE public.pei_requests ENABLE TRIGGER USER;
ALTER TABLE public.pei_responses ENABLE TRIGGER USER;
ALTER TABLE public.pei_accidents ENABLE TRIGGER USER;
ALTER TABLE public.pei_request_events ENABLE TRIGGER USER;

CREATE INDEX IF NOT EXISTS idx_applications_company ON public.applications(company_id);
CREATE INDEX IF NOT EXISTS idx_application_invites_company ON public.application_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_application_correction_requests_company ON public.application_correction_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_application_correction_fields_company ON public.application_correction_fields(company_id);
CREATE INDEX IF NOT EXISTS idx_application_document_history_company ON public.application_document_history(company_id);
CREATE INDEX IF NOT EXISTS idx_application_interview_notes_company ON public.application_interview_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_application_revision_attachments_company ON public.application_revision_attachments(company_id);
CREATE INDEX IF NOT EXISTS idx_pei_requests_company ON public.pei_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_pei_responses_company ON public.pei_responses(company_id);
CREATE INDEX IF NOT EXISTS idx_pei_accidents_company ON public.pei_accidents(company_id);
CREATE INDEX IF NOT EXISTS idx_pei_request_events_company ON public.pei_request_events(company_id);