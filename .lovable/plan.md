## Goal

Remove the circled status summary cards (Available, Assigned, Damaged / Needs Repair, Lost/Missing, Deactivated) from the **Inventory** tab of Onboard Systems, without losing the counts or the click-to-filter behavior. Assignment Sheets tab is untouched.

## Changes (all in `src/components/equipment/EquipmentInventory.tsx`)

1. **Delete the summary stat card grid** (the 5-card row above the per-type cards).

2. **Preserve filtering + counts in the existing status filter chip bar** (already present under the search box):
   - Each chip gains its count as a small badge: `All 42`, `Available 12`, `Assigned 21`, etc. Counts come from the existing `counts` object, so no new logic.
   - Chips keep the current toggle behavior; clicking an active chip other than "All" clears back to "All", matching the old card toggle.

3. **Keep the per-type quick summary cards** (ELD, Dash Camera, BestPass, Fuel Card) exactly as they are.

4. **Layout decision (question 3):** keep Download / Add Device buttons where they are, but pull them up onto the same row as the tab strip on desktop so the reclaimed vertical space goes to the device ribbons instead of leaving a gap. On mobile they stay on their own full-width row.

5. **Mobile scaling (question 5):**
   - Status chips become a single horizontally scrollable row (`overflow-x-auto`, no wrap, hidden scrollbar) so all six fit cleanly without stacking.
   - Search input takes full width on its own row on small screens; chips + view-mode toggle sit on the row below.
   - Per-type cards stay 2-up on mobile, 4-up on desktop.

## Notes

- No database or business-logic changes; purely presentational.
- `statusFilter` state, `counts`, and `STATUS_CONFIG` all stay in place and are reused by the chips.
