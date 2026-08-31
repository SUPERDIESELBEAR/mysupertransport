-- ============================================================
-- Module 4 Pass 1a — management confirms equipment RECEIPT
-- Distinct from driver-written SHIPMENT. One writer per fact.
-- ============================================================

CREATE TABLE public.equipment_return_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES public.profiles(id),
  note text,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES public.profiles(id),
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.equipment_return_confirmations IS
  'Management confirmation that an operator''s equipment set is physically back. RECEIVED, not SHIPPED. Driver-writable shipment lives in equipment_receipts and is untouched by this table.';

-- at most one open (non-reversed) confirmation per operator
CREATE UNIQUE INDEX equipment_return_confirmations_open_uniq
  ON public.equipment_return_confirmations (operator_id)
  WHERE reversed_at IS NULL;

CREATE INDEX equipment_return_confirmations_operator_idx
  ON public.equipment_return_confirmations (operator_id, confirmed_at DESC);

GRANT SELECT ON public.equipment_return_confirmations TO authenticated;
GRANT ALL ON public.equipment_return_confirmations TO service_role;

ALTER TABLE public.equipment_return_confirmations ENABLE ROW LEVEL SECURITY;

-- Staff read. No client INSERT/UPDATE/DELETE at all: the RPCs are the only writers.
CREATE POLICY "erc_staff_read"
  ON public.equipment_return_confirmations
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER update_equipment_return_confirmations_updated_at
  BEFORE UPDATE ON public.equipment_return_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Writers: management / owner only
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_equipment_returned(
  _operator_id uuid,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Only management may confirm equipment receipt' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.operators WHERE id = _operator_id) THEN
    RAISE EXCEPTION 'Operator not found' USING ERRCODE = 'P0002';
  END IF;

  _actor := public.current_profile_id();

  INSERT INTO public.equipment_return_confirmations (operator_id, confirmed_by, note)
  VALUES (_operator_id, _actor, NULLIF(btrim(coalesce(_note,'')), ''))
  ON CONFLICT (operator_id) WHERE reversed_at IS NULL DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id
      FROM public.equipment_return_confirmations
     WHERE operator_id = _operator_id AND reversed_at IS NULL
     LIMIT 1;
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_equipment_returned(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_equipment_returned(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_equipment_returned(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_equipment_returned(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_equipment_return_confirmation(
  _operator_id uuid,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  _actor uuid;
  _id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'owner')
  ) THEN
    RAISE EXCEPTION 'Only management may reverse an equipment receipt confirmation' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(coalesce(_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse a confirmation' USING ERRCODE = '22023';
  END IF;

  _actor := public.current_profile_id();

  UPDATE public.equipment_return_confirmations
     SET reversed_at = now(),
         reversed_by = _actor,
         reversal_reason = btrim(_reason)
   WHERE operator_id = _operator_id
     AND reversed_at IS NULL
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'No open equipment receipt confirmation for this operator' USING ERRCODE = 'P0002';
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_equipment_return_confirmation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_equipment_return_confirmation(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_equipment_return_confirmation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_equipment_return_confirmation(uuid, text) TO service_role;

-- ============================================================
-- Derived fact for the Pass 2 hold formula. Reads only.
-- TRUE until management confirms receipt; FALSE after.
-- Partial returns do NOT reduce it — the set is confirmed or it is not.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipment_outstanding(_operator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.equipment_return_confirmations
     WHERE operator_id = _operator_id
       AND reversed_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.equipment_outstanding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_outstanding(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.equipment_outstanding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_outstanding(uuid) TO service_role;