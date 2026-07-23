-- 1. Column to record when the driver was notified the sheet is ready to sign.
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS equipment_asset_sheet_ready_notified_at timestamptz;

-- 2. Trigger function: fires after any verify-stamp column changes.
CREATE OR REPLACE FUNCTION public.notify_driver_equipment_sheet_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_all_verified boolean;
  v_any_assigned boolean;
  v_pref_enabled boolean;
BEGIN
  -- Only proceed if a verify column actually changed.
  IF NOT (
       NEW.eld_verified_at       IS DISTINCT FROM OLD.eld_verified_at
    OR NEW.dash_cam_verified_at  IS DISTINCT FROM OLD.dash_cam_verified_at
    OR NEW.bestpass_verified_at  IS DISTINCT FROM OLD.bestpass_verified_at
    OR NEW.fuel_card_verified_at IS DISTINCT FROM OLD.fuel_card_verified_at
  ) THEN
    RETURN NEW;
  END IF;

  -- If sheet is signed, do nothing (no re-notify, don't touch stamp).
  IF NEW.eld_signature_signed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Compute readiness: every ASSIGNED verifiable line must have a verified stamp.
  v_any_assigned := (
       COALESCE(NEW.eld_assignment_state, 'not_assigned')       <> 'not_assigned'
    OR COALESCE(NEW.dash_cam_assignment_state, 'not_assigned')  <> 'not_assigned'
    OR COALESCE(NEW.bestpass_assignment_state, 'not_assigned')  <> 'not_assigned'
    OR COALESCE(NEW.fuel_card_assignment_state, 'not_assigned') <> 'not_assigned'
  );

  v_all_verified := (
        (COALESCE(NEW.eld_assignment_state,'not_assigned')       = 'not_assigned' OR NEW.eld_verified_at       IS NOT NULL)
    AND (COALESCE(NEW.dash_cam_assignment_state,'not_assigned')  = 'not_assigned' OR NEW.dash_cam_verified_at  IS NOT NULL)
    AND (COALESCE(NEW.bestpass_assignment_state,'not_assigned')  = 'not_assigned' OR NEW.bestpass_verified_at  IS NOT NULL)
    AND (COALESCE(NEW.fuel_card_assignment_state,'not_assigned') = 'not_assigned' OR NEW.fuel_card_verified_at IS NOT NULL)
  );

  -- If we're no longer fully verified, clear the stamp so a future full-verify re-notifies.
  IF NOT v_all_verified OR NOT v_any_assigned THEN
    IF NEW.equipment_asset_sheet_ready_notified_at IS NOT NULL THEN
      NEW.equipment_asset_sheet_ready_notified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Already notified this cycle → nothing to do.
  IF NEW.equipment_asset_sheet_ready_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the driver's auth user id.
  SELECT o.user_id INTO v_user_id
  FROM public.operators o
  WHERE o.id = NEW.operator_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Respect the driver's in-app onboarding_update preference (default enabled).
  SELECT COALESCE(
    (SELECT in_app_enabled FROM public.notification_preferences
     WHERE user_id = v_user_id AND event_type = 'onboarding_update' LIMIT 1),
    TRUE
  ) INTO v_pref_enabled;

  IF v_pref_enabled THEN
    INSERT INTO public.notifications (user_id, title, body, type, channel, link, priority)
    VALUES (
      v_user_id,
      'Equipment Asset Sheet ready to sign',
      'Your coordinator verified all of your equipment. Tap to review and sign your Owner Operator Equipment Receipt Acknowledgment.',
      'onboarding_update',
      'in_app',
      '/operator?focus=equipment-sheet',
      'high'
    );
  END IF;

  -- Stamp so we don't re-notify unless things change.
  NEW.equipment_asset_sheet_ready_notified_at := now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_driver_equipment_sheet_ready() FROM PUBLIC, anon, authenticated;

-- 3. Wire the BEFORE UPDATE trigger. BEFORE so we can mutate NEW.stamp on the same row.
DROP TRIGGER IF EXISTS trg_notify_driver_equipment_sheet_ready ON public.onboarding_status;
CREATE TRIGGER trg_notify_driver_equipment_sheet_ready
BEFORE UPDATE ON public.onboarding_status
FOR EACH ROW
EXECUTE FUNCTION public.notify_driver_equipment_sheet_ready();