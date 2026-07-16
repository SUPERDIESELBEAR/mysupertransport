# Extend upload hardening app-wide

## Why
The `uploadWithAuth` helper we introduced for Jonathan Grant's truck-photo bug refreshes stale JWTs and retries once on RLS/JWT errors. Any direct `supabase.storage.from(...).upload(...)` call bypasses that safety net and can still fail with "new row violates row-level security policy" if a user's session drifted while the app tab was open. Routing every upload site through the helper closes the entire class of bug.

## Scope — 17 files to convert

**Applicant / public-facing (highest priority — no re-login recourse)**
- `src/components/application/Step7Documents.tsx` — DL front/rear, med cert
- `src/components/application/Step9Signature.tsx` — applicant signature

**Operator / driver-facing PWA**
- `src/components/operator/OperatorStatusPage.tsx`
- `src/components/operator/OperatorICASign.tsx`
- `src/components/operator/PEScreeningTimeline.tsx`
- `src/components/EditProfileModal.tsx` (avatar)
- `src/components/messaging/useMessageThread.ts` (message attachments)

**Staff / management tools**
- `src/pages/staff/OperatorDetailPanel.tsx`
- `src/components/drivers/DriverVaultCard.tsx`
- `src/components/equipment/EquipmentAssetSheet.tsx`
- `src/components/inspection/InspectionBinderAdmin.tsx`
- `src/components/inspection/OperatorBinderPanel.tsx`
- `src/components/inspection/OperatorInspectionBinder.tsx`
- `src/components/ica/ICABuilderModal.tsx`
- `src/components/ica/CarrierSignatureSettings.tsx`
- `src/components/management/RevisionReplyAttachments.tsx`
- `src/components/management/ResourceLibraryManager.tsx`

## Change per file
Replace:
```ts
const { error } = await withTimeout(
  supabase.storage.from(BUCKET).upload(path, file, { upsert: false }),
  60_000,
  'Upload',
);
if (error) throw error;
```
with:
```ts
const { error, authUid, sessionExpired } = await uploadToBucket(BUCKET, path, file, { upsert: false });
if (error) {
  console.error('[<call-site>] upload failed', { authUid, sessionExpired, message: error.message });
  throw error;
}
```

Preserve each site's existing surrounding logic (progress state, validation, follow-up DB writes, toast messages). No RLS policies, buckets, or DB schema change.

## Special case: unauthenticated applicant uploads
`Step7Documents.tsx` and `Step9Signature.tsx` are used by the public application form where the user may not be signed in. `uploadWithAuth`'s session check would incorrectly block those. Fix: add a small option `{ requireSession: false }` to `uploadToBucket` that skips the pre-flight session refresh for public buckets, keeping only the 60s timeout + one retry.

## Verification
- Typecheck the project.
- Manually smoke-test one representative call site per bucket (application docs, operator docs, driver vault, ICA signature).
- No functional UI change expected — success paths behave identically; only failure resilience improves.

## Out of scope
- Changing storage RLS policies.
- Changing bucket public/private settings.
- Any UI redesign of upload widgets.
