
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS return_instructions_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_instructions_sent_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS equipment_return_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_equipment_return_completed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'return' THEN
    UPDATE public.onboarding_status
       SET equipment_return_completed_at = now()
     WHERE operator_id = NEW.operator_id
       AND equipment_return_completed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_equipment_receipt_return ON public.equipment_receipts;
CREATE TRIGGER on_equipment_receipt_return
  AFTER INSERT ON public.equipment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_equipment_return_completed();
