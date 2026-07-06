
-- 1. equipment_receipts.equipment_line becomes nullable so a single receipt can cover a whole shipment
ALTER TABLE public.equipment_receipts
  DROP CONSTRAINT IF EXISTS equipment_receipts_equipment_line_check;
ALTER TABLE public.equipment_receipts
  ALTER COLUMN equipment_line DROP NOT NULL;
ALTER TABLE public.equipment_receipts
  ADD CONSTRAINT equipment_receipts_equipment_line_check
  CHECK (equipment_line IS NULL OR equipment_line IN ('eld','dash_cam','bestpass','fuel_card','decal'));

-- 2. Per-line delivery method columns
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS eld_delivery_method       text,
  ADD COLUMN IF NOT EXISTS dash_cam_delivery_method  text,
  ADD COLUMN IF NOT EXISTS bestpass_delivery_method  text,
  ADD COLUMN IF NOT EXISTS fuel_card_delivery_method text,
  ADD COLUMN IF NOT EXISTS decal_delivery_method     text;

DO $$ BEGIN
  ALTER TABLE public.onboarding_status ADD CONSTRAINT eld_delivery_method_check
    CHECK (eld_delivery_method IS NULL OR eld_delivery_method IN ('shipped','orientation','on_site','awaiting_return','not_assigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.onboarding_status ADD CONSTRAINT dash_cam_delivery_method_check
    CHECK (dash_cam_delivery_method IS NULL OR dash_cam_delivery_method IN ('shipped','orientation','on_site','awaiting_return','not_assigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.onboarding_status ADD CONSTRAINT bestpass_delivery_method_check
    CHECK (bestpass_delivery_method IS NULL OR bestpass_delivery_method IN ('shipped','orientation','on_site','awaiting_return','not_assigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.onboarding_status ADD CONSTRAINT fuel_card_delivery_method_check
    CHECK (fuel_card_delivery_method IS NULL OR fuel_card_delivery_method IN ('shipped','orientation','on_site','awaiting_return','not_assigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.onboarding_status ADD CONSTRAINT decal_delivery_method_check
    CHECK (decal_delivery_method IS NULL OR decal_delivery_method IN ('shipped','orientation','on_site','awaiting_return','not_assigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Extend the operator-update whitelist trigger so drivers can sign the
--    Equipment Asset Sheet (typed name + signature image). The signed_at
--    column is stamped by the enforce_eld_signature_lock trigger, but its
--    change must also pass this whitelist.
CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.ica_sync_cascade', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.equipment_asset_sheet_migration', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.decal_photo_ds_url             IS DISTINCT FROM OLD.decal_photo_ds_url
     OR NEW.decal_photo_ps_url          IS DISTINCT FROM OLD.decal_photo_ps_url
     OR NEW.truck_photos                IS DISTINCT FROM OLD.truck_photos
     OR NEW.ica_status                  IS DISTINCT FROM OLD.ica_status
     OR NEW.eld_signature_typed_name    IS DISTINCT FROM OLD.eld_signature_typed_name
     OR NEW.eld_signature_image_url     IS DISTINCT FROM OLD.eld_signature_image_url
     OR NEW.eld_signature_signed_at     IS DISTINCT FROM OLD.eld_signature_signed_at
     OR NEW.updated_at                  IS DISTINCT FROM OLD.updated_at
     OR NEW.updated_by                  IS DISTINCT FROM OLD.updated_by
  THEN
    IF to_jsonb(NEW)
       - 'decal_photo_ds_url' - 'decal_photo_ps_url' - 'truck_photos'
       - 'ica_status'
       - 'eld_signature_typed_name' - 'eld_signature_image_url' - 'eld_signature_signed_at'
       - 'updated_at' - 'updated_by'
       IS DISTINCT FROM
       to_jsonb(OLD)
       - 'decal_photo_ds_url' - 'decal_photo_ps_url' - 'truck_photos'
       - 'ica_status'
       - 'eld_signature_typed_name' - 'eld_signature_image_url' - 'eld_signature_signed_at'
       - 'updated_at' - 'updated_by'
    THEN
      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, ica_status, and equipment asset sheet signature';
    END IF;
  ELSE
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Operators may only update their own decal photos, truck_photos, ica_status, and equipment asset sheet signature';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Backfill (bypasses the operator whitelist via a transaction-local flag)
DO $$
BEGIN
  PERFORM set_config('app.equipment_asset_sheet_migration', '1', true);
  UPDATE public.onboarding_status SET
    eld_delivery_method = COALESCE(eld_delivery_method,
      CASE
        WHEN eld_awaiting_return_shipment THEN 'awaiting_return'
        WHEN eld_shipped_to_driver THEN 'shipped'
        WHEN eld_assignment_state = 'not_assigned' THEN 'not_assigned'
        ELSE NULL END),
    dash_cam_delivery_method = COALESCE(dash_cam_delivery_method,
      CASE
        WHEN dash_cam_awaiting_return_shipment THEN 'awaiting_return'
        WHEN dash_cam_shipped_to_driver THEN 'shipped'
        WHEN dash_cam_assignment_state = 'not_assigned' THEN 'not_assigned'
        ELSE NULL END),
    bestpass_delivery_method = COALESCE(bestpass_delivery_method,
      CASE
        WHEN bestpass_awaiting_return_shipment THEN 'awaiting_return'
        WHEN bestpass_shipped_to_driver THEN 'shipped'
        WHEN bestpass_assignment_state = 'not_assigned' THEN 'not_assigned'
        ELSE NULL END),
    fuel_card_delivery_method = COALESCE(fuel_card_delivery_method,
      CASE
        WHEN fuel_card_awaiting_return_shipment THEN 'awaiting_return'
        WHEN fuel_card_shipped_to_driver THEN 'shipped'
        WHEN fuel_card_assignment_state = 'not_assigned' THEN 'not_assigned'
        ELSE NULL END),
    decal_delivery_method = COALESCE(decal_delivery_method,
      CASE
        WHEN decal_awaiting_return_shipment THEN 'awaiting_return'
        WHEN decal_shipped_to_driver THEN 'shipped'
        WHEN decal_assignment_state = 'not_assigned' THEN 'not_assigned'
        ELSE NULL END);
END $$;

-- 5. Helper: is any of an operator's equipment awaiting return?
CREATE OR REPLACE FUNCTION public.operator_awaiting_return(_operator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.onboarding_status os
    WHERE os.operator_id = _operator_id
      AND (
        os.eld_delivery_method       = 'awaiting_return' OR
        os.dash_cam_delivery_method  = 'awaiting_return' OR
        os.bestpass_delivery_method  = 'awaiting_return' OR
        os.fuel_card_delivery_method = 'awaiting_return' OR
        os.decal_delivery_method     = 'awaiting_return'
      )
  );
$$;

-- 6. Driver INSERT: return-direction only, only while awaiting_return
DROP POLICY IF EXISTS "Driver inserts own equipment receipts" ON public.equipment_receipts;
CREATE POLICY "Driver inserts own equipment receipts"
ON public.equipment_receipts FOR INSERT TO authenticated
WITH CHECK (
  uploader_role = 'driver'
  AND uploaded_by = auth.uid()
  AND direction = 'return'
  AND EXISTS (SELECT 1 FROM public.operators o WHERE o.id = equipment_receipts.operator_id AND o.user_id = auth.uid())
  AND public.operator_awaiting_return(equipment_receipts.operator_id)
);
