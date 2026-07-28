## Scope

Fixes to the front-facing driver **Documents → View** experience, contained to `src/components/inspection/DocRow.tsx` (viewer toolbar + download) and `src/components/shared/DocumentEditor.tsx` (crop lockup). No business logic or data changes.

## 1. Header overcrowding (circled area in screenshot)

On a phone-width screen the top bar packs 12 controls into one row — Back label + file icon + filename + "100%" zoom pill + zoom in/out + edit + share + print + download + open-in-new-tab + close — so the file icon collides with the "100%" pill and the filename gets clipped.

Changes to `FilePreviewModal`'s header:

- Drop the redundant `FileText` icon next to the filename (the whole modal is a file viewer; the icon adds no info and is what visibly overlaps).
- On mobile only (`isMobile`), hide the "Back" text label and keep just the arrow (the ✕ close button already handles closing; Back + ✕ side-by-side is redundant).
- On mobile only, collapse the zoom cluster to a single "100%" pill that opens a small popover with –/reset/+ (or simply hide zoom on mobile PDFs, which already happens, and on mobile images since pinch-zoom is native). Desktop keeps the full inline zoom cluster.
- On mobile only, hide the "Open in new tab" button — the Download and Share buttons already cover that need, and it's the least-used control.
- Tighten spacing: `gap-0.5` between action buttons on mobile, and let the filename take remaining width with `flex-1 min-w-0 truncate` instead of a fixed `max-w-[40vw]`.

Result on a 390px phone: Back arrow · filename (truncated) · counter · prev/next · 100% · edit · share · print · download · close — fits without overlap.

## 2. Download does nothing on mobile

`downloadBlob` fetches the file as a blob, creates an `<a download>`, and clicks it. iOS Safari (and in-app WebViews like the PWA) silently ignores the `download` attribute on blob URLs and often on cross-origin URLs, which matches the reported "nothing happens."

Changes to `src/lib/downloadBlob.ts`:

- Detect iOS / standalone PWA. On those, open the fetched blob URL in a new tab (`window.open(blobUrl, '_blank')`) so the OS presents its native "Save to Files / Share" sheet, which is the only reliable save path on iOS.
- On other browsers, keep the current `<a download>` click path.
- Delay `URL.revokeObjectURL` (e.g. 60s via `setTimeout`) so the new tab has time to load the blob before it's revoked — the current immediate revoke can also break the download on some browsers.
- Wrap the fetch in a try/catch and surface a toast on failure (currently a failed fetch throws silently from the click handler).

The download button call sites in `DocRow.tsx` don't need to change.

## 3. Edit / crop locks after first adjustment

In `DocumentEditor.tsx`, drag deltas are computed against `imgRef.current.getBoundingClientRect()`. Once the user drags the crop handles inward, the underlying `<img>` element's rendered box does not shrink (the crop is a CSS overlay), so this alone is fine — but the reported symptom ("crops once, then locks on further adjustment before save") points to two real issues in the drag logic:

- **Stale start crop after the first drag.** `startDrag` snapshots `crop` at pointer-down, but when a touch handle re-fires quickly (iOS often emits a synthetic `mousedown` right after `touchstart`), a second `startDrag` runs with the *pre-first-drag* crop, which combined with the just-applied crop pushes the new value against `100 - other - MIN_SIZE` and pins the handle. Fix by ignoring `mousedown` on handles when a touch drag just ended (guard with a short-lived `lastTouchAt` ref, ~300ms), and by adding `e.preventDefault()` to the handle `onTouchStart`.
- **`touchmove` listener with `{ passive: false }` but `touchend` cleanup happens only on `touchend`**, not on `touchcancel`. iOS fires `touchcancel` (e.g. when the browser starts a scroll gesture) and the drag state stays `true`, so the next tap on a handle is treated as a continuation with a stale `dragStart`. Fix by also listening for `touchcancel` and clearing `dragging` + `dragStart.current` there.
- **Handles beyond `100 - MIN_SIZE`** can end up unreachable when the crop rect gets small. Enlarge the touch target: the current 40×`HANDLE` bars are fine, but move the handle divs to `pointerEvents: 'auto'` on a wrapper with `touch-action: none` so browser gesture handling doesn't hijack the second drag. Add `touch-action: none` to the crop overlay container.

Also: after a successful crop-and-save the modal closes, so no change needed there. Before save, tapping the "Undo" button already resets `crop` to zeros; verify it also clears `dragging`/`dragStart.current` (it should since drag state only lives while pointer is down).

## Files changed

- `src/components/inspection/DocRow.tsx` — header layout only (FilePreviewModal).
- `src/lib/downloadBlob.ts` — iOS-safe download path + delayed revoke + error toast.
- `src/components/shared/DocumentEditor.tsx` — touchcancel cleanup, touch/mouse guard, `touch-action: none` on crop overlay.

## Verification

- Preview in mobile viewport: confirm the header no longer overlaps and every button is tappable.
- On an iOS device (or Safari responsive mode), tap Download on a PDF and an image and confirm the OS share/save sheet appears.
- In the editor, crop, release, drag a different handle, release, drag again — confirm handles remain draggable until Save is pressed.
