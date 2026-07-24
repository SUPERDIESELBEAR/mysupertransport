## Goal
Vehicle Hub cards currently show the first truck/decal photo as a small thumbnail on each card. Because these images sign & load in as the user scrolls, the cards look inconsistent and flicker. Replace the thumbnails with clean, uniform icons while keeping the click behavior (opens the photo viewer/carousel) untouched.

## Change (single file: `src/components/fleet/FleetRoster.tsx`)

1. In the truck-photos tile (around line 529): remove the `<img src={thumbs.truck}>` branch. Always render a uniform icon tile — `Truck` icon (from lucide-react, already imported) on a subtle muted background. If `truckCount === 0`, dim the icon to indicate empty state.
2. In the decal-photos tile (around line 551): same treatment using the `ImageIcon` (already imported) — or a dedicated decal-appropriate icon like `Sticker`. Recommend `ImageIcon` for visual distinction from the truck icon.
3. Delete the now-unused thumbnail signing logic:
   - `thumbUrls` state (line 74)
   - The effect that builds signed URLs (starting near line 219)
   - Any helper vars only used to compute those URLs
   This removes the network calls that caused the pop-in during scroll.
4. Keep everything else identical: click handlers, count text ("N photos" / "No photos"), modal wiring for `TruckPhotoGridModal` and `DecalPhotoViewerModal`.

## Result
Every card shows the same two icon tiles (Truck | Decal) with photo counts. Clicking either still opens the existing modal with the full scrollable photo set. No more per-card thumbnail fetches → cleaner, uniform appearance and faster scroll.
