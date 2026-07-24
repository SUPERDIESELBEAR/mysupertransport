## Goal
Restore access to Truck and Decal photo viewers in the Vehicle Hub **Table view** (they currently exist only in Cards view), keeping the row compact.

## Change
In `src/components/fleet/FleetRoster.tsx`, extend the Actions cell of each table row with two small icon buttons matching the cards view behavior:

- **Truck icon** → opens `TruckPhotoViewerModal` (same handler used by the card).
- **Badge icon** → opens `DecalPhotoViewerModal` (same handler used by the card).

Details:
- Icons colored gold (`text-primary`) when the driver has photos, muted (`text-muted-foreground`) when none — mirroring the card treatment for uniformity.
- Size `h-7 w-7` ghost buttons to match the existing Edit/Add buttons; ordered as: Truck, Decal, Edit, Add.
- Tooltips: "View truck photos" / "View decal photos".
- Reuse the existing state/handlers already wired for the card view (`setTruckPhotoTarget`, `setDecalPhotoTarget`) — no new modals or fetching logic.
- On narrow widths, wrap the action group with `flex-wrap` so the row stays clean instead of overflowing.

No changes to Cards view, data fetching, or the modals themselves.
