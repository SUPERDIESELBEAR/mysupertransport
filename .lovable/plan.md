

## Fix: ICA Download Only Renders One Page

### Problem
The "Print / Download" button in `ICAViewModal` calls `window.print()` directly. The ICA document lives inside a scrollable drawer (`overflow-y-auto`), so the browser's print engine only captures the first visible page worth of content — the rest is clipped by the overflow container.

### Solution
Replace the bare `window.print()` call with the existing `printDocumentById` utility from `src/lib/printDocument.ts`. This utility clones the target element into a top-level wrapper outside the overflow container and applies scoped print styles, which is exactly the pattern already used for application PDF downloads.

Additionally, pre-load the signature images as base64 data URLs before printing (using the existing `preloadSignatureDataUrl` helper) so they render reliably in the printed output instead of potentially failing due to expired signed URLs.

### Changes

**File: `src/components/ica/ICAViewModal.tsx`**

1. Import `printDocumentById` from `@/lib/printDocument` and `preloadSignatureDataUrl` from `@/lib/printDocument`
2. Replace the `handlePrint` function:
   - Before printing, call `preloadSignatureDataUrl` on both `carrier_signature_url` and `contractor_signature_url`
   - Temporarily swap the `<img>` sources in the print target to the base64 data URLs
   - Call `printDocumentById('ica-print-area', 'ICA - ' + operatorName)` instead of `window.print()`
3. Remove the now-unnecessary inline `print:hidden` classes (the `printDocumentById` utility handles hiding everything else)

### Files changed

| File | Change |
|------|--------|
| `src/components/ica/ICAViewModal.tsx` | Use `printDocumentById` with signature pre-loading for reliable multi-page print/download |

