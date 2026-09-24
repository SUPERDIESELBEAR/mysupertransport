-- Previous-employer requests: attribution, withdraw-instead-of-delete, and
-- status-mismatch visibility.
--
-- WHY. A PEI request for application c815e1bd (Marquis Bowie) was created,
-- sent on 2026-08-05, then deleted. Nothing recorded who did any of it, the
-- delete cascaded its tracking events away, and the application was left
-- reading pei_status = in_progress with no request behind it for seven weeks.
-- Three changes: every create/status change/withdraw lands in audit_log; a
-- hard DELETE is refused so the record can never vanish again; the PEI status
-- rollup and the staff queue ignore withdrawn rows so a withdrawal reads as
-- "not started" rather than as progress that does not exist.
--
-- Additive only: new nullable columns, new trigger functions, and in-place
-- replacements of two existing functions whose signatures are unchanged.

-- 1. Soft-delete columns -----------------------------------------------------
ALTER TABLE public.pei_requests
  ADD COLUMN IF NOT EXISTS withdrawn_at      timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by      uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_by_name text,
  ADD COLUMN IF NOT EXISTS withdrawn_reason  text;

COMMENT ON COLUMN public.pei_requests.withdrawn_at IS
  'Set when staff withdraw a request instead of deleting it. Withdrawn rows are excluded from the PEI status rollup, the staff queue and the auto-cadence, but are kept and readable.';

CREATE INDEX IF NOT EXISTS idx_pei_requests_application_live
  ON public.pei_requests (application_id)
  WHERE withdrawn_at IS NULL;

-- 2. Attribution -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_pei_request_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor  uuid := auth.uid();
  v_action text;
  v_meta   jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'pei_request_created';
    v_meta := jsonb_build_object(
      'application_id', NEW.application_id,
      'employer_email', NEW.employer_contact_email,
      'status', NEW.status::text
    );
  ELSIF NEW.withdrawn_at IS NOT NULL AND OLD.withdrawn_at IS NULL THEN
    v_action := 'pei_request_withdrawn';
    v_meta := jsonb_build_object(
      'application_id', NEW.application_id,
      'status_when_withdrawn', NEW.status::text,
      'reason', NULLIF(btrim(coalesce(NEW.withdrawn_reason, '')), '')
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := 'pei_request_status_changed';
    v_meta := jsonb_build_object(
      'application_id', NEW.application_id,
      'from', OLD.status::text,
      'to', NEW.status::text,
      'employer_email', NEW.employer_contact_email
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log
    (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor,
    CASE WHEN v_actor IS NULL THEN 'System (automatic)' ELSE public._audit_actor_name(v_actor) END,
    v_action,
    'pei_request',
    NEW.id,
    NEW.employer_name,
    v_meta
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_pei_request_audit ON public.pei_requests;
CREATE TRIGGER trg_log_pei_request_audit
  AFTER INSERT OR UPDATE OF status, withdrawn_at ON public.pei_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_pei_request_audit();

-- 3. A request can no longer be erased --------------------------------------
CREATE OR REPLACE FUNCTION public.refuse_pei_request_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION
    'A previous-employer request cannot be deleted. Withdraw it instead so the record and its history are kept (employer: %).',
    OLD.employer_name
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_pei_request_delete ON public.pei_requests;
CREATE TRIGGER trg_refuse_pei_request_delete
  BEFORE DELETE ON public.pei_requests
  FOR EACH ROW EXECUTE FUNCTION public.refuse_pei_request_delete();

-- 4. Withdrawn rows are not progress ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_application_pei_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total INTEGER;
  v_done INTEGER;
  v_any_active INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.pei_requests
    WHERE application_id = NEW.application_id AND withdrawn_at IS NULL;
  SELECT COUNT(*) INTO v_done FROM public.pei_requests
    WHERE application_id = NEW.application_id AND withdrawn_at IS NULL
      AND status IN ('completed', 'gfe_documented');
  SELECT COUNT(*) INTO v_any_active FROM public.pei_requests
    WHERE application_id = NEW.application_id AND withdrawn_at IS NULL
      AND status <> 'pending';

  IF v_total > 0 AND v_done = v_total THEN
    UPDATE public.applications SET pei_status = 'complete' WHERE id = NEW.application_id;
  ELSIF v_done > 0 OR v_any_active > 0 THEN
    UPDATE public.applications SET pei_status = 'in_progress' WHERE id = NEW.application_id;
  ELSE
    UPDATE public.applications SET pei_status = 'not_started' WHERE id = NEW.application_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_update_application_pei_status ON public.pei_requests;
CREATE TRIGGER trg_update_application_pei_status
  AFTER INSERT OR UPDATE OF status, withdrawn_at ON public.pei_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_application_pei_status();

-- 5. The staff queue shows live requests only -------------------------------
CREATE OR REPLACE FUNCTION public.get_pei_queue()
RETURNS TABLE(request_id uuid, application_id uuid, applicant_first_name text, applicant_last_name text, employer_name text, employer_city text, employer_state text, status pei_request_status, date_sent date, deadline_date date, days_remaining integer, is_overdue boolean, send_method text, staff_notes jsonb, days_since_sent integer, date_response_received date, date_gfe_created date, gfe_reason pei_gfe_reason, pei_archived_at timestamp with time zone, pei_archive_reason text, pei_archived_by_name text, pei_archive_category text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.application_id, a.first_name, a.last_name,
    pr.employer_name, pr.employer_city, pr.employer_state,
    pr.status, pr.date_sent::date, pr.deadline_date,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date - CURRENT_DATE ELSE NULL END,
    CASE WHEN pr.deadline_date IS NOT NULL AND pr.deadline_date < CURRENT_DATE
         AND pr.status NOT IN ('completed', 'gfe_documented') THEN true ELSE false END,
    pr.send_method,
    pr.staff_notes,
    CASE WHEN pr.date_sent IS NOT NULL THEN (CURRENT_DATE - pr.date_sent::date) ELSE NULL END,
    pr.date_response_received::date,
    pr.date_gfe_created::date,
    pr.gfe_reason,
    a.pei_archived_at,
    a.pei_archive_reason,
    a.pei_archived_by_name,
    a.pei_archive_category
  FROM public.pei_requests pr
  JOIN public.applications a ON a.id = pr.application_id
  WHERE pr.withdrawn_at IS NULL
  ORDER BY
    CASE WHEN a.pei_archived_at IS NOT NULL THEN 2
         WHEN pr.status IN ('completed', 'gfe_documented') THEN 1 ELSE 0 END ASC,
    CASE WHEN pr.deadline_date IS NOT NULL THEN pr.deadline_date ELSE '2099-12-31'::date END ASC,
    pr.created_at ASC;
END;
$function$;
