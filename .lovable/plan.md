# Fix: "Upload Receipt" gold button on operator status page

## Root cause

Both gold "Upload Receipt" buttons in the receipt reminder banner (mobile at `OperatorStatusPage.tsx:491` and desktop at `:651`) only call `document.getElementById('stage-1-bg')?.scrollIntoView(...)`. They never open a file picker or camera, so tapping the gold button feels broken — nothing happens that lets the user upload a photo.

The real upload control lives further down inside `PEScreeningTimeline`'s "Receipt Submitted" step. On laptop and on long mobile pages the user often doesn't see the page scroll, so the banner button looks dead.

## Fix

Wire the gold banner buttons to a real file input that uploads the receipt directly — mirroring the existing `handleReceiptUpload` in `PEScreeningTimeline.tsx` — so the click immediately opens the OS file/camera picker.

### `src/components/operator/OperatorStatusPage.tsx`

- Add one hidden `<input type="file" accept="image/*,application/pdf" capture="environment">` plus a `receiptInputRef`, an `uploadingReceipt` state, and a `handleReceiptUpload(file)` function. The handler mirrors `PEScreeningTimeline.handleReceiptUpload`:
  - `validateFile(file, false)` from `@/lib/validateFile`
  - upload to `operator-documents/{operatorId}/pe_receipt/{Date.now()}.{ext}`
  - insert into `operator_documents` with `document_type: 'pe_receipt'`
  - fire-and-forget `send-notification` with `type: 'pe_receipt_uploaded'`
  - toast success, then call `onUploadComplete?.()` so the parent refetches and the banner disappears
  - on failure, toast the error
- Replace the two banner `onClick` handlers (mobile + desktop) with `() => receiptInputRef.current?.click()`.
- Swap the button label / spinner state on `uploadingReceipt` (show `Loader2 + Uploading…` while in-flight), and disable the button while uploading.
- Remove the `setTimeout` + `scrollIntoView` calls from those handlers — the upload happens inline, no scroll needed. Keep the existing `#stage-1-bg` anchor for other deep links.

### What stays the same

- `PEScreeningTimeline`'s in-stage "Upload Receipt" button keeps working as-is (it already opens a file picker correctly).
- Receipt validation, storage bucket, document_type, and notification payload all match the existing path so coordinators get the same notification regardless of which button the driver used.

## Verification

- Open `/operator` as Emma on iOS Safari → tap the gold "Upload Receipt" in the banner → the camera/photo picker opens immediately → select a photo → toast "Receipt uploaded" → banner disappears.
- Same on desktop Chrome → file picker opens → upload PDF/JPG → banner clears.
- Confirm a `pe_receipt_uploaded` notification fires to the assigned coordinator.
