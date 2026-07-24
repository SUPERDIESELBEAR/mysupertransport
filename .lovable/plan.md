## Problem

In `src/components/inspection/DocRow.tsx` (the shared preview modal used by the Dispatch Board decals viewer), the print button calls:

```ts
iframeRef.current?.contentWindow?.print();
```

But images are rendered as a plain `<img>` element — no iframe is mounted for image files. `iframeRef.current` is therefore `null`, and clicking Print silently does nothing. This is exactly what happens for decal photos (JPEG/PNG), which is why every other action in the pop-up works except Print.

## Fix

Update `handlePrint` in the `n` (image/PDF) modal component in `src/components/inspection/DocRow.tsx` so it branches on file type:

- **PDF / other (existing behavior):** keep `iframeRef.current?.contentWindow?.print()`.
- **Image (new):** open a small print window containing only the signed image URL. Once the image loads, call `window.print()` inside that popup. If the popup is blocked (mobile Safari), fall back to a hidden iframe injected into the current document that hosts the image and triggers `print()` on load, then removes itself.

Also drop the `disabled={!loaded}` guard on the image path once the image has resolved (still gate on `imageReady` / `loaded` so the button only enables when there's something to print).

No other files need to change — the same modal powers Dispatch Decals, Vehicle Hub decals, DOT Binder, and the Driver Hub, so this single fix restores print for images everywhere.

## Verification

Launch Playwright against the running preview at `/dashboard?view=dispatch`, open a driver's Decals modal, click Print, and confirm a print dialog (or the fallback iframe print flow) fires. Screenshot the resulting state.
