-- Revoke surplus anon EXECUTE on class-(c) SECURITY DEFINER helpers.
-- Each was verified 2026-09-03 to have no unauthenticated call path:
-- no caller in src/ or supabase/functions/ under the anon key, and no RLS
-- policy or non-definer trigger reachable by anon (anon holds table
-- privileges only on applications INSERT and faq SELECT).
--
-- public.is_staff(uuid) is DELIBERATELY EXCLUDED: it is evaluated for anon by
-- the "Staff can insert applications" WITH CHECK on public.applications, the
-- "Staff can view all FAQs" USING clause on public.faq (both TO public), and
-- by the non-SECURITY DEFINER trigger validate_public_application_insert()
-- which runs as the inserting role on the public application form.

REVOKE EXECUTE ON FUNCTION public._audit_actor_name(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_own_rods_operator(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_truck_owner_for_operator(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_driver_message_staff(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_driver_contacts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_staff_auto_assigned_drivers(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_thread_participants(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unacked_go_live_blockers(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.operator_awaiting_return(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.operator_return_requested(uuid) FROM PUBLIC, anon;

-- Re-assert the grants the authenticated and service-role paths need.
GRANT EXECUTE ON FUNCTION public._audit_actor_name(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_rods_operator(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_truck_owner_for_operator(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_driver_message_staff(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_driver_contacts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_staff_auto_assigned_drivers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_thread_participants(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unacked_go_live_blockers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_awaiting_return(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_return_requested(uuid) TO authenticated, service_role;