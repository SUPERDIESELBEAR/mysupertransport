
# Reset truck photos for test operator account

## Goal
Clear all truck photos previously uploaded to the test operator account (`marcsmueller+test@gmail.com`) so you can start over and re-test the Stage 2 Truck Photos upload flow.

## Context found during investigation
- **Operator ID:** `ee993ec0-e0a2-4d0f-aa05-6d22eb931405`
- **Storage bucket:** `operator-documents`
- **Files found:** 12 photo files under the prefix `ee993ec0-e0a2-4d0f-aa05-6d22eb931405/truck_photos/`
- **Database records:** No matching rows in `documents` or `driver_vault_documents` — the photos exist only in storage.
- **Onboarding status:** `onboarding_status.truck_photos` is already `not_started`, so no status reset is needed.

## Change
Run a single SQL migration that deletes the 12 storage objects:

```sql
DELETE FROM storage.objects
WHERE bucket_id = 'operator-documents'
  AND name LIKE 'ee993ec0-e0a2-4d0f-aa05-6d22eb931405/truck_photos/%';
```

## Result
- All 12 truck photo slots in Stage 2 will be empty.
- Stage status remains `not_started` (no change needed).
- You can immediately re-upload photos from the operator portal to test the flow end-to-end.

## Out of scope
- No code changes.
- No changes to other operators, other documents, or any other onboarding stages.
- No changes to the previously discussed URL cleanup / per-role defaults / FilePreviewModal progress bar work.
