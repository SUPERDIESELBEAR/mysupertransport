
CREATE OR REPLACE FUNCTION public.sync_irp_expiry_to_mo_plate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_id uuid;
  v_plate_id uuid;
BEGIN
  IF NEW.name <> 'IRP Registration (cab card)' THEN RETURN NEW; END IF;
  IF NEW.scope <> 'per_driver' THEN RETURN NEW; END IF;
  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_operator_id FROM public.operators WHERE user_id = NEW.driver_id LIMIT 1;
  IF v_operator_id IS NULL THEN RETURN NEW; END IF;

  SELECT plate_id INTO v_plate_id
  FROM public.mo_plate_assignments
  WHERE operator_id = v_operator_id
    AND event_type = 'assignment'
    AND returned_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_plate_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.mo_plates
  SET expires_at = NEW.expires_at
  WHERE id = v_plate_id
    AND expires_at IS DISTINCT FROM NEW.expires_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_irp_expiry_to_mo_plate ON public.inspection_documents;
CREATE TRIGGER trg_sync_irp_expiry_to_mo_plate
AFTER INSERT OR UPDATE OF expires_at, name, scope, driver_id
ON public.inspection_documents
FOR EACH ROW
EXECUTE FUNCTION public.sync_irp_expiry_to_mo_plate();

-- One-time backfill: for each active assignment, copy IRP expires_at from the driver's inspection_documents row
UPDATE public.mo_plates mp
SET expires_at = doc.expires_at
FROM public.mo_plate_assignments a
JOIN public.operators o ON o.id = a.operator_id
JOIN LATERAL (
  SELECT expires_at
  FROM public.inspection_documents
  WHERE scope = 'per_driver'
    AND name = 'IRP Registration (cab card)'
    AND driver_id = o.user_id
  ORDER BY updated_at DESC NULLS LAST, uploaded_at DESC NULLS LAST
  LIMIT 1
) doc ON TRUE
WHERE a.plate_id = mp.id
  AND a.event_type = 'assignment'
  AND a.returned_at IS NULL
  AND doc.expires_at IS NOT NULL
  AND mp.expires_at IS DISTINCT FROM doc.expires_at;
