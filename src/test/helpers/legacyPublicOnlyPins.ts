/**
 * Shared between the two search_path guards.
 *
 * definer-search-path.test.ts consumes it as the file-based exemption list.
 * definer-live-catalog.test.ts consumes it to prove the two guards agree:
 * every public-only pin found live must be one of these, or be listed in that
 * file's LIVE_ONLY_PUBLIC_PINS. It lives here rather than in either test
 * because a test file cannot be imported by another test file without its
 * describes being registered twice.
 */

/**
 * Legacy SECURITY DEFINER functions whose final definition still pins
 * `search_path` to `public` alone, without `extensions`.
 *
 * These are a real but low-severity defect: pinning to `public` only breaks
 * if the body calls an extension function unqualified. It is categorically
 * different from having NO pin, which inherits the caller's search_path and
 * is the privilege-escalation shape. None of these are unpinned.
 *
 * Entries are anchored `<migration file>::<signature>`. The file anchor
 * matters: if a listed function is re-authored in a LATER migration, the
 * resolver returns the new file, the anchored entry no longer matches, and
 * the exemption evaporates automatically. A re-authored-but-still-wrong
 * function therefore fails the guard rather than inheriting its old pass.
 * That is the mechanism that makes this list shrink rather than merely hold
 * steady.
 *
 * THIS LIST MAY ONLY SHRINK. LEGACY_MAX below is asserted, not advisory:
 * adding an entry requires editing the number too, which is a deliberate act
 * with a visible diff rather than a quiet append during a red-test fix.
 */
