## Goal
On the Management → Vehicle Hub fleet cards, replace the single combined "Photos — X truck · Y decal" row with two independently clickable entries and a real Driver-Side decal thumbnail preview. Each viewer opens as its own modal with a close (X) control.

## Current behavior
`src/components/fleet/FleetRoster.tsx` (lines 469-502) renders one button showing 3 generic camera icons and the summary "X truck · Y decal". Clicking it opens `TruckPhotoGridModal` which mixes truck + decal images. When there are no photos at all, an empty `ImageIcon` placeholder is shown.

## New behavior

### 1. Two entries in the photos strip
Replace the single button with two side-by-side buttons (or stacked on narrow cards) inside the same "photos strip" region:

- **Truck Photos** — thumbnail = first truck photo (or dashed placeholder if none). Label: "Truck Photos · N".
- **Decal Photos** — thumbnail = Driver-Side decal photo (`decalPhotoDsUrl`) when present, else Passenger-Side, else first extra decal, else dashed placeholder. Label: "Decal Photos · N" (N = DS + PS + extras).

Each button is disabled/greyed when its count is 0, but still clickable to a "no photos yet" empty state inside its own modal (kept simple: just don't open when 0, matching the current "no photos" behavior).

### 2. Real thumbnail rendering
Today the strip shows camera icons even when photos exist. Load a signed URL for the thumbnail image and render it as an `<img>` inside the 40×40 rounded tile. Use the existing `preloadSignatureDataUrl`/storage signed-URL pattern already used elsewhere in the fleet UI. Cache the resolved URL per row so the roster doesn't re-sign on every re-render.

### 3. Two dedicated viewers with X to close
- **Truck viewer**: keep `TruckPhotoGridModal`, but pass a new prop `mode="truck"` so it only displays `truckPhotos` and hides decal entries. It already has a Dialog X close.
- **Decal viewer**: new lightweight modal `DecalPhotoViewerModal.tsx` that renders DS, PS, and extras as labeled tiles ("Driver Side", "Passenger Side", "Additional"). Clicking a tile expands it via the existing `FilePreviewModal` (already used app-wide for in-app image previews). Dialog carries the standard X close.

Both modals are dismissible via the standard shadcn Dialog X in the top-right and via Escape/overlay click.

### 4. State on FleetRoster
Replace `photoGridTarget` with two separate state slots: `truckPhotoTarget` and `decalPhotoTarget`. Wire the corresponding buttons to set each.

## Files touched
- `src/components/fleet/FleetRoster.tsx` — split the strip into two buttons; add DS thumbnail loading; add second modal state.
- `src/components/staff/TruckPhotoGridModal.tsx` — add optional `mode?: 'truck' | 'all'` prop (default `'all'` to preserve any other callers); when `'truck'`, render only truck photos and update the title.
- `src/components/fleet/DecalPhotoViewerModal.tsx` (new) — labeled DS / PS / additional tiles, click-to-expand via `FilePreviewModal`, Dialog X to close.

## Out of scope
- No changes to the upload flow, storage buckets, or the driver-side decal editor.
- No changes to the operator/driver portal photo UI.
- Other placements of the combined "Photos" strip outside Vehicle Hub fleet cards.
