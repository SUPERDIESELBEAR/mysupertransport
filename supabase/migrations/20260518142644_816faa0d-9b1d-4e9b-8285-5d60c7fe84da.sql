CREATE POLICY "Staff can read application audit log entries"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()) AND entity_type = 'application');

CREATE OR REPLACE FUNCTION public._audit_actor_name(_actor uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '')
  FROM public.profiles p
  WHERE p.user_id = _actor
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.log_revision_attachment_upload()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_label text;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', a.first_name, a.last_name)), ''), a.email)
  INTO v_label FROM public.applications a WHERE a.id = NEW.application_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    NEW.uploaded_by,
    COALESCE(NEW.uploaded_by_name, public._audit_actor_name(NEW.uploaded_by)),
    'application.revision_attachment_uploaded',
    'application', NEW.application_id, v_label,
    jsonb_build_object('attachment_id', NEW.id, 'file_name', NEW.file_name, 'mime_type', NEW.mime_type, 'size_bytes', NEW.size_bytes, 'note', NEW.note)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_revision_attachment_upload ON public.application_revision_attachments;
CREATE TRIGGER trg_log_revision_attachment_upload
  AFTER INSERT ON public.application_revision_attachments
  FOR EACH ROW EXECUTE FUNCTION public.log_revision_attachment_upload();

CREATE OR REPLACE FUNCTION public.log_revision_attachment_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_label text;
  v_actor uuid := auth.uid();
BEGIN
  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', a.first_name, a.last_name)), ''), a.email)
  INTO v_label FROM public.applications a WHERE a.id = OLD.application_id;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    v_actor, public._audit_actor_name(v_actor),
    'application.revision_attachment_deleted',
    'application', OLD.application_id, v_label,
    jsonb_build_object('attachment_id', OLD.id, 'file_name', OLD.file_name, 'uploaded_by', OLD.uploaded_by, 'uploaded_by_name', OLD.uploaded_by_name)
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_revision_attachment_delete ON public.application_revision_attachments;
CREATE TRIGGER trg_log_revision_attachment_delete
  AFTER DELETE ON public.application_revision_attachments
  FOR EACH ROW EXECUTE FUNCTION public.log_revision_attachment_delete();

CREATE OR REPLACE FUNCTION public.log_correction_request_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_label text; v_action text; v_actor uuid; v_actor_name text; v_meta jsonb; v_field_count int;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', a.first_name, a.last_name)), ''), a.email)
  INTO v_label FROM public.applications a
  WHERE a.id = COALESCE(NEW.application_id, OLD.application_id);

  SELECT COUNT(*) INTO v_field_count
  FROM public.application_correction_fields WHERE request_id = COALESCE(NEW.id, OLD.id);

  IF TG_OP = 'INSERT' THEN
    v_action := 'application.correction_request_sent';
    v_actor  := NEW.requested_by_staff_id;
    v_actor_name := COALESCE(NEW.requested_by_staff_name, public._audit_actor_name(v_actor));
    v_meta := jsonb_build_object('request_id', NEW.id, 'reason', NEW.reason_for_changes, 'courtesy_message', NEW.courtesy_message, 'field_count', v_field_count);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' THEN
      v_action := 'application.correction_request_cancelled';
      v_actor  := COALESCE(NEW.cancelled_by, auth.uid());
      v_actor_name := public._audit_actor_name(v_actor);
      v_meta := jsonb_build_object('request_id', NEW.id, 'reason', NEW.reason_for_changes, 'field_count', v_field_count);
    ELSIF NEW.status = 'approved' THEN
      v_action := 'application.correction_request_approved';
      v_actor  := NULL;
      v_actor_name := NEW.signed_typed_name;
      v_meta := jsonb_build_object('request_id', NEW.id, 'signed_typed_name', NEW.signed_typed_name, 'signed_ip', NEW.signed_ip, 'field_count', v_field_count);
    ELSIF NEW.status = 'rejected' THEN
      v_action := 'application.correction_request_rejected';
      v_actor  := NULL;
      v_actor_name := NEW.signed_typed_name;
      v_meta := jsonb_build_object('request_id', NEW.id, 'rejection_reason', NEW.rejection_reason, 'field_count', v_field_count);
    ELSIF NEW.status = 'expired' THEN
      v_action := 'application.correction_request_expired';
      v_actor  := NULL; v_actor_name := NULL;
      v_meta := jsonb_build_object('request_id', NEW.id, 'field_count', v_field_count);
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (v_actor, v_actor_name, v_action, 'application', COALESCE(NEW.application_id, OLD.application_id), v_label, v_meta);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_correction_request_event ON public.application_correction_requests;
CREATE TRIGGER trg_log_correction_request_event
  AFTER INSERT OR UPDATE ON public.application_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_correction_request_event();