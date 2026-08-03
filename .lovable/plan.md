# Swipe to flip truck photos

## Recommendation

Keep the `<` / `>` buttons and add swipe — don't replace them.

- Swipe is the natural gesture on a phone, and drivers are already used to it from the inspection binder flipbook.
- The arrows still matter for desktop/tablet staff use, for keyboard users (arrow keys already work), and as a visible hint that more photos exist. A swipe-only viewer gives no clue that there is anything to swipe to.
- On phones the arrows can be de-emphasized and paired with a small "1 of 10" counter plus dot indicators so the collection size is obvious at a glance.

## What changes

The photo viewer is the shared `FilePreviewModal` (used by My Documents truck photos, the Vehicle Hub photo viewer, decal photos, and the binder). Adding swipe there means every photo album in the driver app gains the same behavior.

1. Horizontal finger swipe on the image area flips to the next / previous photo.
   - Swipe left → next photo, swipe right → previous.
   - At the first or last photo the swipe does nothing (no wrap-around), matching the disabled arrow state.
2. Swipe only applies when there is more than one item and the viewer is showing an image at fit-to-screen size — if the user has zoomed in, dragging pans the photo instead of flipping.
3. Vertical drags keep scrolling / dismissing as they do now; only clearly horizontal drags flip.
4. Keep the header `<` / `>` buttons, the counter, and arrow-key support exactly as they are.
5. On mobile, add a small dot strip under the photo (one dot per photo, current one gold) so the position in the album is visible without reading the counter.
6. First time a driver opens a multi-photo album, show a brief "Swipe to flip" hint that fades out, so the gesture is discoverable.

## Technical notes

- Reuse the existing `useSwipeGesture` hook (`src/hooks/useSwipeGesture.ts`) rather than writing new touch handling — it already separates horizontal swipes from vertical scroll.
- Wire it into the document area of `FilePreviewModal` in `src/components/inspection/DocRow.tsx`, calling the existing `onPrev` / `onNext` props. No changes needed in `TruckPhotoViewerModal.tsx`, `DecalPhotoViewerModal.tsx`, or `MyDocumentsFolders.tsx` — they already pass those props.
- Gate the handlers on `isImage && imageFitMode` so pinch-zoomed panning is unaffected, and pass an `excludeSelector` for iframes so PDFs are untouched.
- Dot strip renders only when a new optional `total` / `index` pair is supplied by the caller; the truck photo viewers pass it alongside the existing `counter` string.
- Hint dismissal state stored in `localStorage` under a single key so it shows once per device.
