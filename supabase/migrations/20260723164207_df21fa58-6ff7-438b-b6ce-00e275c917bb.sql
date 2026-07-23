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
  IF NOT (
       NEW.eld_verified_at       IS DISTINCT FROM OLD.eld_verified_at
    OR NEW.dash_cam_verified_at  IS DISTINCT FROM OLD.dash_cam_verified_at
    OR NEW.bestpass_verified_at  IS DISTINCT FROM OLD.bestpass_verified_at
    OR NEW.fuel_card_verified_at IS DISTINCT FROM OLD.fuel_card_verified_at
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.eld_signature_signed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

  IF NOT v_all_verified OR NOT v_any_assigned THEN
    IF NEW.equipment_asset_sheet_ready_notified_at IS NOT NULL THEN
      NEW.equipment_asset_sheet_ready_notified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.equipment_asset_sheet_ready_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.user_id INTO v_user_id FROM public.operators o WHERE o.id = NEW.operator_id;
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

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
      '/operator/my-truck?focus=equipment-sheet',
      'high'
    );
  END IF;

  NEW.equipment_asset_sheet_ready_notified_at := now();
  RETURN NEW;
END;
$$;