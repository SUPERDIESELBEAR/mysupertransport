# Fully delete Emma Mueller and let her start fresh

Yes — this can be done as a one-time cleanup on her record. No new tool, no new UI, nothing added to the app.

## Her record today

Emma is a live, active driver: application approved June 11 (`emmafmueller@gmail.com`), an active operator account, 18 onboarding documents, 12 binder/vault documents, 3 ICA contracts, 3 inspection documents, 4 assigned devices, 8 messages, and no certified duty-status logs (so nothing is legally frozen and blocking deletion).

## The cleanup

Done directly on the backend, in this order:

1. **Release her 4 assigned devices** back to Onboard Systems inventory as unassigned, so the ELD, dash cam, and other serials are free to reissue and don't point at a deleted driver.
2. **Delete everything attached to her**: onboarding status, onboarding and binder documents, ICA contracts, pay setup, dispatch history and status log, equipment receipts and assignments, inspection documents, driver uploads, messages, notifications, and certification reminders.
3. **Delete her operator record.**
4. **Delete her application record.** This is the step that frees the email — the app refuses a new application from an email that already has a submitted one.
5. **Delete her profile, her role, and her login**, so `emmafmueller@gmail.com` is not attached to any account.

The uploaded files behind those documents are removed from storage in the same pass so nothing is left orphaned.

## After the cleanup

`emmafmueller@gmail.com` is treated as a brand-new person. She opens the public job application, fills it out from scratch, and gets the real confirmation email at that inbox. She then shows up in the Pending tab of Applications and moves through review → approval → invite email → setting a new password → Stage 1, exactly like any real applicant. Every email along the way lands in her actual inbox.

## Worth knowing before we run it

- This is irreversible. Nothing she uploaded — CDL, med card, truck photos, signed ICA — survives.
- Her current login stops working the moment the cleanup runs.
- Her 3 existing ICA contracts are deleted, not archived. If you want a PDF copy for the file, download them first and I'll pause until you say go.
- Staff audit-log entries that mention her by name stay as history; those are text records, not links to her account.
- She disappears from Driver Hub, Dispatch Board, Vehicle Hub assignments, and compliance counts immediately, which will shift those totals by one.

## Technical detail

- Operator `c49e2427…`, application `a7a1fb75…`, auth user `1afede4f…`.
- Deletes run through the data-change tool in child-before-parent order: `equipment_assignments` (unassign, not delete), `onboard_assignment_sheet_items`/`sheets`, `equipment_receipts`, `operator_documents`, `driver_vault_documents`, `documents`, `ica_driver_acknowledgments`, `ica_amendments`, `ica_contracts`, `contractor_pay_setup`, `cert_reminders`, `dispatch_daily_log`, `dispatch_status_history`, `active_dispatch`, `inspection_documents`, `driver_uploads`, `document_acknowledgments`, `messages`/`thread_participants`, `notifications`, `onboarding_status`, `operators`, application child tables, `applications`, `user_roles`, `profiles`, then the auth user.
- Storage objects are removed for each deleted document row's stored path.
- Verified guard: `rods_days` count for this operator is 0, so the duty-status delete lock is not in play.
- No schema change and no code change — `check_application_email_taken` frees the email on its own once the application row is gone.
