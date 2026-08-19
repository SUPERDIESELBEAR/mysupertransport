DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.assign_user_role(uuid, app_role)',
    'public.remove_user_role(uuid, app_role)',
    'public.search_audit_log(text, text, timestamptz, timestamptz, integer, integer)',
    'public.search_audit_log(text, text, timestamptz, timestamptz, integer, integer, uuid, uuid)',
    'public.get_staff_contact_info(uuid[])',
    'public.get_pei_queue()',
    'public.set_go_live_with_override(uuid, date, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;