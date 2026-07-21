## Goal

Make every enabled **Decals** camera button on the Dispatch Board open the driver’s uploaded Stage 5 decal photos in the app, with previous/next arrows and an X close button that returns to the Dispatch Board.

## Verified current state

- The Dispatch Board already selects `decal_photo_ds_url`, `decal_photo_ps_url`, and `decal_photos` from `onboarding_status`.
- Dispatch rows already set `decalTarget` when the enabled Decals button is clicked.
- The current decal viewer depends on `FilePreviewModal`, which treats signed image URLs with query strings as not-images because image detection checks the full URL extension. That can leave the preview stuck in document-loading behavior instead of showing the decal photo.
- Existing stored decal URLs may be signed/public storage URLs, bare operator-document paths, or old expiring links, so the fix needs to normalize those reliably.

## Fix plan

1. **Harden the decal URL resolver**
   - Update `resolveDecalUrl()` so it can extract object paths from all expected storage URL shapes, including:
     - `/storage/v1/object/sign/operator-documents/...`
     - `/storage/v1/object/public/operator-documents/...`
     - `/object/sign/operator-documents/...`
     - bare paths like `{operatorId}/decal_photos/...`
   - Always strip query tokens before re-signing.
   - Keep the original stored URL as fallback if secure URL refresh fails.

2. **Make the Dispatch decal viewer direct and resilient**
   - Keep the current `DecalPhotoViewerModal` sequence: Driver Side, Passenger Side, then additional angles.
   - Seed with raw URLs immediately so the modal opens right away after click.
   - Refresh URLs in the background and swap in the fresh secure URLs when available.
   - Ensure extras with empty/malformed URLs are skipped instead of blocking the viewer.

3. **Fix image detection in `FilePreviewModal`**
   - Update image/PDF detection to inspect the URL pathname without query parameters, so signed URLs ending in `.jpg?...token=...` still render as images.
   - Reset image loading state when moving between carousel items so previous/next cannot leave the spinner stuck.

4. **Verify the dispatch scenario**
   - Use the Dispatch Board flow to click an enabled Decals camera button.
   - Confirm the first decal photo appears in-app.
   - Confirm previous/next switches between Driver Side and Passenger Side.
   - Confirm X closes the viewer and returns to the Dispatch Board.

## Files to change

- `src/lib/decalUrl.ts`
- `src/components/fleet/DecalPhotoViewerModal.tsx`
- `src/components/inspection/DocRow.tsx`

No database migration is needed because the Stage 5 decal photo fields already exist and are already queried by the Dispatch Board.