
I inspected the current operator upload flow and the staff photo grid. The most likely reason the emoji still appears is that the staff modal is deciding “is this an image?” from the stored `file_url` text instead of from the signed image URL it actually loads.

What I found:
- `TruckPhotoGuideModal.tsx` now stores the raw storage path in `file_url`, which is correct for a private bucket.
- `TruckPhotoGridModal.tsx` only shows an `<img>` when `isImage(file.file_url)` passes.
- That `isImage` check is extension-based: it looks for `.jpg`, `.png`, `.heic`, etc. in the stored path string.
- The upload guide still builds the storage path extension from `file.name.split('.').pop()`, which is brittle for camera-captured files because mobile browsers can provide odd or missing filenames/extensions.
- The guide also does not currently check the `operator_documents` insert error, so a failed insert could be masked as success.

Implementation plan:
1. Fix the staff grid preview logic
- Update `src/components/staff/TruckPhotoGridModal.tsx` so truck photo cells do not depend on `isImage(file.file_url)` to render thumbnails.
- Treat any successfully signed URL in this modal as previewable, since this modal is specifically for truck photos.
- Add a real image-load fallback: if the `<img>` fails to load, then show the emoji/link fallback for that one cell.

2. Harden the truck photo upload path generation
- Update `src/components/operator/TruckPhotoGuideModal.tsx` to derive the file extension from MIME type when `file.name` is missing or unreliable.
- Keep storing the raw storage path in `file_url`, but ensure it ends in a predictable image extension when possible.
- Explicitly handle the insert result from `operator_documents` and throw on error so false-success uploads do not slip through.

3. Verify compatibility with existing uploads
- Keep `extractStoragePath` support for both legacy signed URLs and raw storage paths.
- Make sure older records and newly captured photos both resolve into signed URLs correctly in the staff modal.

4. Validation after implementation
- Capture a fresh truck photo from the operator guide on mobile.
- Confirm the new record is written with a valid raw storage path.
- Open the staff-facing truck photo grid and verify it shows the actual thumbnail, not the emoji.
- Check lightbox/open behavior and confirm older truck-photo records still load.

Files to update:
- `src/components/staff/TruckPhotoGridModal.tsx`
- `src/components/operator/TruckPhotoGuideModal.tsx`

Technical note:
This should be a frontend-only fix. No database schema changes should be required.
