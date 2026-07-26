ALTER TABLE public.onboard_assignment_sheets
  ADD COLUMN IF NOT EXISTS return_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_requested_by uuid,
  ADD COLUMN IF NOT EXISTS return_requested_by_name text,
  ADD COLUMN IF NOT EXISTS return_completed_at timestamptz;

ALTER TABLE public.equipment_receipts
  ADD COLUMN IF NOT EXISTS sheet_id uuid REFERENCES public.onboard_assignment_sheets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS equipment_receipts_sheet_idx ON public.equipment_receipts(sheet_id);

-- Require a tracking number on driver-uploaded return receipts
ALTER TABLE public.equipment_receipts
  DROP CONSTRAINT IF EXISTS equipment_receipts_driver_tracking_required;
ALTER TABLE public.equipment_receipts
  ADD CONSTRAINT equipment_receipts_driver_tracking_required
  CHECK (
    NOT (direction = 'return' AND uploader_role = 'driver')
    OR COALESCE(btrim(tracking_number), '') <> ''
  );

-- Helper: does this operator have a sheet with return instructions sent?
CREATE OR REPLACE FUNCTION public.operator_return_requested(_operator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboard_assignment_sheets s
    WHERE s.operator_id = _operator_id
      AND s.return_requested_at IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.operator_return_requested(uuid) TO authenticated;

DROP POLICY IF EXISTS "Driver inserts own equipment receipts" ON public.equipment_receipts;
CREATE POLICY "Driver inserts own equipment receipts"
ON public.equipment_receipts
FOR INSERT
TO authenticated
WITH CHECK (
  uploader_role = 'driver'
  AND uploaded_by = auth.uid()
  AND direction = 'return'
  AND EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = equipment_receipts.operator_id AND o.user_id = auth.uid()
  )
  AND (
    public.operator_awaiting_return(operator_id)
    OR public.operator_return_requested(operator_id)
  )
);

-- Stamp the sheet + notify staff when a driver uploads a return receipt
CREATE OR REPLACE FUNCTION public.notify_staff_on_return_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op            RECORD;
  v_app           RECORD;
  v_operator_name TEXT := 'A driver';
  v_recipient     UUID;
  v_recipients    UUID[] := '{}';
BEGIN
  IF NEW.direction <> 'return' OR NEW.uploader_role <> 'driver' THEN
    RETURN NEW;
  END IF;

  IF NEW.sheet_id IS NOT NULL THEN
    UPDATE public.onboard_assignment_sheets
       SET return_completed_at = COALESCE(return_completed_at, now())
     WHERE id = NEW.sheet_id;
  ELSE
    UPDATE public.onboard_assignment_sheets
       SET return_completed_at = COALESCE(return_completed_at, now())
     WHERE operator_id = NEW.operator_id
       AND return_requested_at IS NOT NULL
       AND return_completed_at IS NULL;
  END IF;

  SELECT assigned_onboarding_staff, application_id
  INTO v_op
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_op.application_id IS NOT NULL THEN
    SELECT first_name, last_name INTO v_app
    FROM public.applications WHERE id = v_op.application_id;
    IF FOUND THEN
      v_operator_name := COALESCE(
        NULLIF(TRIM(COALESCE(v_app.first_name,'') || ' ' || COALESCE(v_app.last_name,'')), ''),
        'A driver'
      );
    END IF;
  END IF;

  IF v_op.assigned_onboarding_staff IS NOT NULL THEN
    v_recipients := array_append(v_recipients, v_op.assigned_onboarding_staff);
  ELSE
    SELECT COALESCE(array_agg(DISTINCT user_id), '{}')
    INTO v_recipients
    FROM public.user_roles
    WHERE role IN ('onboarding_staff','management','owner');
  END IF;

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (
      v_recipient,
      'Return receipt uploaded by ' || v_operator_name,
      v_operator_name || ' uploaded an equipment return receipt' ||
        COALESCE(' (tracking ' || NEW.tracking_number || ')', '') || '.',
      'equipment_return_receipt',
      'in_app',
      '/dashboard?view=drivers&operator=' || NEW.operator_id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_staff_on_return_receipt ON public.equipment_receipts;
CREATE TRIGGER trg_notify_staff_on_return_receipt
AFTER INSERT ON public.equipment_receipts
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_return_receipt();