export const LEGACY_PUBLIC_ONLY_PINS: readonly string[] = [
  "20260518142644_816faa0d-9b1d-4e9b-8285-5d60c7fe84da.sql::public._audit_actor_name(uuid)",
  "20260727191658_491568bc-4bab-4670-903f-b7f05c17708b.sql::public.add_pei_staff_note(uuid, text)",
  "20260727202654_18fa0162-7ac2-4bd1-9c05-80afbbbbabbf.sql::public.archive_applicant_pei(uuid, text, text)",
  "20260727191658_491568bc-4bab-4670-903f-b7f05c17708b.sql::public.archive_applicant_pei(uuid, text)",
  "20260720153657_d81fc002-e4c6-4f66-804e-ede3bee9da67.sql::public.assign_ica_amendment_number()",
  "20260327200930_def071a4-28fb-4c91-bb65-f07eab4a8730.sql::public.assign_user_role(uuid, app_role)",
  "20260725144744_575a722a-c591-4c40-9db7-69505977eee7.sql::public.audit_osas_signed()",
  "20260728175402_7d26f2c4-2587-4004-804c-0b7a509c185a.sql::public.bump_staff_help_thread_updated_at()",
  "20260729154047_b1e9b99a-91e9-434e-99b8-89211bff5804.sql::public.bump_thread_last_message()",
  "20260729164130_664f7af1-9dae-4675-8277-c24aaf9ce862.sql::public.can_driver_message_staff(uuid, uuid)",
  "20260515183610_31d9c6cc-8a17-4ba1-adf6-c0daab0222b6.sql::public.cancel_application_correction(uuid)",
  "20260605194257_419dd1c2-ae16-4b88-88dc-62083bd861fa.sql::public.check_application_email_taken(text)",
  "20260513151918_1701f4a4-1d3f-4686-918d-2b6bbe53841c.sql::public.complete_pei_request_on_response()",
  
  "20260609121456_f3d54378-f762-4062-818d-76ec63094e29.sql::public.copy_stage2_docs_to_vault()",
  "20260715141217_a42671b1-708b-484a-af83-211c16d4923b.sql::public.enforce_contractor_pay_setup_self_update()",
  "20260728131454_288be1c0-a4c8-49d4-ba07-46630cb1816c.sql::public.enforce_demo_flag_management_only()",
  "20260723161323_21e54a90-814a-420f-a3c1-f670beba745a.sql::public.enforce_eld_signature_lock()",
  "20260618185610_96052999-3491-4f8a-99b2-032e2cb5cc05.sql::public.enforce_go_live_ack_gate()",
  "20260427110313_c4fdf046-3b01-41b7-b8a3-9bcb1caafcf4.sql::public.enforce_message_edit_rules()",
  "20260721112536_5b3b7f46-a765-4eed-a448-e93cfad37c70.sql::public.enforce_message_recipient_update_immutability()",
  "20260728153935_9d5ec2ab-16aa-4961-8a00-306cec8cbdc0.sql::public.enforce_onboarding_status_operator_column_whitelist()",
  "20260728161657_4fd4249d-d68b-4ed7-a694-af9a63644b6e.sql::public.enforce_onboarding_status_operator_update()",
  "20260726204550_66e0d319-22dc-4624-8a39-cd44b9b24336.sql::public.enforce_onboarding_status_self_update()",
  "20260710194318_f3cd6736-d810-4fb1-b0c6-361d11288e16.sql::public.flag_faqs_for_reverification()",
  "20260327151550_6d2637b6-91e9-456b-b705-45253a789b93.sql::public.get_application_by_draft_token(uuid)",
  "20260515183610_31d9c6cc-8a17-4ba1-adf6-c0daab0222b6.sql::public.get_application_correction_by_token(text)",
  "20260513151918_1701f4a4-1d3f-4686-918d-2b6bbe53841c.sql::public.get_application_pei_summary(uuid)",
  "20260416211554_45d4b817-c95f-480b-afbf-fdaacf793399.sql::public.get_equipment_shipping_for_operator(uuid)",
  "20260730164628_7162aa28-324e-4b4e-bef7-f5be85e7e202.sql::public.get_inspection_doc_by_token(uuid)",
  "20260727195451_f65f922b-e025-4ed4-86e4-b609458f05a3.sql::public.get_pei_queue()",
  "20260513153456_cf7023f6-f04b-41ab-9d7a-22a684c381c5.sql::public.get_pei_request_for_response(uuid)",
  "20260513151918_1701f4a4-1d3f-4686-918d-2b6bbe53841c.sql::public.get_pei_requests_needing_action()",
  "20260729161818_17cf3a9f-6df2-4a6a-abc8-9c2b0c874ce1.sql::public.get_thread_participants(uuid)",
  "20260307040223_48a3c504-85c4-409a-bd88-5f3aafd3f4d4.sql::public.get_user_roles(uuid)",
  "20260609121456_f3d54378-f762-4062-818d-76ec63094e29.sql::public.handle_operator_document_soft_delete()",
  "20260307040223_48a3c504-85c4-409a-bd88-5f3aafd3f4d4.sql::public.has_role(uuid, public.app_role)",
  "20260729234627_b6bc3761-1036-44c1-97a8-909fa2f98d0f.sql::public.is_own_rods_operator(uuid)",
  "20260327200930_def071a4-28fb-4c91-bb65-f07eab4a8730.sql::public.is_staff(uuid)",
  "20260729154047_b1e9b99a-91e9-434e-99b8-89211bff5804.sql::public.is_thread_participant(uuid, uuid)",
  "20260610105245_d4d7a7da-fec7-410b-a12b-4e67ce34d619.sql::public.is_truck_owner_for_operator(uuid, uuid)",
  "20260721181336_aa440d86-7089-4169-bb08-7b56674d7bf0.sql::public.is_valid_application_draft_token(text)",
  "20260729164130_664f7af1-9dae-4675-8277-c24aaf9ce862.sql::public.list_driver_contacts(uuid)",
  "20260729161818_17cf3a9f-6df2-4a6a-abc8-9c2b0c874ce1.sql::public.list_my_group_threads()",
  "20260729164130_664f7af1-9dae-4675-8277-c24aaf9ce862.sql::public.list_staff_auto_assigned_drivers(uuid)",
  "20260518142644_816faa0d-9b1d-4e9b-8285-5d60c7fe84da.sql::public.log_correction_request_event()",
  "20260308034714_4a1bf5fb-1b01-4810-ad71-31824ddb7092.sql::public.log_dispatch_status_change()",
  "20260610105245_d4d7a7da-fec7-410b-a12b-4e67ce34d619.sql::public.log_ica_event(text, uuid, uuid, jsonb)",
  "20260622153201_cef136ba-9684-4bed-b914-e4346e972d96.sql::public.log_inspection_expiry_change()",
  "20260727191658_491568bc-4bab-4670-903f-b7f05c17708b.sql::public.log_pei_manual_send(uuid, timestamp with time zone, text, text)",
  "20260727191658_491568bc-4bab-4670-903f-b7f05c17708b.sql::public.log_pei_phone_attempt(uuid, timestamp with time zone, text, text)",
  "20260518142644_816faa0d-9b1d-4e9b-8285-5d60c7fe84da.sql::public.log_revision_attachment_delete()",
  "20260518142644_816faa0d-9b1d-4e9b-8285-5d60c7fe84da.sql::public.log_revision_attachment_upload()",
  "20260726204315_0aea3906-593d-4983-a6ed-275e06831b1e.sql::public.mark_equipment_return_completed()",
  "20260429142553_09ece42d-bd4a-46ca-a6bd-599a7cb3e2b2.sql::public.mark_operator_seen(boolean)",
  "20260729161818_17cf3a9f-6df2-4a6a-abc8-9c2b0c874ce1.sql::public.mark_thread_read(uuid)",
  "20260729143338_ab7bc9d7-4972-4bd3-8d8d-a3b9d3964bdb.sql::public.match_staff_help_knowledge(vector, integer, double precision)",
  "20260518151010_21459e56-4985-4b1a-b896-0464d7f291ea.sql::public.move_revisions_to_pending(uuid)",
  "20260618201129_2708979a-7f7d-4edd-b3d7-9a4889e4b265.sql::public.notifications_autofill_entity()",
  "20260720153657_d81fc002-e4c6-4f66-804e-ede3bee9da67.sql::public.on_ica_amendment_activated()",
  "20260706164608_632bbeb7-598d-4fc3-84e2-d24dde593621.sql::public.operator_awaiting_return(uuid)",
  "20260726123808_c98a98b7-b03e-4331-8779-b785e9b799b6.sql::public.operator_return_requested(uuid)",
  "20260714125956_29f3e624-04c3-40f0-b121-e69d53033015.sql::public.prevent_recipient_message_tampering()",
  "20260327200930_def071a4-28fb-4c91-bb65-f07eab4a8730.sql::public.remove_user_role(uuid, app_role)",
  "20260729175715_cfce4671-7913-4ee4-9b2b-ba7b99c8e14c.sql::public.resolve_short_link(text)",
  "20260727194914_a485ef85-e1ec-4d73-a895-01e33553f8b0.sql::public.restore_applicant_pei(uuid)",
  "20260611142920_26a9cd7d-56d0-409f-9ac3-d447b1dd9b88.sql::public.save_application_draft(uuid, jsonb)",
  "20260309143148_c2d6cd8a-60db-4010-94f9-16894ab39863.sql::public.search_audit_log(text, text, timestamp with time zone, timestamp with time zone, integer, integer)",
  "20260618185610_96052999-3491-4f8a-99b2-032e2cb5cc05.sql::public.set_go_live_with_override(uuid, date, text)",
  "20260515183610_31d9c6cc-8a17-4ba1-adf6-c0daab0222b6.sql::public.submit_application_correction(uuid, text, text, jsonb)",
  "20260515172041_d30b358f-5de9-4bfd-9102-3b8409913292.sql::public.submit_pei_response(uuid, jsonb, jsonb, jsonb)",
  "20260513153456_cf7023f6-f04b-41ab-9d7a-22a684c381c5.sql::public.submit_pei_response(uuid, jsonb, jsonb)",
  "20260526140552_f1ee7a34-458d-480a-a373-a721e4ec836c.sql::public.sync_active_dispatch_from_log()",
  "20260622153201_cef136ba-9684-4bed-b914-e4346e972d96.sql::public.sync_application_expiry_to_binder()",
  "20260714133602_5d2278ce-f14c-4cd2-84e7-589aac3a1372.sql::public.sync_irp_expiry_to_mo_plate()",
  "20260729123623_6c7c969d-1a1e-4fc1-a403-1ed040340a0b.sql::public.sync_mo_plate_expiry_to_irp()",
  "20260723165445_9915b9a4-b93d-4c80-ba34-bdd65e50b2dc.sql::public.sync_photos_from_storage()",
  "20260618185610_96052999-3491-4f8a-99b2-032e2cb5cc05.sql::public.unacked_go_live_blockers(uuid)",
  "20260513151918_1701f4a4-1d3f-4686-918d-2b6bbe53841c.sql::public.update_application_pei_status()",
  "20260727153803_44f36d19-304d-4f53-98b7-06ea7d627ee1.sql::public.update_operator_offboarding_steps_updated_at()",
  "20260727200644_de97ba98-fa40-4df2-bfd2-680bc81bbb0b.sql::public.update_pei_archive_category(uuid, text, text)",
  "20260720153657_d81fc002-e4c6-4f66-804e-ede3bee9da67.sql::public.validate_ica_amendment()",
];

/**
 * The size of the allowlist above, checked in deliberately.
 *
 * Only ever revise this DOWNWARD. If a change makes the list longer, the new
 * function is a new defect: pin it to `public, extensions` instead of
 * widening the exemption.
 */
export const LEGACY_MAX = 82;
