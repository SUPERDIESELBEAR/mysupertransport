-- 1. Add shipping/tracking columns to equipment_assignments
ALTER TABLE public.equipment_assignments
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS ship_date date,
  ADD COLUMN IF NOT EXISTS tracking_receipt_url text,
  ADD COLUMN IF NOT EXISTS tracking_receipt_uploaded_at timestamptz;

-- 2. Secure RPC: operator can read shipping info for their own assignments only
CREATE OR REPLACE FUNCTION public.get_equipment_shipping_for_operator(p_operator_id uuid)
RETURNS TABLE (
  assignment_id uuid,
  equipment_id uuid,
  device_type text,
  serial_number text,
  assigned_at timestamptz,
  returned_at timestamptz,
  shipping_carrier text,
  tracking_number text,
  ship_date date,
  tracking_receipt_url text,
  tracking_receipt_uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the operator (owner of the operator row) or staff can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = p_operator_id AND o.user_id = auth.uid()
  ) AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    ea.id           AS assignment_id,
    ea.equipment_id,
    ei.device_type,
    ei.serial_number,
    ea.assigned_at,
    ea.returned_at,
    ea.shipping_carrier,
    ea.tracking_number,
    ea.ship_date,
    ea.tracking_receipt_url,
    ea.tracking_receipt_uploaded_at
  FROM public.equipment_assignments ea
  JOIN public.equipment_items ei ON ei.id = ea.equipment_id
  WHERE ea.operator_id = p_operator_id
    AND (ea.shipping_carrier IS NOT NULL OR ea.tracking_number IS NOT NULL OR ea.tracking_receipt_url IS NOT NULL)
  ORDER BY ea.assigned_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_equipment_shipping_for_operator(uuid) TO authenticated;