
CREATE OR REPLACE FUNCTION public.notify_staff_on_docs_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os            RECORD;
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT;
  v_staff_id      UUID;
  v_all_covered   BOOLEAN := TRUE;
  v_doc_key       TEXT;
  v_requested     TEXT[] := '{}';
BEGIN
  SELECT form_2290, truck_title, truck_photos, truck_inspection
  INTO v_os
  FROM public.onboarding_status
  WHERE operator_id = NEW.operator_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_os.form_2290        = 'requested' THEN v_requested := array_append(v_requested, 'form_2290');        END IF;
  IF v_os.truck_title      = 'requested' THEN v_requested := array_append(v_requested, 'truck_title');      END IF;
  IF v_os.truck_photos     = 'requested' THEN v_requested := array_append(v_requested, 'truck_photos');     END IF;
  IF v_os.truck_inspection = 'requested' THEN v_requested := array_append(v_requested, 'truck_inspection'); END IF;

  IF array_length(v_requested, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH v_doc_key IN ARRAY v_requested LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.operator_documents
      WHERE operator_id = NEW.operator_id
        AND document_type::text = v_doc_key
    ) THEN
      v_all_covered := FALSE;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_all_covered THEN RETURN NEW; END IF;

  SELECT assigned_onboarding_staff, application_id
  INTO v_op
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_op.assigned_onboarding_staff IS NULL THEN RETURN NEW; END IF;

  v_staff_id := v_op.assigned_onboarding_staff;

  v_operator_name := 'An operator';
  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        'An operator'
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id  = v_staff_id
      AND type     = 'docs_uploaded'
      AND link     = '/staff?operator=' || NEW.operator_id::text
      AND read_at  IS NULL
      AND sent_at  > now() - interval '24 hours'
  ) THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, body, type, channel, link)
  VALUES (
    v_staff_id,
    'Documents uploaded — ready for review',
    v_operator_name || ' has uploaded all requested documents.',
    'docs_uploaded',
    'in_app',
    '/staff?operator=' || NEW.operator_id::text
  );

  RETURN NEW;
END;
$$;
