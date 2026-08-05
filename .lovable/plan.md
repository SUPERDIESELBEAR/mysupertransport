# Fix overflow in deactivated Vehicle Hub cards

## What's wrong
Deactivated vehicle cards add a "Reactivate Unit" button to the same footer row that already holds Repair Cost, Edit, Log Update, and the "..." menu. Five items don't fit the card width, so the Repair Cost label wraps oddly and the buttons spill past the card's right edge. Active cards have one fewer button and still fit, so they stay as-is.

## Fix (deactivated cards only)
In `src/components/fleet/FleetRoster.tsx`, the card footer:

- When the row is deactivated, render a stacked footer instead of the single row:
  - Row 1: Repair Cost label/value on the left, Edit / Log Update / "..." on the right.
  - Row 2: full-width "Reactivate Unit" button underneath, so it never competes for horizontal space.
- Add `min-w-0` to the Repair Cost block and `flex-wrap gap-y-2` to the action group so nothing can push outside the card at narrow widths.
- Active cards keep the existing single-row footer unchanged.

Presentation-only change; no behavior, data, or reactivation logic is touched.
