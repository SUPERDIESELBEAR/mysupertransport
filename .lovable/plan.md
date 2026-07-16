# Pre-Onboarding Hardening Plan

An audit for issues in the same family as the ICA signature bug (guard-trigger conflicts, RLS gaps on operator writes, unhardened uploads, edge-function auth gaps) surfaced two confirmed items worth fixing now, plus one to verify with you. All client-side storage uploads and the ICA cascade path are already clean.

## What I found

**Already fixed / no action needed**
- ICA cascade → `onboarding_status` bypass flag is in place and honored by all three guard triggers.
- Every `supabase.storage.upload` call in `src/` now flows through `uploadToBucket` — no direct-upload bypasses remain.
- Equipment-asset-sheet migration + signature RPCs correctly set their bypass flags for the guards that check them.
- `contractor_pay_setup`, `messages`, `truck_dot_inspections` ⇄ `inspection_documents`, and `mo_plates` ⇄ `inspection_documents` sync chains all have correct re-entrancy/bypass handling.

**Issue 1 — Silent RLS failure on driver-uploaded inspection docs (Medium)**
`src/components/operator/OperatorDocumentUpload.tsx` uploads a driver's IRP/registration/inspection doc to storage, then inserts a matching row into `inspection_documents` so it appears in the Inspection Binder. That insert has **no operator-scoped RLS policy** (only `Staff can manage inspection documents` + operator `SELECT`), so it always fails when the driver runs it. The failure is caught by a `try/catch` with a "Non-critical" comment and swallowed — the doc uploads to storage, but never appears in the binder and no error surfaces to driver or staff.

**Issue 2 — Guard/flag asymmetry on `onboarding_status` (Medium, defense-in-depth)**
The two operator-scoped `onboarding_status` guards honor three bypass flags (`app.ica_sync_cascade`, `app.equipment_asset_sheet_migration`, `app.equipment_asset_signature_execute`), but the older `enforce_onboarding_status_self_update` guard only honors `app.ica_sync_cascade`. Today this is harmless because the equipment flags write to columns not in that guard's blocked list — but the next time we add a column to the operator whitelist that happens to overlap, we'll reproduce the exact ICA bug. Align all three guards on the same flag set.

**Issue 3 — Open question on `applications` update policy (Low/Info)**
The `Owner can update draft application` RLS policy has a strict `WITH CHECK` that rejects any applicant update after staff sets `reviewed_by`/`mvr_status`/etc. No offending call site found in a quick scan, but worth confirming with you whether any "resume/edit" flow could hit it.

## Changes to make

### 1. Fix inspection-doc auto-sync for driver uploads
Preferred: add a narrow operator-scoped INSERT policy so drivers can create their **own** `inspection_documents` rows for the documents they legitimately upload, restricted to their own `driver_id` and non-privileged fields (no `status='approved'`, no `verified_by`, etc.). Then remove the silent `catch` in `OperatorDocumentUpload.tsx` and surface real errors via toast + console diagnostics.

If you'd rather keep `inspection_documents` staff-only, alternative: convert the sync into a `SECURITY DEFINER` RPC (`upsert_driver_inspection_document`) called from the client, with server-side validation of allowed fields.

I'll recommend the RLS-policy route for simplicity unless you say otherwise — it matches how `onboarding_status` operator writes work today.

### 2. Align `onboarding_status` guard flags
Update `enforce_onboarding_status_self_update` so its bypass check also honors `app.equipment_asset_sheet_migration` and `app.equipment_asset_signature_execute`. Pure defense-in-depth — no behavior change today, prevents a future silent regression.

### 3. Verify with you before touching `applications` policy
Confirm whether any applicant UI ever tries to save an application after staff has begun review. If yes, we route those writes through the existing service-role edge functions (`request-application-resume` / `consume-application-resume`) rather than direct client update. If no, no change needed.

## Files touched

- New migration: `add_operator_inspection_documents_insert_policy` (INSERT policy + `GRANT INSERT ... TO authenticated`) **and** patch `enforce_onboarding_status_self_update` to honor the two additional bypass flags. Single migration, one review.
- `src/components/operator/OperatorDocumentUpload.tsx` — remove the swallow-and-continue `catch` around the `inspection_documents` insert, surface errors via existing toast pattern, log `authUid` + row payload keys on failure for diagnostics.

## What this does not change

- No changes to storage buckets, ICA flow, contractor pay setup, equipment asset sheet, or edge functions — those paths are clean.
- No RLS loosening on any table beyond a scoped operator-owns-own-row INSERT on `inspection_documents`.

## Question for you before I build

Confirm the preferred approach for Issue 1: **(a)** narrow operator INSERT policy on `inspection_documents` restricted to their own driver_id and non-privileged columns, or **(b)** `SECURITY DEFINER` RPC so the table stays staff-only at the RLS layer. I'll go with **(a)** if you don't have a preference.
