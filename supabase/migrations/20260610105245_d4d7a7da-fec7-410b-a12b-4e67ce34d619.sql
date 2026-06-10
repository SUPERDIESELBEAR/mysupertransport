-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'truck_owner';

-- 2. truck_owners table
CREATE TABLE public.truck_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL UNIQUE REFERENCES public.operators(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  legal_first_name text NOT NULL,
  legal_last_name text NOT NULL,
  business_name text,
  email text NOT NULL,
  phone text,
  address_street text,
  address_city text,
  address_state text,
  address_zip text,
  invited_at timestamptz,
  invite_accepted_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_owners TO authenticated;
GRANT ALL ON public.truck_owners TO service_role;
ALTER TABLE public.truck_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage truck owners"
  ON public.truck_owners FOR ALL
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Truck owners can view own record"
  ON public.truck_owners FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Drivers can view their truck owner"
  ON public.truck_owners FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.operators o
    WHERE o.id = truck_owners.operator_id AND o.user_id = auth.uid()
  ));

CREATE TRIGGER truck_owners_updated_at
  BEFORE UPDATE ON public.truck_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ica_driver_acknowledgments table
CREATE TABLE public.ica_driver_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.ica_contracts(id) ON DELETE CASCADE,
  driver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, driver_user_id)
);
GRANT SELECT, INSERT ON public.ica_driver_acknowledgments TO authenticated;
GRANT ALL ON public.ica_driver_acknowledgments TO service_role;
ALTER TABLE public.ica_driver_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all driver ack"
  ON public.ica_driver_acknowledgments FOR SELECT
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Driver can view own ack"
  ON public.ica_driver_acknowledgments FOR SELECT
  USING (driver_user_id = auth.uid());

CREATE POLICY "Truck owner can view linked ack"
  ON public.ica_driver_acknowledgments FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM public.ica_contracts c
    JOIN public.truck_owners t ON t.operator_id = c.operator_id
    WHERE c.id = ica_driver_acknowledgments.contract_id
      AND t.user_id = auth.uid()
  ));

CREATE POLICY "Driver can insert own ack"
  ON public.ica_driver_acknowledgments FOR INSERT
  WITH CHECK (
    driver_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ica_contracts c
      JOIN public.operators o ON o.id = c.operator_id
      WHERE c.id = contract_id
        AND o.user_id = auth.uid()
        AND c.status = 'fully_executed'
    )
  );

-- 4. Helper function
CREATE OR REPLACE FUNCTION public.is_truck_owner_for_operator(_uid uuid, _operator_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.truck_owners
    WHERE user_id = _uid AND operator_id = _operator_id
  )
$$;

-- 5. Driver-parity policies for linked truck owner
CREATE POLICY "Truck owner can view linked operator"
  ON public.operators FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), id));

