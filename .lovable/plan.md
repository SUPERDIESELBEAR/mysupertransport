# Force truck/decal photo previews above everything

The `bg-black` fix removed the 10% translucency, but the user still sees UI (the red notification bell badge) peeking through. That means the overlay is not stacking above every sibling — either an ancestor establishes a stacking context, or something else in the app also uses `z-50` and wins the tie. The overlay needs to escape its parent and sit above all app chrome.

## Changes

1. **Portal + higher z-index for `FilePreviewModal`** (`src/components/inspection/DocRow.tsx`)
   - Wrap the returned root in `createPortal(..., document.body)` so it renders as a direct child of `<body>` and is immune to any ancestor stacking context.
   - Change the root class from `z-50` to `z-[9999]` (matches the value already used elsewhere in this file for the Suspense fallback overlay).
   - Keep `bg-black` (fully opaque) as-is.

2. **Same treatment for the empty-state overlays** in:
   - `src/components/fleet/DecalPhotoViewerModal.tsx` (no-photos branch)
   - `src/components/fleet/TruckPhotoViewerModal.tsx` (no-photos branch)
   
   Both render an inline `fixed inset-0 z-50 bg-black` div. Wrap each in `createPortal(..., document.body)` and bump to `z-[9999]` so the empty state behaves identically to the populated preview.

## Out of scope

- No prop or API changes on any modal.
- No changes to header/bell/sidebar z-index — the fix stays inside the preview components.
