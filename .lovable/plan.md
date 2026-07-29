## Goal

Fix the **driver app binder list-mode “Open” preview** so a tapped document/image starts in a true **Fit to screen** view. The full document/image should be visible immediately, and the driver can zoom in afterward for details.

## Current issue

The list-mode Open button in `DocRow` opens the older `PDFModal` in `src/components/inspection/DocRow.tsx`.

That modal uses fixed zoom percentages (`100%`, minimum `50%`) and renders files through an iframe/blob flow. For large image scans like CDL photos, `100%` means intrinsic image size, not fit-to-screen. Even `50%` can still be larger than the phone viewport, which matches the screenshots.

The newer `FilePreviewModal` already uses an image-specific rendering path with `object-contain`, but it still starts at `100%` scale, so for this task the default image zoom should become a real fit mode.

## Plan

1. Update `FilePreviewModal` in `src/components/inspection/DocRow.tsx` to support a dedicated initial **Fit** zoom state for images.
   - Add a fit/default zoom option before the existing numeric zoom values.
   - In Fit mode, render images with `max-w-full max-h-full object-contain` and **no scale transform**, so the whole image is visible.
   - When the user taps zoom-in, move from Fit to the first numeric zoom step.
   - Keep numeric zoom behavior for manual zooming.

2. Route list-mode binder `Open` actions through `FilePreviewModal` instead of the older `PDFModal`.
   - This applies to both My Documents and Company Documents because both use `DocRow`.
   - Preserve existing edit support by passing the existing bucket/path props and save callback.

3. Keep `PDFModal` exported for any existing legacy consumers, but stop using it for the driver binder row Open action.

4. Verify the behavior on mobile:
   - Open a CDL/front image from list mode: full image is visible initially.
   - Zoom-in still works for closer inspection.
   - Open PDF flow remains functional.
   - Edit/save still works for editable binder documents.

## Out of scope

- No changes to flipbook mode.
- No changes to binder list row layout.
- No database or storage changes.