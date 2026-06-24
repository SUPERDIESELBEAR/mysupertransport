## Problem
The hidden file input behind the "Upload Receipt" button on the operator Status page has `capture="environment"`, which forces the mobile OS to open the camera directly. Users can't pick an existing photo or PDF from their device.

## Change
**`src/components/operator/OperatorStatusPage.tsx`** (line ~437)
- Remove the `capture="environment"` attribute from the hidden `<input type="file">`.
- Keep `accept="image/*,application/pdf"` so the OS picker offers Photo Library, Files, and Camera (Take Photo) — letting the user choose any source.

No other UI, copy, or upload-logic changes. PDFs were already accepted; removing `capture` just stops forcing the camera.

## Verification
On mobile, tap Upload Receipt → OS sheet shows Photo Library / Choose File / Take Photo. On desktop, the normal file chooser opens.
