CREATE OR REPLACE FUNCTION public.enforce_eld_extension_request_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A filed request is part of the compliance record. The only exemption is
    -- a demo sandbox row: the demo reset deletes eld_malfunction_events, which
    -- cascades here, and a demo filing is not a compliance record. Real
    -- filings (is_demo = false) stay undeletable by every role and path.
    IF OLD.status <> 'draft' AND NOT COALESCE(OLD.is_demo, false) THEN
      RAISE EXCEPTION 'A filed extension request is part of the compliance record and cannot be deleted.'
        USING ERRCODE = 'P0114';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    IF (NEW.event_id, NEW.operator_id,
        NEW.filer_name, NEW.filer_title, NEW.filer_phone, NEW.filer_email,
        NEW.carrier_legal_name, NEW.carrier_usdot, NEW.carrier_mc,
        NEW.carrier_main_office_address, NEW.fmcsa_division_state,
        NEW.device_provider, NEW.device_make, NEW.device_model, NEW.device_serial,
        NEW.eld_registration_id,
        NEW.driver_name, NEW.driver_license_number, NEW.driver_license_state,
        NEW.vehicle_unit_number, NEW.vehicle_vin,
        NEW.malfunction_code, NEW.malfunction_description, NEW.discovered_at,
        NEW.reported_at, NEW.discovered_location, NEW.repair_deadline,
        NEW.actions_taken, NEW.why_extension_needed, NEW.requested_through,
        NEW.pdf_path, NEW.generated_at, NEW.submitted_at, NEW.submitted_by)
       IS DISTINCT FROM
       (OLD.event_id, OLD.operator_id,
        OLD.filer_name, OLD.filer_title, OLD.filer_phone, OLD.filer_email,
        OLD.carrier_legal_name, OLD.carrier_usdot, OLD.carrier_mc,
        OLD.carrier_main_office_address, OLD.fmcsa_division_state,
        OLD.device_provider, OLD.device_make, OLD.device_model, OLD.device_serial,
        OLD.eld_registration_id,
        OLD.driver_name, OLD.driver_license_number, OLD.driver_license_state,
        OLD.vehicle_unit_number, OLD.vehicle_vin,
        OLD.malfunction_code, OLD.malfunction_description, OLD.discovered_at,
        OLD.reported_at, OLD.discovered_location, OLD.repair_deadline,
        OLD.actions_taken, OLD.why_extension_needed, OLD.requested_through,
        OLD.pdf_path, OLD.generated_at, OLD.submitted_at, OLD.submitted_by)
    THEN
      RAISE EXCEPTION 'An extension request is append-only once it has been filed with FMCSA.'
        USING ERRCODE = 'P0110';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('submitted','withdrawn'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('granted','denied','withdrawn'))
      OR (OLD.status = 'denied'    AND NEW.status = 'withdrawn')
    ) THEN
      RAISE EXCEPTION 'An extension request cannot move from % to %.', OLD.status, NEW.status
        USING ERRCODE = 'P0111';
    END IF;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  IF NEW.status IN ('granted','denied') THEN
    IF NEW.response_date IS NULL OR COALESCE(btrim(NEW.response_notes), '') = '' THEN
      RAISE EXCEPTION 'Recording an FMCSA response needs the response date and what FMCSA said.'
        USING ERRCODE = 'P0113';
    END IF;
    IF NEW.status = 'granted' AND NEW.granted_through IS NULL THEN
      RAISE EXCEPTION 'A granted extension must name the date the relief runs through.'
        USING ERRCODE = 'P0112';
    END IF;
    IF NEW.response_status_at IS NULL THEN
      NEW.response_status_at := now();
    END IF;
  END IF;

  IF OLD.response_status_at IS NOT NULL
     AND NEW.response_status_at IS DISTINCT FROM OLD.response_status_at THEN
    RAISE EXCEPTION 'The time an FMCSA response was recorded is immutable once set.'
      USING ERRCODE = 'P0115';
  END IF;

  IF OLD.status IN ('granted','denied') THEN
    IF (NEW.response_date, NEW.response_reference, NEW.response_notes,
        NEW.granted_through, NEW.responded_by)
       IS DISTINCT FROM
       (OLD.response_date, OLD.response_reference, OLD.response_notes,
        OLD.granted_through, OLD.responded_by)
    THEN
      RAISE EXCEPTION 'An FMCSA response cannot be revised after it was recorded.'
        USING ERRCODE = 'P0110';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;