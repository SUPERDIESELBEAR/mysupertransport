
CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff bypass: full update rights
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Operator path: only contractor signature / deposit columns may change.
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
  OR NEW.owner_address          IS DISTINCT FROM OLD.owner_address
  OR NEW.owner_city             IS DISTINCT FROM OLD.owner_city
  OR NEW.owner_state            IS DISTINCT FROM OLD.owner_state
  OR NEW.owner_zip              IS DISTINCT FROM OLD.owner_zip
  OR NEW.owner_phone            IS DISTINCT FROM OLD.owner_phone
  OR NEW.owner_email            IS DISTINCT FROM OLD.owner_email
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

  -- Status: operator may only move the contract to 'fully_executed'
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'fully_executed' THEN
    RAISE EXCEPTION 'Operators may only set ICA status to fully_executed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ica_contracts_operator_update ON public.ica_contracts;
CREATE TRIGGER trg_enforce_ica_contracts_operator_update
BEFORE UPDATE ON public.ica_contracts
FOR EACH ROW EXECUTE FUNCTION public.enforce_ica_contracts_operator_update();
