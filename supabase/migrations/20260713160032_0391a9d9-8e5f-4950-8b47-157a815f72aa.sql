CREATE OR REPLACE FUNCTION public.enforce_ica_contracts_operator_column_whitelist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_truck_owner boolean := false;
BEGIN
  -- Allow service role / no auth context (DB triggers, backend functions).
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow staff users full update access (matches RLS staff policy).
  IF public.is_staff(v_uid) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.truck_owners tro
    WHERE tro.user_id = v_uid
      AND tro.operator_id = NEW.operator_id
  ) INTO v_is_truck_owner;

  -- For operator / truck-owner: enforce a whitelist of editable columns.
  IF NEW.operator_id          IS DISTINCT FROM OLD.operator_id          THEN RAISE EXCEPTION 'operator cannot modify column operator_id'; END IF;
  IF NEW.truck_year           IS DISTINCT FROM OLD.truck_year           THEN RAISE EXCEPTION 'operator cannot modify column truck_year'; END IF;
  IF NEW.truck_make           IS DISTINCT FROM OLD.truck_make           THEN RAISE EXCEPTION 'operator cannot modify column truck_make'; END IF;
  IF NEW.truck_model          IS DISTINCT FROM OLD.truck_model          THEN RAISE EXCEPTION 'operator cannot modify column truck_model'; END IF;
  IF NEW.truck_vin            IS DISTINCT FROM OLD.truck_vin            THEN RAISE EXCEPTION 'operator cannot modify column truck_vin'; END IF;
  IF NEW.truck_plate          IS DISTINCT FROM OLD.truck_plate          THEN RAISE EXCEPTION 'operator cannot modify column truck_plate'; END IF;
  IF NEW.truck_plate_state    IS DISTINCT FROM OLD.truck_plate_state    THEN RAISE EXCEPTION 'operator cannot modify column truck_plate_state'; END IF;
  IF NEW.trailer_number       IS DISTINCT FROM OLD.trailer_number       THEN RAISE EXCEPTION 'operator cannot modify column trailer_number'; END IF;
  IF NEW.owner_business_name  IS DISTINCT FROM OLD.owner_business_name  THEN RAISE EXCEPTION 'operator cannot modify column owner_business_name'; END IF;
  IF NEW.owner_ein_ssn        IS DISTINCT FROM OLD.owner_ein_ssn        THEN RAISE EXCEPTION 'operator cannot modify column owner_ein_ssn'; END IF;
  IF NEW.owner_address        IS DISTINCT FROM OLD.owner_address        AND NOT v_is_truck_owner THEN RAISE EXCEPTION 'operator cannot modify column owner_address'; END IF;
  IF NEW.owner_city           IS DISTINCT FROM OLD.owner_city           AND NOT v_is_truck_owner THEN RAISE EXCEPTION 'operator cannot modify column owner_city'; END IF;
  IF NEW.owner_state          IS DISTINCT FROM OLD.owner_state          AND NOT v_is_truck_owner THEN RAISE EXCEPTION 'operator cannot modify column owner_state'; END IF;
  IF NEW.owner_zip            IS DISTINCT FROM OLD.owner_zip            AND NOT v_is_truck_owner THEN RAISE EXCEPTION 'operator cannot modify column owner_zip'; END IF;
  IF NEW.owner_phone          IS DISTINCT FROM OLD.owner_phone          AND NOT v_is_truck_owner THEN RAISE EXCEPTION 'operator cannot modify column owner_phone'; END IF;
  IF NEW.owner_email          IS DISTINCT FROM OLD.owner_email          AND NOT v_is_truck_owner THEN RAISE EXCEPTION 'operator cannot modify column owner_email'; END IF;
  IF NEW.owner_name           IS DISTINCT FROM OLD.owner_name           THEN RAISE EXCEPTION 'operator cannot modify column owner_name'; END IF;
  IF NEW.linehaul_split_pct   IS DISTINCT FROM OLD.linehaul_split_pct   THEN RAISE EXCEPTION 'operator cannot modify column linehaul_split_pct'; END IF;
  IF NEW.lease_effective_date IS DISTINCT FROM OLD.lease_effective_date THEN RAISE EXCEPTION 'operator cannot modify column lease_effective_date'; END IF;
  IF NEW.lease_termination_date IS DISTINCT FROM OLD.lease_termination_date THEN RAISE EXCEPTION 'operator cannot modify column lease_termination_date'; END IF;
  IF NEW.equipment_location   IS DISTINCT FROM OLD.equipment_location   THEN RAISE EXCEPTION 'operator cannot modify column equipment_location'; END IF;
  IF NEW.carrier_signed_by    IS DISTINCT FROM OLD.carrier_signed_by    THEN RAISE EXCEPTION 'operator cannot modify column carrier_signed_by'; END IF;
  IF NEW.carrier_typed_name   IS DISTINCT FROM OLD.carrier_typed_name   THEN RAISE EXCEPTION 'operator cannot modify column carrier_typed_name'; END IF;
  IF NEW.carrier_title        IS DISTINCT FROM OLD.carrier_title        THEN RAISE EXCEPTION 'operator cannot modify column carrier_title'; END IF;
  IF NEW.carrier_signature_url IS DISTINCT FROM OLD.carrier_signature_url THEN RAISE EXCEPTION 'operator cannot modify column carrier_signature_url'; END IF;
  IF NEW.carrier_signed_at    IS DISTINCT FROM OLD.carrier_signed_at    THEN RAISE EXCEPTION 'operator cannot modify column carrier_signed_at'; END IF;
  IF NEW.created_at           IS DISTINCT FROM OLD.created_at           THEN RAISE EXCEPTION 'operator cannot modify column created_at'; END IF;
  IF NEW.id                   IS DISTINCT FROM OLD.id                   THEN RAISE EXCEPTION 'operator cannot modify column id'; END IF;

  RETURN NEW;
END;
$$;