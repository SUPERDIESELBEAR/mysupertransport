CREATE OR REPLACE FUNCTION public.sync_mo_plate_expiry_to_irp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_driver_user_id uuid;
BEGIN
  IF NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN RETURN NEW; END IF;
  IF NEW.expires_at IS NULL THEN RETURN NEW; END IF;

  SELECT operator_id INTO v_operator_id
  FROM public.mo_plate_assignments
  WHERE plate_id = NEW.id
    AND event_type = 'assignment'
    AND returned_at IS NULL
  ORDER BY assigned_at DESC
  LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO v_driver_user_id FROM public.operators WHERE id = v_operator_id LIMIT 1;
  IF v_driver_user_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.inspection_documents
  SET expires_at = NEW.expires_at
  WHERE scope = 'per_driver'
    AND name = 'IRP Registration (cab card)'
    AND driver_id = v_driver_user_id
    AND (expires_at IS NULL OR NEW.expires_at > expires_at);

  RETURN NEW;
END;
$$;