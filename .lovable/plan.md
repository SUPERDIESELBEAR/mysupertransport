## Goal

Stop accidental, irreversible deletes of operator documents (truck title, registration, inspection, photos, etc.). After this change:

1. Every delete in the staff UI requires an explicit confirmation.
2. Deletes become **soft** for 30 days — the file stays in storage, the DB row is hidden, and staff can restore it from a "Recently Deleted" tray.
3. A nightly cleanup permanently removes anything older than 30 days.
4. Every delete and restore is written to the audit log.

## What changes (user-visible)

- **Confirm dialog** on every "Delete document" action across the Staff → Operator detail panel (Stage 2 truck docs, cost docs, payroll docs slots, generic doc rows). Dialog shows file name, who uploaded it, and "This can be restored within 30 days."
- **Recently Deleted tray** in the Operator detail panel (collapsed section near Documents) listing soft-deleted docs from the last 30 days with **Restore** and **Delete permanently** buttons. Staff-only.
- **Audit log entries** for `document_deleted` and `document_restored` (shows up in the existing audit log views).
- Driver/operator view of documents is unaffected — soft-deleted docs are filtered out for them too.

## Technical details

### Database (one migration)

`operator_documents`:
- Add `deleted_at timestamptz null`, `deleted_by uuid null`, `delete_reason text null`.
- Add partial index on `(operator_id) where deleted_at is null` for the hot path.
- Update existing RLS policies so non-staff reads filter `deleted_at is null`; staff can see all. Inserts/updates unchanged.
- BEFORE-UPDATE trigger: when `deleted_at` transitions null → not-null, snapshot the row into `audit_log` (`action='document_deleted'`, metadata `{ file_name, file_url, document_type, uploaded_at }`) so we have a permanent record even after purge.
- BEFORE-UPDATE trigger: when `deleted_at` transitions not-null → null, log `document_restored`.
- Side-effect of trigger on delete: if the corresponding `onboarding_status.<doc_type>` column is `'received'` AND no other live doc of that type exists for the operator, reset it to `'pending'` (or `'requested'`) so Stage 2 reflects reality. Mirror inverse on restore (only if still `'pending'`).

`copy_stage2_docs_to_vault` trigger: also filter source by `deleted_at is null` when copying to vault on subsequent re-uploads (prevents zombie vault copies).

### Frontend

New helpers in `src/lib/operatorDocuments.ts`:
- `softDeleteOperatorDocument(id, reason?)` — updates row to set `deleted_at = now()`, `deleted_by = auth.uid()`. Does **not** touch storage.
- `restoreOperatorDocument(id)` — clears `deleted_at`/`deleted_by`.
- `hardDeleteOperatorDocument(id)` — actually removes storage object + row (used by "Delete permanently" and the purge job).
- `listDeletedOperatorDocuments(operatorId)` — fetches soft-deleted rows for the tray.

Replace every existing `supabase.from('operator_documents').delete()` + `supabase.storage.remove()` pair in:
- `src/pages/staff/OperatorDetailPanel.tsx` (~lines 3179, 4647, 5466 and the cost-docs slots around 6225–6295)

…with `softDeleteOperatorDocument()` wrapped in a new `<ConfirmDeleteDocumentDialog>` (shadcn `AlertDialog` reused). Dialog wording: "Delete '{file_name}'? You can restore it from the Recently Deleted tray for 30 days."

New `<DeletedDocumentsTray>` component placed inside `OperatorDetailPanel` Documents section. Shows label, original document_type, deleted_at, deleted_by name, file preview link, **Restore** and **Delete permanently** (second confirm for permanent).

Driver-side fetch in `OperatorPortal.tsx` (line 254): add `.is('deleted_at', null)` to the `operator_documents(*)` nested select (or rely on RLS — defense in depth, do both).

### Cleanup job

New edge function `purge-deleted-operator-documents` (scheduled daily via pg_cron, gated by `x-cron-secret` per the project pattern):
- Find rows with `deleted_at < now() - interval '30 days'`.
- For each: remove the storage object from `operator-documents` bucket, then delete the DB row.
- Write `audit_log` entry `document_purged` with stored metadata.

### Out of scope

- **Storage bucket versioning** — Supabase Storage doesn't expose object versioning to projects, so we get the same protection by keeping the object in place during the 30-day window instead. No bucket-level changes needed.
- Other doc tables (`driver_uploads`, `driver_vault_documents`, `inspection_documents`, `equipment_assignments` receipts) — same pattern can be applied later; this plan covers `operator_documents` only, since that's where the truck title lives and where the recent loss happened. Mention this to the user as a follow-up if they want symmetric protection elsewhere.

## Migration / rollout order

1. DB migration (columns + triggers + RLS update + audit logging).
2. Frontend helpers + confirm dialog + delete call-site swap.
3. Recently Deleted tray UI.
4. Edge function + cron schedule.
5. Bump `public/version.json`.
