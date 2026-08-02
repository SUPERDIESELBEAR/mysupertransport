-- The twelve functions rewritten for notification-delivery isolation were
-- re-authored with `SET search_path TO 'public'`, dropping the project's
-- standard `'public', 'extensions'` pin. Restore it. Bodies are unchanged.
ALTER FUNCTION public.approve_application_correction(p_token text, p_signed_name text, p_signature_url text, p_meta jsonb) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.handle_operator_deactivated() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_driver_on_upload_status_change() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_on_truck_down() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_operator_on_status_change() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_operators_on_fleet_share() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_owner_on_pay_setup_submitted() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_staff_on_docs_uploaded() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_staff_on_osas_signed() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_staff_on_release_note() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.notify_staff_on_return_receipt() SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.reject_application_correction(p_token text, p_reason text, p_meta jsonb) SET search_path TO 'public', 'extensions';
