CREATE OR REPLACE FUNCTION public.audit_osas_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_count int;
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') THEN
    SELECT COUNT(*) INTO item_count
      FROM public.onboard_assignment_sheet_items
     WHERE sheet_id = NEW.id;

    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, entity_label, metadata)
    VALUES (
      auth.uid(),
      'osas_signed',
      'onboard_assignment_sheet',
      NEW.id,
      trim('OSAS ' || COALESCE(NEW.unit_number, '')),
      jsonb_build_object('operator_id', NEW.operator_id, 'item_count', item_count)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_osas_signed ON public.onboard_assignment_sheets;
CREATE TRIGGER trg_audit_osas_signed
AFTER UPDATE ON public.onboard_assignment_sheets
FOR EACH ROW
EXECUTE FUNCTION public.audit_osas_signed();