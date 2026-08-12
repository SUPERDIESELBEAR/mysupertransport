# Quick-view return receipts on Assignment Sheets

When an operator uploads a shipping receipt, staff should be able to open it in-app from both places where the receipt is referenced on the Onboard Systems → Assignment Sheets tab.

## What changes

1. **Assignment sheet card ("Return receipt received" block)** — each listed receipt gets a "View receipt" action next to the tracking/carrier line. Clicking it opens the file in the in-app preview modal (image or PDF, with print/download/open-in-new-tab), instead of requiring staff to open the sheet first.

2. **Sheet "View" window (preview modal)** — the existing "View receipt" text link currently opens a raw browser tab. It will use the same in-app preview modal so behavior matches the card. Right-click "Open in new tab" still works.

No changes to how receipts are uploaded, stored, or emailed.

## Technical notes

- Files: `src/components/equipment/SignOffSheetList.tsx` (card block around the "Return receipt received" section) and `src/components/equipment/SignOffSheetPreviewModal.tsx` (Equipment Return section).
- Reuse the existing `PreviewLink` component (`src/components/documents/PreviewLink.tsx`), which wraps `FilePreviewModal` and preserves the `href` for modifier-click. Same pattern already used in `ShipmentReceipts.tsx`.
- Pass the receipt's `file_url` and a readable name (e.g. `Return Receipt — <tracking or date>`); no bucket/path needed since editing isn't required.
