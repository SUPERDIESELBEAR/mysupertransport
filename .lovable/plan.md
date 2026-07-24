# Unify Truck & Decal Photo Viewers in Vehicle Hub

Make the Vehicle Hub photo experience symmetric between Truck and Decal, clean up the Truck Photos popup, and fix the see-through background on the Decal viewer.

## 1. Vehicle Hub — Truck Photos: switch to a flipbook viewer

Today the Truck tile opens `TruckPhotoGridModal` (grid of all 10 positions with a "Received" pill and an extra X). The Decal tile opens `DecalPhotoViewerModal`, which uses `FilePreviewModal` as a one-at-a-time flipbook.

- Create `src/components/fleet/TruckPhotoViewerModal.tsx`, modeled directly on `DecalPhotoViewerModal`.
  - Accepts the same truck photo file list (`file_name`, `file_url`) already passed to `TruckPhotoGridModal`.
  - Builds an ordered tile list using the canonical `PHOTO_POSITIONS` sequence (Front, Driver Side, Rear, Passenger Side, then the 6 tire positions), followed by any unmatched extras at the end.
  - Renders one photo at a time via `FilePreviewModal`, with the position label as the title (e.g. `Emma Mueller — Driver Side`), the built-in `counter` (`3 of 10`), and prev/next arrows — identical UX to Decal.
  - Empty state matches Decal's inline "No truck photos uploaded yet." overlay.
- In `src/components/fleet/FleetRoster.tsx`, swap the `TruckPhotoGridModal` render for `TruckPhotoViewerModal` (same props source).
- Leave `TruckPhotoGridModal` in place for its other caller (`OperatorDetailPanel` staff onboarding view) — that grid still serves a different purpose there (marking as received, verifying full set).

Result: In Vehicle Hub, tapping Truck and tapping Decal both open the same flipbook UI with per-photo titles and prev/next arrows.

## 2. Clean up `TruckPhotoGridModal` (used in Onboarding staff panel)

Apply the requested fixes so the grid modal doesn't have redundant chrome, regardless of where it's shown:

- Remove the second X button in the header (line 154–156). Keep only the Radix Dialog's built-in close X.
- Remove the "Received" pill text (line 149–153). Presence of the photos already conveys this; keep the "Mark as Received" action for the pre-received state.

## 3. Fix see-through Decal (and Truck) preview background

`FilePreviewModal` currently uses `bg-black/90` on its root `fixed inset-0` container, which leaves 10% transparency — that's the "small piece of the screen behind it" visible in the decal screenshot.

- In `src/components/inspection/DocRow.tsx`, change the `FilePreviewModal` root from `bg-black/90` to fully opaque `bg-black` so nothing behind the overlay bleeds through. Also apply to the matching empty-state overlay in `DecalPhotoViewerModal` (and the new `TruckPhotoViewerModal`) for consistency.

This automatically fixes the same issue for every other viewer that uses `FilePreviewModal`.

## Files touched

- `src/components/fleet/TruckPhotoViewerModal.tsx` (new)
- `src/components/fleet/FleetRoster.tsx` (swap modal)
- `src/components/staff/TruckPhotoGridModal.tsx` (remove extra X + "Received" pill)
- `src/components/inspection/DocRow.tsx` (opaque background)
- `src/components/fleet/DecalPhotoViewerModal.tsx` (opaque empty-state background)

## Out of scope

- No changes to how photos are uploaded, stored, or synced.
- Onboarding staff Truck Photos grid keeps its grid layout and "Mark as Received" action (just without the redundant chrome).
