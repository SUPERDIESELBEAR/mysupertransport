## Add Delete for Angle Photos (Driver App)

In the driver-facing decal upload UI, the "Angle" photos below Driver/Passenger Side currently have no way to remove them. Add a delete control per angle so drivers can remove any uploaded angle photo.

### Changes
- **File:** `src/components/operator/OperatorDocumentUpload.tsx`
  - Add a `handleDeleteDecalExtra(idx)` handler:
    - Optimistically remove the entry from local `decalExtras` state.
    - Persist by updating `onboarding_status.decal_photos` to the new array (same pattern as the add handler).
    - On failure, restore state and show an error toast; on success, show "Angle removed" toast.
  - In the angles grid (around line 969–977), render each tile with:
    - The existing image preview (still opens in modal via `PreviewLink`).
    - A small trash icon button in the top-right corner of the tile (semi-transparent black bg, white icon) that stops event propagation and opens a lightweight confirm (using `window.confirm` or existing `AlertDialog` if used elsewhere) before calling the delete handler.
    - Keep the label caption below.
  - No changes to storage: leave the underlying storage object in place (matches the existing pattern for the DS/PS Replace flow and the staff `StaffDecalPhotoEditor`, which also only removes the DB reference).

### Out of scope
- Deleting Driver Side / Passenger Side photos (those already have Replace; user asked specifically about angle photos).
- Storage garbage collection.
