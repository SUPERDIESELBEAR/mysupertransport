# Fix "View invoice" on the driver app My Truck page

## The problem (confirmed)

The invoice viewer opens, shows a loading state for a second or two, then closes itself and drops the driver back on the Repairs & Maintenance list — the invoice is never shown.

Cause: the shared file preview modal has a mobile-specific behavior for PDFs. Once the PDF finishes loading, it automatically tries to hand the file off to the phone's native PDF viewer in a new browser tab and then immediately closes itself. In the SUPERDRIVE app (installed PWA / in-app browser), that new-tab handoff is blocked because it isn't triggered by a tap, so nothing opens — but the modal has already closed. That is exactly the flash-then-back behavior in the screenshot.

Maintenance invoices are almost always PDFs, which is why this section is the most visibly broken; the same auto-close affects every PDF opened on a phone (doc hub, binder, onboarding docs).

## The fix

Show the PDF inside the app instead of bouncing to another tab:

1. Remove the automatic new-tab handoff and self-close for mobile PDFs. The preview never closes on its own — only the driver's Back/X closes it.
2. Render the PDF in-app on mobile by drawing its pages to the screen with the PDF engine already bundled in the app (used today for document editing). Pages scroll vertically and pinch-zoom works.
3. Keep desktop behavior unchanged (inline PDF frame).
4. Keep explicit escape hatches in the header for mobile: "Open in browser" and "Download", both tap-triggered so they aren't blocked.
5. If in-app rendering fails (corrupt or unsupported file), show a clear card with the file name, the failure reason, and the Open / Download / Share buttons — never a silent close.

## Verification

- Open a maintenance record with a PDF invoice on a phone-sized viewport in the driver app and confirm the invoice renders and stays open.
- Confirm image invoices, doc hub PDFs, and the inspection binder still open correctly, and desktop is unaffected.

## Technical notes

- `src/components/inspection/DocRow.tsx` → `FilePreviewModal`: delete the `showMobilePdfFallback` auto-open effect (`window.open(...)` + `onClose()`), replace with an in-app canvas renderer path.
- Add a small multi-page renderer built on `pdfjs-dist` (mirroring `src/lib/pdfToImage.ts`, which currently renders page 1 only) so mobile can display all pages.
- No backend, storage, or data changes; signed-URL creation in `FleetDetailDrawer.handlePreviewFile` is working correctly and stays as is.
