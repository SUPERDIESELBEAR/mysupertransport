

## Fix: Crop Disappears After Dragging Edge on Rotated Image

### Root Cause
Line 233: `transform: rotate(${rotation}deg)` rotates the image visually via CSS, but `ReactCrop` still measures crop coordinates against the original un-rotated bounding box. After rotation, the crop handle positions no longer map correctly to the image — dragging an edge produces invalid/zero-size crop values, causing the component to collapse and close.

### Solution
Instead of CSS rotation, bake the rotation into the image source itself. When the user clicks rotate, render the rotated image onto an off-screen canvas, convert to a data URL, and update `imageSource`. This way `ReactCrop` always operates on a correctly oriented image with matching dimensions.

### Changes — single file: `src/components/shared/DocumentEditor.tsx`

1. **Store original blob URL separately** — keep `originalSource` (from download) and `imageSource` (possibly rotated) as separate states
2. **Add `applyRotation` helper** — loads the original image, draws it rotated onto a canvas, returns a new data URL
3. **On rotate click** — call `applyRotation`, update `imageSource` to the rotated data URL, reset crop to 100%
4. **Remove CSS `transform: rotate()`** from the `<img>` — the image is already correctly oriented
5. **Simplify `getCroppedImage`** — remove rotation logic since it's pre-baked; just do a straight pixel crop
6. **Reset button** — restores `imageSource` back to `originalSource` and resets crop/rotation state

### Why this fixes the issue
- `ReactCrop` always sees a non-transformed image whose dimensions match the crop coordinate space
- Dragging any edge works correctly because the bounding box is accurate
- No more collapsed/zero-size crops causing the editor to vanish

