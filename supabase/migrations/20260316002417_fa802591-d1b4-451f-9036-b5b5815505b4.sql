CREATE OR REPLACE FUNCTION public.notify_operator_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_pref_enabled BOOLEAN;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.operators
  WHERE id = NEW.operator_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(
    (SELECT in_app_enabled FROM public.notification_preferences
     WHERE user_id = v_user_id AND event_type = 'onboarding_update'
     LIMIT 1),
    TRUE
  ) INTO v_pref_enabled;

  IF NOT v_pref_enabled THEN RETURN NEW; END IF;

  IF OLD.form_2290 IS DISTINCT FROM NEW.form_2290 AND NEW.form_2290 = 'received' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Form 2290 reviewed ✓', 'Your Form 2290 has been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.truck_title IS DISTINCT FROM NEW.truck_title AND NEW.truck_title = 'received' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Truck Title reviewed ✓', 'Your Truck Title has been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.truck_photos IS DISTINCT FROM NEW.truck_photos AND NEW.truck_photos = 'received' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Truck Photos reviewed ✓', 'Your Truck Photos have been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.truck_inspection IS DISTINCT FROM NEW.truck_inspection AND NEW.truck_inspection = 'received' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Truck Inspection reviewed ✓', 'Your Truck Inspection report has been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.pe_screening IS DISTINCT FROM NEW.pe_screening AND NEW.pe_screening = 'scheduled' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Drug screening scheduled', 'Your pre-employment drug screening has been scheduled. Check your email for the clinic and instructions.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.mvr_ch_approval IS DISTINCT FROM NEW.mvr_ch_approval THEN
    IF NEW.mvr_ch_approval = 'approved' THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Background check cleared ✓', 'Your MVR and Clearinghouse checks have been approved. You are cleared to move forward.', 'onboarding_update', 'in_app', '/operator');
    ELSIF NEW.mvr_ch_approval = 'denied' THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Background check — action required', 'An issue was found during your background screening. Your coordinator will reach out with next steps.', 'onboarding_update', 'in_app', '/operator');
    END IF;
  END IF;

  IF OLD.ica_status IS DISTINCT FROM NEW.ica_status THEN
    IF NEW.ica_status = 'sent_for_signature' THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Your ICA is ready to sign', 'Your Independent Contractor Agreement has been prepared. Sign it from the ICA tab in your portal.', 'onboarding_update', 'in_app', '/operator');
    ELSIF NEW.ica_status = 'complete' THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'ICA signed & complete ✓', 'Your Independent Contractor Agreement is fully signed. Moving to Missouri registration.', 'onboarding_update', 'in_app', '/operator');
    END IF;
  END IF;

  IF OLD.mo_docs_submitted IS DISTINCT FROM NEW.mo_docs_submitted AND NEW.mo_docs_submitted = 'submitted' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'MO registration filed', 'Your Missouri registration documents have been submitted to the state. Approval typically takes 2–4 weeks.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.mo_reg_received IS DISTINCT FROM NEW.mo_reg_received AND NEW.mo_reg_received = 'yes' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Missouri registration received ✓', 'Your Missouri apportioned registration has been approved. Moving to equipment setup.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.decal_applied IS DISTINCT FROM NEW.decal_applied AND NEW.decal_applied = 'yes' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Decal applied to your truck ✓', 'Your company decal has been applied to your truck.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.eld_installed IS DISTINCT FROM NEW.eld_installed AND NEW.eld_installed = 'yes' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'ELD device installed ✓', 'Your Electronic Logging Device has been installed and is ready for use.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.fuel_card_issued IS DISTINCT FROM NEW.fuel_card_issued AND NEW.fuel_card_issued = 'yes' THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Fuel card issued ✓', 'Your company fuel card has been issued. Your coordinator will provide it to you directly.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF OLD.insurance_added_date IS DISTINCT FROM NEW.insurance_added_date AND NEW.insurance_added_date IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, 'Added to insurance policy ✓', 'You have been added to the company insurance policy. Unit number assignment is next.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  IF (OLD.fully_onboarded IS NULL OR OLD.fully_onboarded = FALSE) AND NEW.fully_onboarded = TRUE THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link)
    VALUES (v_user_id, '🎉 You are fully onboarded!', 'Congratulations! All stages are complete — you are ready to start dispatching.', 'onboarding_update', 'in_app', '/operator');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_onboarding_status_change ON public.onboarding_status;

CREATE TRIGGER on_onboarding_status_change
  AFTER UPDATE ON public.onboarding_status
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_operator_on_status_change();