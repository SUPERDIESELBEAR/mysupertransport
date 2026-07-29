## Problem

When a driver opens an image document (e.g. CDL Front) from **My Documents** or **Company Documents** in the binder, the image opens visibly zoomed-in instead of fitting the screen — the driver has to pan around and pinch out to see the whole document.

## Root cause

In `src/components/inspection/DocRow.tsx` (`FilePreviewModal`, image branch around lines 674–686), the image container is:

```
<div className="flex-1 relative overflow-auto">          {/* parent */}
  <div className="w-full h-full flex items-center justify-center overflow-auto">
    <img className="max-w-full max-h-full object-contain" ... />
  </div>
</div>
```

Two issues cause the image to render at natural pixel size on iOS Safari:

1. The inner wrapper relies on `h-full` inside a `flex-1` parent. When that percentage height doesn't resolve (a common Safari quirk when the parent is a flex item), `max-h-full` becomes `none` and the `<img>` renders at its intrinsic size — often 3000+px tall for a phone photo — inside an `overflow-auto` container. The result looks "zoomed in."
2. `overflow-auto` on the inner wrapper lets the image push its own container to grow, defeating `max-w-full` / `max-h-full` even when height does resolve.

## Fix

Change only the image branch of `FilePreviewModal` so the wrapper is size-independent of flex/percentage math:

- Replace the `w-full h-full … overflow-auto` inner div with `absolute inset-0 flex items-center justify-center overflow-hidden`. `absolute inset-0` anchors to the already-`relative` parent regardless of flex height resolution.
- Keep `<img className="max-w-full max-h-full object-contain">` so the image always fits within the viewport on first render.
- Keep the existing `transform: scale(...)` for desktop zoom controls. Pinch-to-zoom on mobile continues to work natively.

No changes to the PDF branch, the header/toolbar, or any callers. No new props.

### File touched

- `src/components/inspection/DocRow.tsx` — image container in `FilePreviewModal` only (~3 lines).

## Verification

- Open the driver app on a phone-sized preview, navigate to **My Documents** → **CDL (Front)** → **Open**. Image should render fully visible on load, letterboxed to fit.
- Same for **Company Documents** images.
- Pinch-zoom still enlarges as expected; desktop zoom buttons still work.
