
-- Restrict what operators/truck-owners may change on onboarding_status.
CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Staff bypass (owner/management/onboarding_staff/dispatcher)
  IF uid IS NULL OR public.is_staff(uid) THEN
    RETURN NEW;
  END IF;

  -- For non-staff (operators self-updating, or linked truck owners), permit
  -- only decal-photo and ELD-signature self-service columns to change.
  -- Any other column must remain equal to its previous value.
  IF NEW.operator_id IS DISTINCT FROM OLD.operator_id
     OR NEW.mvr_status IS DISTINCT FROM OLD.mvr_status
     OR NEW.ch_status IS DISTINCT FROM OLD.ch_status
     OR NEW.mvr_ch_approval IS DISTINCT FROM OLD.mvr_ch_approval
     OR NEW.pe_screening IS DISTINCT FROM OLD.pe_screening
     OR NEW.pe_screening_result IS DISTINCT FROM OLD.pe_screening_result
     OR NEW.registration_status IS DISTINCT FROM OLD.registration_status
     OR NEW.form_2290 IS DISTINCT FROM OLD.form_2290
     OR NEW.truck_title IS DISTINCT FROM OLD.truck_title
     OR NEW.truck_photos IS DISTINCT FROM OLD.truck_photos
     OR NEW.truck_inspection IS DISTINCT FROM OLD.truck_inspection
     OR NEW.ica_status IS DISTINCT FROM OLD.ica_status
     OR NEW.mo_docs_submitted IS DISTINCT FROM OLD.mo_docs_submitted
     OR NEW.mo_expected_approval_date IS DISTINCT FROM OLD.mo_expected_approval_date
     OR NEW.mo_reg_received IS DISTINCT FROM OLD.mo_reg_received
     OR NEW.decal_method IS DISTINCT FROM OLD.decal_method
     OR NEW.decal_applied IS DISTINCT FROM OLD.decal_applied
     OR NEW.eld_method IS DISTINCT FROM OLD.eld_method
     OR NEW.eld_installed IS DISTINCT FROM OLD.eld_installed
     OR NEW.fuel_card_issued IS DISTINCT FROM OLD.fuel_card_issued
     OR NEW.insurance_added_date IS DISTINCT FROM OLD.insurance_added_date
     OR NEW.unit_number IS DISTINCT FROM OLD.unit_number
     OR NEW.fully_onboarded IS DISTINCT FROM OLD.fully_onboarded
     OR NEW.bg_check_notes IS DISTINCT FROM OLD.bg_check_notes
     OR NEW.mvr_requested_date IS DISTINCT FROM OLD.mvr_requested_date
     OR NEW.mvr_received_date IS DISTINCT FROM OLD.mvr_received_date
     OR NEW.ch_requested_date IS DISTINCT FROM OLD.ch_requested_date
     OR NEW.ch_received_date IS DISTINCT FROM OLD.ch_received_date
     OR NEW.pe_scheduled_date IS DISTINCT FROM OLD.pe_scheduled_date
     OR NEW.pe_results_date IS DISTINCT FROM OLD.pe_results_date
     OR NEW.ica_sent_date IS DISTINCT FROM OLD.ica_sent_date
     OR NEW.ica_signed_date IS DISTINCT FROM OLD.ica_signed_date
     OR NEW.ica_notes IS DISTINCT FROM OLD.ica_notes
     OR NEW.doc_notes IS DISTINCT FROM OLD.doc_notes
     OR NEW.mo_docs_submitted_date IS DISTINCT FROM OLD.mo_docs_submitted_date
     OR NEW.mo_notes IS DISTINCT FROM OLD.mo_notes
     OR NEW.insurance_policy_type IS DISTINCT FROM OLD.insurance_policy_type
     OR NEW.insurance_stated_value IS DISTINCT FROM OLD.insurance_stated_value
     OR NEW.insurance_notes IS DISTINCT FROM OLD.insurance_notes
     OR NEW.insurance_ai_company IS DISTINCT FROM OLD.insurance_ai_company
     OR NEW.insurance_ai_address IS DISTINCT FROM OLD.insurance_ai_address
     OR NEW.insurance_ai_city IS DISTINCT FROM OLD.insurance_ai_city
     OR NEW.insurance_ai_state IS DISTINCT FROM OLD.insurance_ai_state
     OR NEW.insurance_ai_zip IS DISTINCT FROM OLD.insurance_ai_zip
     OR NEW.insurance_ai_email IS DISTINCT FROM OLD.insurance_ai_email
     OR NEW.insurance_ch_company IS DISTINCT FROM OLD.insurance_ch_company
     OR NEW.insurance_ch_address IS DISTINCT FROM OLD.insurance_ch_address
     OR NEW.insurance_ch_city IS DISTINCT FROM OLD.insurance_ch_city
     OR NEW.insurance_ch_state IS DISTINCT FROM OLD.insurance_ch_state
     OR NEW.insurance_ch_zip IS DISTINCT FROM OLD.insurance_ch_zip
     OR NEW.insurance_ch_email IS DISTINCT FROM OLD.insurance_ch_email
     OR NEW.insurance_ch_same_as_ai IS DISTINCT FROM OLD.insurance_ch_same_as_ai
     OR NEW.paper_logbook_approved IS DISTINCT FROM OLD.paper_logbook_approved
     OR NEW.temp_decal_approved IS DISTINCT FROM OLD.temp_decal_approved
     OR NEW.exception_notes IS DISTINCT FROM OLD.exception_notes
     OR NEW.exception_approved_by IS DISTINCT FROM OLD.exception_approved_by
     OR NEW.exception_approved_at IS DISTINCT FROM OLD.exception_approved_at
     OR NEW.dispatch_ready_orientation IS DISTINCT FROM OLD.dispatch_ready_orientation
     OR NEW.dispatch_ready_consortium IS DISTINCT FROM OLD.dispatch_ready_consortium
     OR NEW.dispatch_ready_first_assigned IS DISTINCT FROM OLD.dispatch_ready_first_assigned
     OR NEW.go_live_date IS DISTINCT FROM OLD.go_live_date
     OR NEW.operator_type IS DISTINCT FROM OLD.operator_type
     OR NEW.eld_serial_number IS DISTINCT FROM OLD.eld_serial_number
     OR NEW.dash_cam_number IS DISTINCT FROM OLD.dash_cam_number
     OR NEW.bestpass_number IS DISTINCT FROM OLD.bestpass_number
     OR NEW.fuel_card_number IS DISTINCT FROM OLD.fuel_card_number
     OR NEW.cost_mo_registration IS DISTINCT FROM OLD.cost_mo_registration
     OR NEW.cost_form_2290 IS DISTINCT FROM OLD.cost_form_2290
     OR NEW.cost_other IS DISTINCT FROM OLD.cost_other
     OR NEW.cost_other_description IS DISTINCT FROM OLD.cost_other_description
     OR NEW.cost_notes IS DISTINCT FROM OLD.cost_notes
     OR NEW.qpassport_url IS DISTINCT FROM OLD.qpassport_url
     OR NEW.pe_receipt_url IS DISTINCT FROM OLD.pe_receipt_url
     OR NEW.truck_year IS DISTINCT FROM OLD.truck_year
     OR NEW.truck_make IS DISTINCT FROM OLD.truck_make
     OR NEW.truck_model IS DISTINCT FROM OLD.truck_model
     OR NEW.truck_vin IS DISTINCT FROM OLD.truck_vin
     OR NEW.truck_plate IS DISTINCT FROM OLD.truck_plate
     OR NEW.truck_plate_state IS DISTINCT FROM OLD.truck_plate_state
     OR NEW.pe_results_doc_url IS DISTINCT FROM OLD.pe_results_doc_url
     OR NEW.form_2290_owner_provided IS DISTINCT FROM OLD.form_2290_owner_provided
     OR NEW.trailer_number IS DISTINCT FROM OLD.trailer_number
     OR NEW.eld_exempt IS DISTINCT FROM OLD.eld_exempt
     OR NEW.eld_exempt_reason IS DISTINCT FROM OLD.eld_exempt_reason
     OR NEW.equipment_return_date IS DISTINCT FROM OLD.equipment_return_date
     OR NEW.equipment_return_notes IS DISTINCT FROM OLD.equipment_return_notes
     OR NEW.eld_assignment_state IS DISTINCT FROM OLD.eld_assignment_state
     OR NEW.dash_cam_assignment_state IS DISTINCT FROM OLD.dash_cam_assignment_state
     OR NEW.bestpass_assignment_state IS DISTINCT FROM OLD.bestpass_assignment_state
     OR NEW.fuel_card_assignment_state IS DISTINCT FROM OLD.fuel_card_assignment_state
     OR NEW.decal_assignment_state IS DISTINCT FROM OLD.decal_assignment_state
     OR NEW.eld_shipped_to_driver IS DISTINCT FROM OLD.eld_shipped_to_driver
     OR NEW.dash_cam_shipped_to_driver IS DISTINCT FROM OLD.dash_cam_shipped_to_driver
     OR NEW.bestpass_shipped_to_driver IS DISTINCT FROM OLD.bestpass_shipped_to_driver
     OR NEW.fuel_card_shipped_to_driver IS DISTINCT FROM OLD.fuel_card_shipped_to_driver
     OR NEW.decal_shipped_to_driver IS DISTINCT FROM OLD.decal_shipped_to_driver
     OR NEW.eld_awaiting_return_shipment IS DISTINCT FROM OLD.eld_awaiting_return_shipment
     OR NEW.dash_cam_awaiting_return_shipment IS DISTINCT FROM OLD.dash_cam_awaiting_return_shipment
     OR NEW.bestpass_awaiting_return_shipment IS DISTINCT FROM OLD.bestpass_awaiting_return_shipment
     OR NEW.fuel_card_awaiting_return_shipment IS DISTINCT FROM OLD.fuel_card_awaiting_return_shipment
     OR NEW.decal_awaiting_return_shipment IS DISTINCT FROM OLD.decal_awaiting_return_shipment
     OR NEW.eld_delivery_method IS DISTINCT FROM OLD.eld_delivery_method
     OR NEW.dash_cam_delivery_method IS DISTINCT FROM OLD.dash_cam_delivery_method
     OR NEW.bestpass_delivery_method IS DISTINCT FROM OLD.bestpass_delivery_method
     OR NEW.fuel_card_delivery_method IS DISTINCT FROM OLD.fuel_card_delivery_method
     OR NEW.decal_delivery_method IS DISTINCT FROM OLD.decal_delivery_method
     OR NEW.eld_verified_at IS DISTINCT FROM OLD.eld_verified_at
     OR NEW.eld_verified_by IS DISTINCT FROM OLD.eld_verified_by
     OR NEW.dash_cam_verified_at IS DISTINCT FROM OLD.dash_cam_verified_at
     OR NEW.dash_cam_verified_by IS DISTINCT FROM OLD.dash_cam_verified_by
     OR NEW.bestpass_verified_at IS DISTINCT FROM OLD.bestpass_verified_at
     OR NEW.bestpass_verified_by IS DISTINCT FROM OLD.bestpass_verified_by
     OR NEW.fuel_card_verified_at IS DISTINCT FROM OLD.fuel_card_verified_at
     OR NEW.fuel_card_verified_by IS DISTINCT FROM OLD.fuel_card_verified_by
     OR NEW.return_instructions_sent_at IS DISTINCT FROM OLD.return_instructions_sent_at
     OR NEW.return_instructions_sent_by IS DISTINCT FROM OLD.return_instructions_sent_by
     OR NEW.equipment_return_completed_at IS DISTINCT FROM OLD.equipment_return_completed_at
  THEN
    RAISE EXCEPTION 'Operators/truck owners may only self-update decal photos and ELD signature fields on onboarding_status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_onboarding_status_self_update_trg ON public.onboarding_status;