CREATE POLICY "Truck owner can view linked onboarding"
  ON public.onboarding_status FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can update linked onboarding decals"
  ON public.onboarding_status FOR UPDATE
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id))
  WITH CHECK (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked operator docs"
  ON public.operator_documents FOR SELECT
  USING (deleted_at IS NULL AND public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can insert linked operator docs"
  ON public.operator_documents FOR INSERT
  WITH CHECK (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked ICA"
  ON public.ica_contracts FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can sign linked ICA"
  ON public.ica_contracts FOR UPDATE
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id))
  WITH CHECK (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked vault"
  ON public.driver_vault_documents FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked dispatch"
  ON public.active_dispatch FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked daily log"
  ON public.dispatch_daily_log FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked pay setup"
  ON public.contractor_pay_setup FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked DOT inspections"
  ON public.truck_dot_inspections FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked maintenance"
  ON public.truck_maintenance_records FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

CREATE POLICY "Truck owner can view linked equipment"
  ON public.equipment_assignments FOR SELECT
  USING (public.is_truck_owner_for_operator(auth.uid(), operator_id));

-- 6. Allow truck owner to sign + edit limited owner contact fields on ICA
CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_truck_owner boolean := false;
BEGIN
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  v_is_truck_owner := public.is_truck_owner_for_operator(auth.uid(), OLD.operator_id);

  -- Locked fields no signer may change
  IF NEW.operator_id            IS DISTINCT FROM OLD.operator_id
  OR NEW.truck_year             IS DISTINCT FROM OLD.truck_year
  OR NEW.truck_make             IS DISTINCT FROM OLD.truck_make
  OR NEW.truck_model            IS DISTINCT FROM OLD.truck_model
  OR NEW.truck_vin              IS DISTINCT FROM OLD.truck_vin
  OR NEW.truck_plate            IS DISTINCT FROM OLD.truck_plate
  OR NEW.truck_plate_state      IS DISTINCT FROM OLD.truck_plate_state
  OR NEW.trailer_number         IS DISTINCT FROM OLD.trailer_number
  OR NEW.owner_business_name    IS DISTINCT FROM OLD.owner_business_name
  OR NEW.owner_ein_ssn          IS DISTINCT FROM OLD.owner_ein_ssn
  OR NEW.owner_name             IS DISTINCT FROM OLD.owner_name
  OR NEW.linehaul_split_pct     IS DISTINCT FROM OLD.linehaul_split_pct
  OR NEW.lease_effective_date   IS DISTINCT FROM OLD.lease_effective_date
  OR NEW.lease_termination_date IS DISTINCT FROM OLD.lease_termination_date
  OR NEW.equipment_location     IS DISTINCT FROM OLD.equipment_location
  OR NEW.carrier_signed_by      IS DISTINCT FROM OLD.carrier_signed_by
  OR NEW.carrier_typed_name     IS DISTINCT FROM OLD.carrier_typed_name
  OR NEW.carrier_title          IS DISTINCT FROM OLD.carrier_title
  OR NEW.carrier_signature_url  IS DISTINCT FROM OLD.carrier_signature_url
  OR NEW.carrier_signed_at      IS DISTINCT FROM OLD.carrier_signed_at
  OR NEW.created_at             IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Operators may only update contractor signature and deposit fields on ICA contracts';
  END IF;

  -- Owner contact field edits only allowed for the linked truck owner
  IF (NEW.owner_address IS DISTINCT FROM OLD.owner_address
      OR NEW.owner_city IS DISTINCT FROM OLD.owner_city
      OR NEW.owner_state IS DISTINCT FROM OLD.owner_state
      OR NEW.owner_zip IS DISTINCT FROM OLD.owner_zip
      OR NEW.owner_phone IS DISTINCT FROM OLD.owner_phone
      OR NEW.owner_email IS DISTINCT FROM OLD.owner_email)
     AND NOT v_is_truck_owner
  THEN
    RAISE EXCEPTION 'Only the linked truck owner may edit owner contact fields on ICA contracts';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'fully_executed' THEN
    RAISE EXCEPTION 'Operators may only set ICA status to fully_executed';
  END IF;

  RETURN NEW;
END;
$$;

-- 7. log_ica_event: allow truck owner callers
CREATE OR REPLACE FUNCTION public.log_ica_event(p_action text, p_operator_id uuid, p_contract_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('ica_screen_opened','ica_execute_clicked','ica_upload_failed','ica_signed') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  SELECT user_id INTO v_owner FROM public.operators WHERE id = p_operator_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'operator_not_found'; END IF;

  IF v_owner <> v_uid
     AND NOT public.is_staff(v_uid)
     AND NOT public.is_truck_owner_for_operator(v_uid, p_operator_id)
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), '')
  INTO v_name
  FROM public.profiles WHERE user_id = v_uid;

  INSERT INTO public.audit_log (entity_type, entity_id, entity_label, action, actor_id, actor_name, metadata)
  VALUES (
    'ica_contract',
    p_operator_id,
    COALESCE(v_name, 'Signer'),
    p_action,
    v_uid,
    COALESCE(v_name, 'Signer'),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('contract_id', p_contract_id, 'operator_id', p_operator_id)
  );
END;
$$;