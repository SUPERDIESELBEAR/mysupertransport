# Fix blank PNG export (and tidy the PDF) for dispatch history

## What I found
- The PDF you sent is correct: header, legend, counts (31 D / 17 H), and all 48 day cells render. Only cosmetic issue is the browser's print header/footer (page title, URL, timestamp) printed at the top and bottom.
- The PNG you sent is a pure white 1920x613 image — zero non-white pixels. The capture ran, but nothing was painted into it.

## Why the PNG is blank
The export builds a hidden `<div>` at `position:fixed; left:-99999px`, injects HTML, and immediately calls `toPng()`. `html-to-image` serializes the node into an SVG `foreignObject` and rasterizes it in an `Image`. Two things make that come back empty here:
- The node is captured on the same tick it is inserted, before layout/fonts settle, so the serialized clone has no painted content.
- `html-to-image`'s first call after inserting a node commonly resolves before the inlined image/fonts decode — the known workaround is to warm it and capture again.

The reported size (1920x613 at pixelRatio 2 = 960x307 CSS px) also shows the capture measured a partially laid-out node rather than the intended 1200px-wide document.

## Fix
In `src/components/dispatch/DriverHistoryDownloadPopover.tsx`, in the PNG path:
- Mount the offscreen container in normal flow but visually hidden (`position:absolute; left:-99999px; top:0; width:1200px; opacity:1`) so it gets a real layout box.
- Await `document.fonts.ready` plus two animation frames before capturing.
- Measure the node and pass explicit `width`/`height` (plus `style: { transform: 'none' }`) to `toPng`.
- Call `toPng` once to warm, then again for the saved result (standard html-to-image workaround).
- Verify the returned data URL is non-blank before downloading; if it is still empty, show a toast telling the user to use PDF instead of silently saving a white image.

Also tighten the PDF slightly:
- Keep `@page { margin: 0.4in }` but drop the document `<title>` to a blank string so Chrome's print header does not print the long filename/URL line. (Chrome always draws its own header/footer unless the user unchecks "Headers and footers"; the note under the buttons will mention that.)

## Verification
Run the export against a real driver in the preview, decode the produced PNG, and confirm it contains non-white pixels and the same day grid as the PDF.

## Technical notes
Single file touched: `src/components/dispatch/DriverHistoryDownloadPopover.tsx`. No database, query, or Dispatch Board layout changes.
