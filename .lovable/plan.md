## Problem

Opening a PDF from the Document Hub currently takes 3 taps on mobile:

1. Tap **View PDF** on the card → routes to the DocumentViewer page.
2. Tap **View PDF** again on that page → opens the `FilePreviewModal`.
3. Tap **Open PDF** inside the modal's mobile fallback → finally opens the PDF in a new tab.

Root causes:

- `DocumentViewer` renders its own "View PDF" button gate instead of auto-opening the preview.
- `FilePreviewModal` (in `src/components/inspection/DocRow.tsx`) shows a mobile fallback card because inline `<iframe>` PDF rendering is unreliable on iOS Safari, forcing a second tap to `window.open`.

## Recommended Fix — collapse to a single tap

**Mobile (iOS/Android):** From the Document Hub card, tap **View PDF** → the signed PDF URL opens immediately in the device's native PDF viewer (new tab / in-app viewer). No intermediate screen, no modal.

**Desktop:** Tap **View PDF** on the card → the `FilePreviewModal` opens directly over the Doc Hub with the PDF rendered inline in an iframe. No intermediate viewer page.

Acknowledgment tracking is preserved: opening the PDF (via either path) still records `hasOpenedPdf = true`, so the **Acknowledge** button unlocks. The DocumentViewer page is still reachable for the acknowledgment step — it just no longer sits between the tap and the PDF.

## Behavior details

- Card click on a **PDF** doc: resolve signed URL, mark opened for acknowledgment, then:
  - Mobile → `window.open(signedUrl, '_blank')`, then route to the DocumentViewer page in the background so the driver lands on the acknowledgment screen when they return.
  - Desktop → route to the DocumentViewer page with a query flag (`?preview=1`) that auto-mounts `FilePreviewModal` on load.
- Card click on **non-PDF** (rich text / video) docs: unchanged — routes to the viewer page as today.
- DocumentViewer page: when `?preview=1` is set (or on desktop by default for PDFs), auto-open the preview modal on mount and drop the intermediate "View PDF" button; keep a small "Reopen PDF" link for when the modal is dismissed.
- **Download PDF** link stays where it is on the viewer page.

## Files to touch (frontend only)

- `src/components/documents/DocumentCard.tsx` — branch PDF click to open signed URL directly (mobile) or navigate with `?preview=1` (desktop); notify parent that the PDF was opened.
- `src/components/documents/DocumentHub.tsx` — pass a "PDF opened" callback so the acknowledgment state persists when the driver lands on the viewer.
- `src/components/documents/DocumentViewer.tsx` — auto-open `FilePreviewModal` on mount for PDFs (or when `?preview=1`); remove the redundant middle "View PDF" button and replace with a subtle "Reopen PDF" secondary action.
- No changes to `FilePreviewModal` / `DocRow.tsx` — the mobile fallback stays for other surfaces that still rely on it.

## Out of scope

- Replacing the mobile PDF fallback with a bundled PDF.js viewer (larger change, deferred).
- Any change to acknowledgment rules, versions, or storage.
