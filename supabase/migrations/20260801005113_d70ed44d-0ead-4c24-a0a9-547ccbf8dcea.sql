-- =====================================================================
-- Function-level EXECUTE audit, group 1: trigger functions
-- =====================================================================
-- Open register #6 (function-level EXECUTE audit), first tranche.
--
-- Same inherited-default shape as the anon TABLE grants fixed earlier: a
-- blanket GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,
-- authenticated leaves every SECURITY DEFINER function in public callable by
-- an unauthenticated PostgREST client. Inventory taken 2026-08-01: 110
-- definer functions were anon-executable -- 51 trigger functions and 59
-- callable ones.
--
-- This migration closes the 51 TRIGGER functions. They return `trigger`, so
-- PostgREST will not expose them as RPC endpoints and they were not directly
-- reachable -- but the grants are meaningless noise that hides real findings
-- in the inventory, and a zero-argument definer function granted to anon is
-- exactly what nobody wants to be re-reading in a year.
--
-- SAFETY: PostgreSQL checks EXECUTE on a trigger function at CREATE TRIGGER
-- time, not when the trigger fires. Existing triggers are unaffected. Later
-- migrations run as the owner, so new triggers are unaffected too.
--
-- NOT IN THIS MIGRATION:
--   * 59 anon-executable CALLABLE definer functions. Roughly 14 are
--     intentional token-gated public endpoints (application drafts, PEI
--     responses, short links). The rest each need a body read to decide, and
--     rushing that is how a real endpoint gets broken. They are recorded in
--     the dated shrink-only allowlist in
--     src/test/definer-live-catalog.test.ts, which fails on any NEW
--     anon-executable function while leaving the known set to be worked
--     down deliberately.
--
-- The standing guard is src/test/definer-live-catalog.test.ts. It reads
-- pg_proc, because grants have been widened out of band on this database
-- before and a migration-file check cannot see that.
-- See docs/eld-mail-queue-acl-2026-08-01.md.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.assign_ica_amendment_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_osas_signed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_staff_help_thread_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_thread_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_pei_request_on_response() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.copy_stage2_docs_to_vault() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_contractor_pay_setup_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_demo_flag_management_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_eld_event_driver_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_go_live_ack_gate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ica_contracts_operator_column_whitelist() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ica_contracts_operator_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_message_edit_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_message_recipient_update_immutability() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_onboarding_status_self_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_rods_certified_continuity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_rods_day_lock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_rods_event_lock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.flag_faqs_for_reverification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_operator_deactivated() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_operator_document_soft_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_correction_request_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_dispatch_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_revision_attachment_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_revision_attachment_upload() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_equipment_return_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notifications_autofill_entity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_driver_on_upload_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_truck_down() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_operator_on_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_operators_on_fleet_share() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_owner_on_pay_setup_submitted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_staff_on_docs_uploaded() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_staff_on_osas_signed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_staff_on_release_note() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_staff_on_return_receipt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_ica_amendment_activated() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_recipient_message_tampering() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_active_dispatch_from_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_dot_binder_to_vh() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_dot_to_inspection_documents() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ica_completion_to_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_inspection_doc_to_dot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_irp_expiry_to_mo_plate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_mo_plate_expiry_to_irp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_photos_from_storage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_application_pei_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_operator_offboarding_steps_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_ica_amendment() FROM PUBLIC, anon, authenticated;