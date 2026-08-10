# Reset Emma Mueller so she can re-apply with the same email

Yes, this is possible. Emma is currently a fully live, active driver record (application approved June 11, operator account active, 18 onboarding documents, 12 binder documents, 3 ICA contracts, 4 assigned devices, 3 inspection documents, 8 messages). Nothing about her is flagged as a test/demo record today, so the app has no built-in way to wipe her — the existing reset tool refuses any driver not marked as a demo driver.

Based on your answers, the redo is a **full teardown and fresh public application** using `emmafmueller@gmail.com`, with real emails going to that inbox and a brand-new login.

## What has to happen

**1. Release her equipment first**
Her 4 assigned devices (ELD, dash cam, etc.) are returned to Onboard Systems inventory as unassigned, so the serials aren't orphaned and can be reissued.

**2. Purge the record**
A new staff tool ("Purge driver record", owner-only) removes, in order:
- All onboarding data, documents, ICA contracts, pay setup, dispatch history, equipment receipts, binder/vault documents, inspection documents, messages, and notifications
- The stored files behind those documents in secure storage, so nothing is left orphaned
- Her operator record and onboarding status
- Her **application record** — this is the key step: the app blocks re-applying with an email that already has a submitted application, so the old application must be gone before the email is free again
- Her profile, roles, and login account

Every purge is written to the audit log (who ran it, which driver, what was removed) and requires typing the driver's name to confirm.

**3. She re-applies**
Once purged, `emmafmueller@gmail.com` is treated as brand new. She fills out the public job application from scratch, receives the real confirmation email, appears in the Pending tab of the Applications page, and goes through review → approval → the invite email → setting a new password → Stage 1 onboarding, exactly like any new applicant.

## What this looks like day to day

- She loses her current login immediately; the new one comes from the approval invite email after her new application is approved.
- Nothing she previously uploaded carries over — CDL, med card, truck photos, ICA all have to be redone. That is the point of the exercise, but it's irreversible.
- Historical references to her in staff audit logs stay (they're name-based), but she disappears from the Driver Hub, Vehicle Hub assignments, Dispatch Board, and compliance counts right away.
- Her old ICA contracts are deleted rather than archived. If you'd rather keep a PDF copy for the record, download them before the purge.

## Technical detail

- New edge function `purge-driver-record` (owner role only, service role): unassigns `equipment_assignments`, then deletes operator-scoped rows across the same table set used by `reset-demo-driver` plus `driver_vault_documents`, `inspection_documents`, `driver_uploads`, `document_acknowledgments`, `application_*` child rows, `pei_requests`/`pei_responses`, `operators`, `onboarding_status`, `applications`, `profiles`, `user_roles`, then `auth.admin.deleteUser`.
- Storage cleanup for the object paths recorded on each deleted document row.
- Guard: refuses if the operator has any certified `rods_days` (duty-status logs can't be deleted outside the `purge-rods-day` path). Emma currently has 0, so she is clear.
- Guard: refuses unless the caller confirms the driver's full name in the request body; writes an `audit_log` entry with a manifest of deleted row counts.
- UI entry point: "Purge driver record (permanent)" in the driver's Driver Hub overflow menu, visible to the owner role only, behind a typed-name confirmation dialog.
- `check_application_email_taken` needs no change — deleting the application row frees the email naturally.

This tool is reusable for any future test driver, not one-off scripting.
