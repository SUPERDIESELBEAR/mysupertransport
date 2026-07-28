## Root cause

Two independent bugs on the driver-facing "Decal Install Photos" card in `src/components/operator/OperatorDocumentUpload.tsx`.

### 1. Photos render as a broken-image placeholder

`handleDecalPhoto` stores the **bare storage path** (e.g. `<operator-id>/decal_photos/ds_...jpg`) in `decal_photo_ds_url` / `decal_photo_ps_url` — this was intentional so viewers always mint a fresh signed URL (see `src/lib/decalUrl.ts`, used by Dispatch and Vehicle Hub).

But this component renders it directly:

```tsx
<img src={decalPhotoDs} alt="Decal Driver Side" ... />
```

The browser treats the bare path as a relative URL, gets a 404/HTML back, and shows the OS broken-image glyph (the blue `?` box). The `alt` text ("Decal Driver Side") is what shows in the driver-side tile in the screenshot.

The extras array (`decal_photos` jsonb) is loaded raw with no resolution either.

### 2. "Add Another Angle" always fails

`handleDecalExtra` writes to `onboarding_status.decal_photos` (jsonb). Confirmed by inspecting the database trigger `enforce_onboarding_status_operator_column_whitelist`: driver updates are only allowed on this exact set —

```
decal_photo_ds_url, decal_photo_ps_url, truck_photos,
eld_signature_typed_name, eld_signature_image_url, eld_signature_signed_at,
updated_at, updated_by
```

`decal_photos` is not in the list, so the trigger raises: *"Operators may only update their own decal photos, truck_photos, ica_status, and equipment asset sheet signature"*. That's the red "Upload failed" toast (the storage upload actually succeeds — the failure is on the `.update({ decal_photos: next })` call).

## Fix

### A. Render decals through the signed-URL resolver (frontend only)

In `src/components/operator/OperatorDocumentUpload.tsx`:

- Add state for resolved URLs: `decalPhotoDsResolved`, `decalPhotoPsResolved`, and per-extra resolved URLs.
- On mount and whenever the stored value changes, call `resolveDecalUrl(...)` from `@/lib/decalUrl` to mint a fresh signed URL, and use that in every `<img src>` and `<PreviewLink url>` in the Decal Install Photos section.
- For the extras array, keep raw storage paths in state but map through `resolveDecalUrl` for display (same pattern as `DecalPhotosQuickView.tsx`).
- After a successful `handleDecalPhoto` / `handleDecalExtra`, re-resolve so the newly uploaded tile shows immediately without a page refresh.
- Also, stop persisting a signed URL for extras in `handleDecalExtra` — store the **bare path** the same way the DS/PS uploader does (`fileUrl = path`). Signed URLs written to the DB expire; the resolver handles both formats but bare paths are the canonical form used elsewhere.

No changes to `resolveDecalUrl` itself — it already handles bare paths, `object/sign/...`, and `object/public/...`.

### B. Whitelist `decal_photos` for driver self-updates (migration)

Extend `public.enforce_onboarding_status_operator_column_whitelist` to include `decal_photos` in the `v_allowed` array so drivers can add additional angles. No other logic changes; still blocks everything else, still bypasses for staff and internal cascade sessions.

## Out of scope

- Staff-side `StaffDecalPhotoEditor.tsx` and `DecalPhotosQuickView.tsx` already use `resolveDecalUrl` — no change.
- Vehicle Hub decal viewer — unchanged.
- No schema changes; only the trigger body is updated.

## Technical notes

- Files touched: `src/components/operator/OperatorDocumentUpload.tsx` + one migration replacing the trigger function body.
- No new dependencies; `resolveDecalUrl` is already imported/used elsewhere.
- Verification: after fix, an existing driver with uploaded decals should see both DS/PS tiles render, and tapping "Add Another Angle" should upload + append a new tile with no red error toast.
