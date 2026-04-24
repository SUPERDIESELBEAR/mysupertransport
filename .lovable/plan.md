## Goal

Unblock the truck-photo upload flow (and every other operator-owned upload in the `operator-documents` bucket) by aligning storage RLS with the actual upload path convention: `{operator_id}/...` — not `{user_id}/...`.

## Root cause

The upload code writes to `operator-documents/{operator_id}/truck_photos/...`. After uploading, the code calls `createSignedUrl()` to generate a preview URL. The current `SELECT` policy on the bucket requires the first folder segment to equal `auth.uid()` (the user_id), but the path uses the **operator_id**, which is a different value. The signed-URL call silently fails authorization, the upload "completes" but the UI never gets a URL back, and the spinner hangs until the 60-second timeout fires. Same mismatch will block "Replace Photo" and any future delete.

Confirmed by inspecting `pg_policies` on `storage.objects`:
- `SELECT` policy uses `(storage.foldername(name))[1] = auth.uid()::text` — wrong, requires user_id
- `INSERT` policy is permissive (`auth.uid() IS NOT NULL`) — that's why uploads partially succeed
- No `UPDATE` or `DELETE` policy for operators exists at all — replace/delete is silently broken

The dedicated `pay-setup` policies already use the correct operator_id-based pattern; this plan extends that pattern to the rest of the bucket.

## Note on test account

You confirmed you'll test as `marcsmueller@gmail.com`. Verified in the database that this account already owns operator row `ee993ec0-e0a2-4d0f-aa05-6d22eb931405` (the same one we just cleaned up), so testing as owner exercises the exact same operator path, triggers, and vault behavior an operator would. No separate test account needed for this fix.

## Changes

### 1. New migration: replace operator storage RLS policies

Drop the broken user_id-based `SELECT` policy and add four operator_id-based policies covering SELECT/INSERT/UPDATE/DELETE. The existing `pay-setup` policies and the `Staff can manage all operator documents` policy are left untouched.

```sql
-- Remove the broken user_id-based SELECT policy
DROP POLICY IF EXISTS "Operators can view their operator docs folder" ON storage.objects;

-- Remove the overly permissive INSERT policy (any authenticated user could write anywhere in the bucket)
DROP POLICY IF EXISTS "Operators can upload operator docs" ON storage.objects;

-- Operators can read any object under their own operator_id folder
CREATE POLICY "Operators can view their operator docs folder"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);

-- Operators can insert objects only under their own operator_id folder
CREATE POLICY "Operators can upload operator docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);

-- Operators can replace (UPDATE) their own files — needed for "Replace Photo"
CREATE POLICY "Operators can update their operator docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);

-- Operators can delete their own files — needed for any future "Remove Photo"
CREATE POLICY "Operators can delete their operator docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.operators WHERE user_id = auth.uid()
  )
);
```

### 2. No application code changes

`TruckPhotoGuideModal.tsx`, `OperatorDocumentUpload.tsx`, and the `operator_documents` table policies are already correctly written against `operator_id`. The fix is entirely at the storage policy layer.

## What this fixes

- **Truck photos**: upload, signed-URL preview, and Replace will all work end-to-end
- **Form 2290, Truck Title, Truck Inspection, Decal photos, Pay-setup uploads, Profile photos** — every other operator-owned file in this bucket — will benefit from the same correct policy
- **Tightens security**: the old INSERT policy let any authenticated user write to any folder in the bucket; the new one restricts writes to the user's own operator folder

## What this does NOT change

- Staff/admin access (`Staff can manage all operator documents`) — untouched
- Existing files already in the bucket — they remain readable to the owning operator (paths already use operator_id)
- The `pay-setup`-specific policies — untouched (already correct)
- Application code — zero edits

## Test plan after applying

1. Log in as `marcsmueller@gmail.com` and open the operator portal.
2. Open Stage 2 → Truck Photos → take or pick a photo for any slot.
3. Confirm: spinner ends within ~2 seconds, photo thumbnail appears in the slot, no error toast.
4. Tap "Replace Photo" on the same slot, upload a different image, confirm the replacement renders.
5. (Optional) Verify in `operator_documents` that a row was inserted with `operator_id = ee993ec0-…` and `document_type = 'truck_photos'`.

If step 3 still hangs or errors, the issue is elsewhere (network, browser cache, or app code) and we'll dig in from the console/network logs.
