## What's happening

**1. "Remove failed" on Angle 1 (root cause confirmed)**

`public.onboarding_status` has **two** operator-column whitelist triggers:

- `trg_onboarding_status_operator_column_whitelist` → allows `decal_photos` ✅
- `trg_enforce_onboarding_status_operator_update` → **does NOT allow `decal_photos`** ❌

Any driver-side write to `decal_photos` runs both triggers. The second one rejects the update with `Operators may only update their own decal photos, truck_photos, ica_status, and equipment asset sheet signature`, so the delete PATCH fails and the UI reverts the tile. (Adds happened to slip through only when performed in a session where staff impersonation or a cascade flag was set — for a real driver session both add and delete are currently blocked.)

Compounding the UX: `handleDeleteDecalExtra`'s catch does `err instanceof Error ? err.message : 'Please try again.'`. Supabase's `PostgrestError` is a plain object, not an `Error`, so the real DB message is swallowed and the user only sees "Please try again."

**2. Photo edit save (crop/rotate) — verified working, one gap**

`DocumentEditor.handleSave` re-uploads the cropped PNG to the same `bucketName` + `filePath` with `upsert: true` and mints a fresh 5-year signed URL. When the editor is opened from a decal tile, `FilePreviewModal` infers bucket/path from the signed URL via `inferStorageInfo`, so the overwrite lands on the correct object. The saved bytes are persisted in storage.

The one gap: for decal extras, `onboarding_status.decal_photos[i].url` stores the **bare storage path** and `resolveDecalUrl` re-signs on every read, so edits do appear on refresh. But the `<img>` element already on screen keeps its stale signed URL until the parent re-resolves. The current `onSaved` prop on `FilePreviewModal` for the decal preview isn't wired, so the tile doesn't refresh until a full reload.

## Fix plan

### A. Unblock decal_photos writes (delete + add) for drivers

Migration: add `decal_photos` to the allow-list in `public.enforce_onboarding_status_operator_update` so both triggers agree.

```sql
CREATE OR REPLACE FUNCTION public.enforce_onboarding_status_operator_update()
... v_allowed text[] := ARRAY[
  'decal_photo_ds_url',
  'decal_photo_ps_url',
  'decal_photos',        -- NEW
  'truck_photos',
  'eld_signature_typed_name',
  'eld_signature_image_url',
  'eld_signature_signed_at',
  'updated_at',
  'updated_by'
] ...
```

(Body otherwise unchanged — keep the staff bypass, cascade GUC bypass, and equipment-return branch intact.)

### B. Surface real DB errors in the driver toast

In `src/components/operator/OperatorDocumentUpload.tsx`, update `handleDeleteDecalExtra` (and mirror in `handleDecalExtra` / `handleDecalPhoto`) to read `err?.message` from any object, and log the full error so future failures aren't opaque:

```ts
const msg =
  (err as any)?.message ??
  (typeof err === 'string' ? err : 'Please try again.');
console.error('[decal delete] failed', err);
toast({ title: 'Remove failed', description: msg, variant: 'destructive' });
```

### C. Refresh decal tile after in-place edit

In `OperatorDocumentUpload.tsx`, when the extras tile's `PreviewLink` opens `FilePreviewModal`, pass an `onSaved` callback that re-hydrates `decalExtras` from the DB (same query used in the mount effect). This forces `resolveDecalUrl` to mint a fresh signed URL so the cropped/rotated image shows immediately without a page reload. Do the same for the Driver Side / Passenger Side tiles by re-reading `decal_photo_ds_url` / `decal_photo_ps_url`.

No schema changes here — just prop wiring.

### D. Verification

1. Apply migration.
2. As a driver demo account on mobile preview: add Angle 2, then delete Angle 1. Both should succeed with no red banner. Confirm the row in `onboarding_status.decal_photos` reflects the change.
3. Open Driver Side → tap Edit → rotate 90° → Save. Confirm the tile re-renders rotated without reload, and the storage object at the same path is overwritten.
4. Re-check with a staff session that decal management still works (staff bypass path is untouched).

## Technical notes

- Both whitelist triggers coexist because they were added in separate migrations; consolidating them is out of scope for this fix — we just align their allow-lists.
- `resolveDecalUrl` already prepends the storage prefix and re-signs, so no client cache-busting query string is needed once state is refreshed.
- `DocumentEditor` already uses `upsert: true` so overwrites don't create orphan objects.
