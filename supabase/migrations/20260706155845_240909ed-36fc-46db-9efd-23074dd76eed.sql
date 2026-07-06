
DO $$ BEGIN
  CREATE TYPE public.equipment_assignment_state AS ENUM ('prior','during','not_assigned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS eld_signature_typed_name text,
  ADD COLUMN IF NOT EXISTS eld_signature_image_url  text,
  ADD COLUMN IF NOT EXISTS eld_signature_signed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS equipment_return_date    date,
  ADD COLUMN IF NOT EXISTS equipment_return_notes   text,
  ADD COLUMN IF NOT EXISTS eld_assignment_state       public.equipment_assignment_state NOT NULL DEFAULT 'not_assigned',
  ADD COLUMN IF NOT EXISTS dash_cam_assignment_state  public.equipment_assignment_state NOT NULL DEFAULT 'not_assigned',
  ADD COLUMN IF NOT EXISTS bestpass_assignment_state  public.equipment_assignment_state NOT NULL DEFAULT 'not_assigned',
  ADD COLUMN IF NOT EXISTS fuel_card_assignment_state public.equipment_assignment_state NOT NULL DEFAULT 'not_assigned',
  ADD COLUMN IF NOT EXISTS decal_assignment_state     public.equipment_assignment_state NOT NULL DEFAULT 'not_assigned',
  ADD COLUMN IF NOT EXISTS eld_shipped_to_driver          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dash_cam_shipped_to_driver     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bestpass_shipped_to_driver     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fuel_card_shipped_to_driver    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decal_shipped_to_driver        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eld_awaiting_return_shipment       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dash_cam_awaiting_return_shipment  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bestpass_awaiting_return_shipment  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fuel_card_awaiting_return_shipment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decal_awaiting_return_shipment     boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_eld_signature_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.eld_signature_signed_at IS NOT NULL THEN
    NEW.eld_signature_typed_name := OLD.eld_signature_typed_name;
    NEW.eld_signature_image_url  := OLD.eld_signature_image_url;
    NEW.eld_signature_signed_at  := OLD.eld_signature_signed_at;
    RETURN NEW;
  END IF;
  NEW.eld_signature_signed_at := OLD.eld_signature_signed_at;
  IF NEW.eld_signature_typed_name IS NOT NULL
     AND btrim(NEW.eld_signature_typed_name) <> ''
     AND NEW.eld_signature_image_url IS NOT NULL
     AND btrim(NEW.eld_signature_image_url) <> ''
     AND NEW.eld_signature_signed_at IS NULL THEN
    NEW.eld_signature_signed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_eld_signature_lock ON public.onboarding_status;
CREATE TRIGGER trg_enforce_eld_signature_lock
BEFORE UPDATE ON public.onboarding_status
FOR EACH ROW EXECUTE FUNCTION public.enforce_eld_signature_lock();

CREATE TABLE IF NOT EXISTS public.equipment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  equipment_line text NOT NULL CHECK (equipment_line IN ('eld','dash_cam','bestpass','fuel_card','decal')),
  direction text NOT NULL CHECK (direction IN ('inbound','return')),
  carrier text,
  tracking_number text,
  file_url text NOT NULL,
  file_name text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_role text NOT NULL CHECK (uploader_role IN ('management','driver')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_receipts_operator_idx
  ON public.equipment_receipts(operator_id, uploaded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_receipts TO authenticated;
GRANT ALL ON public.equipment_receipts TO service_role;

ALTER TABLE public.equipment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver reads own equipment receipts"
ON public.equipment_receipts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.operators o WHERE o.id = equipment_receipts.operator_id AND o.user_id = auth.uid())
);

CREATE POLICY "Driver inserts own equipment receipts"
ON public.equipment_receipts FOR INSERT TO authenticated
WITH CHECK (
  uploader_role = 'driver'
  AND uploaded_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.operators o WHERE o.id = equipment_receipts.operator_id AND o.user_id = auth.uid())
);

CREATE POLICY "Staff reads all equipment receipts"
ON public.equipment_receipts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'onboarding_staff')
  OR public.has_role(auth.uid(), 'dispatcher')
);

CREATE POLICY "Staff inserts equipment receipts"
ON public.equipment_receipts FOR INSERT TO authenticated
WITH CHECK (
  uploader_role = 'management'
  AND uploaded_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'onboarding_staff')
    OR public.has_role(auth.uid(), 'dispatcher')
  )
);

CREATE POLICY "Staff updates equipment receipts"
ON public.equipment_receipts FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'management')
  OR public.has_role(auth.uid(), 'onboarding_staff')
);

CREATE POLICY "Staff deletes equipment receipts"
ON public.equipment_receipts FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'management')
);
