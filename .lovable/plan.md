## Carousel Navigation in My Documents Folders

In the driver's My Documents view, tapping a file's eye icon opens `FilePreviewModal` for that single file. Add prev/next navigation so drivers can flip through every file in the same folder (e.g. all 10 Truck Photos) without closing the modal.

### Change
**File:** `src/components/operator/MyDocumentsFolders.tsx`

- Replace the single-doc `previewDoc` state with `{ folderKey, index }` state.
- On eye-icon click, set the folder key and the index of that doc within its folder's `docs` array.
- Compute the active folder and active doc from state; pass to `FilePreviewModal`:
  - `url`, `name`, `filePath` from the active doc
  - `onPrev` / `onNext` that step the index (bounded), reusing the same modal
  - `counter` = `"{i} of {n}"` when the folder has more than one doc
- `FilePreviewModal` already handles image swipes and prev/next arrows (used by `TruckPhotoViewerModal`), so no changes needed there.

### Out of scope
- No layout changes to folder tiles or list rows.
- Signed Assignment Sheets and Equipment Return folders keep their existing embedded viewers.