CREATE TRIGGER enforce_onboarding_status_self_update_trg
BEFORE UPDATE ON public.onboarding_status
FOR EACH ROW
EXECUTE FUNCTION public.enforce_onboarding_status_self_update();

-- Restrict what operators may change on contractor_pay_setup.
-- Once submitted, prevent operator edits to keep the audited action immutable.
CREATE OR REPLACE FUNCTION public.enforce_contractor_pay_setup_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR public.is_staff(uid) THEN
    RETURN NEW;
  END IF;

  -- Operators cannot change identity/audit anchors.
  IF NEW.operator_id IS DISTINCT FROM OLD.operator_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Operators cannot modify operator_id or created_at on contractor_pay_setup';
  END IF;

  -- Once submitted, the record is locked to operators (audited action).
  IF OLD.submitted_at IS NOT NULL THEN
    IF NEW.terms_accepted IS DISTINCT FROM OLD.terms_accepted
       OR NEW.terms_accepted_at IS DISTINCT FROM OLD.terms_accepted_at
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.contractor_type IS DISTINCT FROM OLD.contractor_type
       OR NEW.legal_first_name IS DISTINCT FROM OLD.legal_first_name
       OR NEW.legal_last_name IS DISTINCT FROM OLD.legal_last_name
       OR NEW.business_name IS DISTINCT FROM OLD.business_name
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.w9_file_name IS DISTINCT FROM OLD.w9_file_name
       OR NEW.w9_file_path IS DISTINCT FROM OLD.w9_file_path
       OR NEW.w9_url IS DISTINCT FROM OLD.w9_url
       OR NEW.void_check_file_name IS DISTINCT FROM OLD.void_check_file_name
       OR NEW.void_check_file_path IS DISTINCT FROM OLD.void_check_file_path
       OR NEW.void_check_url IS DISTINCT FROM OLD.void_check_url
    THEN
      RAISE EXCEPTION 'Submitted pay setup is locked; contact staff to make changes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_contractor_pay_setup_self_update_trg ON public.contractor_pay_setup;
CREATE TRIGGER enforce_contractor_pay_setup_self_update_trg
BEFORE UPDATE ON public.contractor_pay_setup
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contractor_pay_setup_self_update();
