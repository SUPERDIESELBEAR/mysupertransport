
CREATE OR REPLACE FUNCTION public.notify_operator_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      UUID;
  v_pref_enabled BOOLEAN;
  v_fn_url       CONSTANT TEXT := 'https://qgxpkcudwjmacrdcyvhj.supabase.co/functions/v1/notify-onboarding-update';
  v_anon_key     CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFneHBrY3Vkd2ptYWNyZGN5dmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDg3NDgsImV4cCI6MjA4ODQyNDc0OH0.LoP0_X7zPsOL4-GHQim1orOhlqk6znV6i-tGB7__66o';
BEGIN
  -- Resolve operator's auth user_id
  SELECT user_id INTO v_user_id
  FROM public.operators
  WHERE id = NEW.operator_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Check in-app preference (default: enabled)
  SELECT COALESCE(
    (SELECT in_app_enabled FROM public.notification_preferences
     WHERE user_id = v_user_id AND event_type = 'onboarding_update' LIMIT 1),
    TRUE
  ) INTO v_pref_enabled;

  -- ── Form 2290 ─────────────────────────────────────────────────────────────
  IF OLD.form_2290 IS DISTINCT FROM NEW.form_2290 AND NEW.form_2290 = 'received' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Form 2290 reviewed ✓', 'Your Form 2290 has been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'document_received')
    );
  END IF;

  -- ── Truck Title ───────────────────────────────────────────────────────────
  IF OLD.truck_title IS DISTINCT FROM NEW.truck_title AND NEW.truck_title = 'received' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Truck Title reviewed ✓', 'Your Truck Title has been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'document_received')
    );
  END IF;

  -- ── Truck Photos ──────────────────────────────────────────────────────────
  IF OLD.truck_photos IS DISTINCT FROM NEW.truck_photos AND NEW.truck_photos = 'received' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Truck Photos reviewed ✓', 'Your Truck Photos have been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'document_received')
    );
  END IF;

  -- ── Truck Inspection ──────────────────────────────────────────────────────
  IF OLD.truck_inspection IS DISTINCT FROM NEW.truck_inspection AND NEW.truck_inspection = 'received' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Truck Inspection reviewed ✓', 'Your Truck Inspection report has been received and confirmed by your coordinator.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'document_received')
    );
  END IF;

  -- ── Drug Screening Scheduled ──────────────────────────────────────────────
  IF OLD.pe_screening IS DISTINCT FROM NEW.pe_screening AND NEW.pe_screening = 'scheduled' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Drug screening scheduled', 'Your pre-employment drug screening has been scheduled. Check your email for the clinic and instructions.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'drug_screening_scheduled')
    );
  END IF;

  -- ── Background Check Approved / Denied ────────────────────────────────────
  IF OLD.mvr_ch_approval IS DISTINCT FROM NEW.mvr_ch_approval THEN
    IF NEW.mvr_ch_approval = 'approved' THEN
      IF v_pref_enabled THEN
        INSERT INTO public.notifications (user_id, title, body, type, channel, link)
        VALUES (v_user_id, 'Background check cleared ✓', 'Your MVR and Clearinghouse checks have been approved. You are cleared to move forward.', 'onboarding_update', 'in_app', '/operator');
      END IF;
      PERFORM net.http_post(
        url     := v_fn_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
        body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'background_check_cleared')
      );
    ELSIF NEW.mvr_ch_approval = 'denied' THEN
      IF v_pref_enabled THEN
        INSERT INTO public.notifications (user_id, title, body, type, channel, link)
        VALUES (v_user_id, 'Background check — action required', 'An issue was found during your background screening. Your coordinator will reach out with next steps.', 'onboarding_update', 'in_app', '/operator');
      END IF;
      PERFORM net.http_post(
        url     := v_fn_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
        body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'background_check_flagged')
      );
    END IF;
  END IF;

  -- ── ICA Status ────────────────────────────────────────────────────────────
  IF OLD.ica_status IS DISTINCT FROM NEW.ica_status THEN
    IF NEW.ica_status = 'sent_for_signature' THEN
      IF v_pref_enabled THEN
        INSERT INTO public.notifications (user_id, title, body, type, channel, link)
        VALUES (v_user_id, 'Your ICA is ready to sign', 'Your Independent Contractor Agreement has been prepared. Sign it from the ICA tab in your portal.', 'onboarding_update', 'in_app', '/operator');
      END IF;
      PERFORM net.http_post(
        url     := v_fn_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
        body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'ica_ready_to_sign')
      );
    ELSIF NEW.ica_status = 'complete' THEN
      IF v_pref_enabled THEN
        INSERT INTO public.notifications (user_id, title, body, type, channel, link)
        VALUES (v_user_id, 'ICA signed & complete ✓', 'Your Independent Contractor Agreement is fully signed. Moving to Missouri registration.', 'onboarding_update', 'in_app', '/operator');
      END IF;
      PERFORM net.http_post(
        url     := v_fn_url,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
        body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'ica_complete')
      );
    END IF;
  END IF;

  -- ── MO Docs Submitted ────────────────────────────────────────────────────
  IF OLD.mo_docs_submitted IS DISTINCT FROM NEW.mo_docs_submitted AND NEW.mo_docs_submitted = 'submitted' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'MO registration filed', 'Your Missouri registration documents have been submitted to the state. Approval typically takes 2–4 weeks.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'mo_reg_filed')
    );
  END IF;

  -- ── MO Registration Received ─────────────────────────────────────────────
  IF OLD.mo_reg_received IS DISTINCT FROM NEW.mo_reg_received AND NEW.mo_reg_received = 'yes' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Missouri registration received ✓', 'Your Missouri apportioned registration has been approved. Moving to equipment setup.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'mo_reg_received')
    );
  END IF;

  -- ── Decal Applied ────────────────────────────────────────────────────────
  IF OLD.decal_applied IS DISTINCT FROM NEW.decal_applied AND NEW.decal_applied = 'yes' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Decal applied to your truck ✓', 'Your company decal has been applied to your truck.', 'onboarding_update', 'in_app', '/operator');
    END IF;
  END IF;

  -- ── ELD Installed ────────────────────────────────────────────────────────
  IF OLD.eld_installed IS DISTINCT FROM NEW.eld_installed AND NEW.eld_installed = 'yes' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'ELD device installed ✓', 'Your Electronic Logging Device has been installed and is ready for use.', 'onboarding_update', 'in_app', '/operator');
    END IF;
  END IF;

  -- ── Fuel Card Issued ─────────────────────────────────────────────────────
  IF OLD.fuel_card_issued IS DISTINCT FROM NEW.fuel_card_issued AND NEW.fuel_card_issued = 'yes' THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Fuel card issued ✓', 'Your company fuel card has been issued. Your coordinator will provide it to you directly.', 'onboarding_update', 'in_app', '/operator');
    END IF;
  END IF;

  -- ── Insurance Added ──────────────────────────────────────────────────────
  IF OLD.insurance_added_date IS DISTINCT FROM NEW.insurance_added_date AND NEW.insurance_added_date IS NOT NULL THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, 'Added to insurance policy ✓', 'You have been added to the company insurance policy. Unit number assignment is next.', 'onboarding_update', 'in_app', '/operator');
    END IF;
  END IF;

  -- ── Paper Logbook Exception Approved ─────────────────────────────────────
  IF (OLD.paper_logbook_approved IS DISTINCT FROM NEW.paper_logbook_approved)
     AND NEW.paper_logbook_approved = TRUE
     AND (OLD.paper_logbook_approved IS NULL OR OLD.paper_logbook_approved = FALSE)
  THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_user_id,
        '⚠️ Exception approved — Paper Logbook',
        'You are cleared to operate with a paper logbook while traveling to the SUPERTRANSPORT shop for ELD installation.',
        'onboarding_update',
        'in_app',
        '/operator'
      );
    END IF;
  END IF;

  -- ── Temporary Decals Exception Approved ──────────────────────────────────
  IF (OLD.temp_decal_approved IS DISTINCT FROM NEW.temp_decal_approved)
     AND NEW.temp_decal_approved = TRUE
     AND (OLD.temp_decal_approved IS NULL OR OLD.temp_decal_approved = FALSE)
  THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_user_id,
        '⚠️ Exception approved — Temporary Decals',
        'You are cleared to operate with temporary decals while traveling to the SUPERTRANSPORT shop for permanent decal installation.',
        'onboarding_update',
        'in_app',
        '/operator'
      );
    END IF;
  END IF;

  -- ── Go-Live Date Set ─────────────────────────────────────────────────────
  IF OLD.go_live_date IS DISTINCT FROM NEW.go_live_date AND NEW.go_live_date IS NOT NULL THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (
        v_user_id,
        '🚛 Go-live date confirmed!',
        'Your go-live date has been set to ' || to_char(NEW.go_live_date, 'Month DD, YYYY') || '. You are cleared to start dispatching.',
        'onboarding_update',
        'in_app',
        '/operator'
      );
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'go_live_set')
    );
  END IF;

  -- ── Fully Onboarded ──────────────────────────────────────────────────────
  IF (OLD.fully_onboarded IS NULL OR OLD.fully_onboarded = FALSE) AND NEW.fully_onboarded = TRUE THEN
    IF v_pref_enabled THEN
      INSERT INTO public.notifications (user_id, title, body, type, channel, link)
      VALUES (v_user_id, '🎉 You are fully onboarded!', 'Congratulations! All stages are complete — you are ready to start dispatching.', 'onboarding_update', 'in_app', '/operator');
    END IF;
    PERFORM net.http_post(
      url     := v_fn_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon_key),
      body    := jsonb_build_object('operator_id', NEW.operator_id::text, 'milestone_key', 'fully_onboarded')
    );
  END IF;

  RETURN NEW;
END;
$function$;
