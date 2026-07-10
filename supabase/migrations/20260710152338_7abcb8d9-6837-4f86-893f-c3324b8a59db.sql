
CREATE OR REPLACE FUNCTION public.sync_mo_plate_expiry_to_irp()
RETURNS TRIGGER
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
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO v_driver_user_id FROM public.operators WHERE id = v_operator_id LIMIT 1;
  IF v_driver_user_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.inspection_documents
  SET expires_at = NEW.expires_at
  WHERE scope = 'per_driver'
    AND name = 'IRP Registration (cab card)'
    AND driver_id = v_driver_user_id
    AND expires_at IS DISTINCT FROM NEW.expires_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mo_plate_expiry_to_irp ON public.mo_plates;
CREATE TRIGGER trg_sync_mo_plate_expiry_to_irp
AFTER UPDATE OF expires_at
ON public.mo_plates
FOR EACH ROW
EXECUTE FUNCTION public.sync_mo_plate_expiry_to_irp();
