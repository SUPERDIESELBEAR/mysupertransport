
-- 1) Allow operators (drivers) to insert their own per_driver inspection_documents.
CREATE POLICY "Operators can insert own per-driver inspection docs"
  ON public.inspection_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    scope = 'per_driver'
    AND driver_id = auth.uid()
    AND uploaded_by = auth.uid()
    AND shared_with_fleet IS NOT TRUE
  );

-- 2) Defense-in-depth: align enforce_onboarding_status_self_update with sibling
--    guards so the same cascade-bypass flags are honored consistently.
CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR public.is_staff(uid) THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.ica_sync_cascade', true) = '1'
     OR current_setting('app.equipment_asset_sheet_migration', true) = '1'
     OR current_setting('app.equipment_asset_signature_execute', true) = '1'
  THEN
    RETURN NEW;
  END IF;

  IF NEW.operator_id IS DISTINCT FROM OLD.operator_id
     OR NEW.mvr_status IS DISTINCT FROM OLD.mvr_status
     OR NEW.ch_status IS DISTINCT FROM OLD.ch_status
     OR NEW.mvr_ch_approval IS DISTINCT FROM OLD.mvr_ch_approval
     OR NEW.pe_screening IS DISTINCT FROM OLD.pe_screening
     OR NEW.pe_screening_result IS DISTINCT FROM OLD.pe_screening_result
     OR NEW.registration_status IS DISTINCT FROM OLD.registration_status
     OR NEW.form_2290 IS DISTINCT FROM OLD.form_2290
     OR NEW.truck_title IS DISTINCT FROM OLD.truck_title
     OR NEW.truck_inspection IS DISTINCT FROM OLD.truck_inspection
     OR NEW.ica_status IS DISTINCT FROM OLD.ica_status
     OR NEW.mo_docs_submitted IS DISTINCT FROM OLD.mo_docs_submitted
     OR NEW.mo_expected_approval_date IS DISTINCT FROM OLD.mo_expected_approval_date
     OR NEW.mo_reg_received IS DISTINCT FROM OLD.mo_reg_received
     OR NEW.decal_method IS DISTINCT FROM OLD.decal_method
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
  THEN
    RAISE EXCEPTION 'Operators/truck owners may only self-update decal photos and ELD signature fields on onboarding_status';
  END IF;

  RETURN NEW;
END;
$function$;
