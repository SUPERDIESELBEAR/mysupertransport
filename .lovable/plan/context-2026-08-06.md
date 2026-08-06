Add a By Driver shortcut card to the Onboard Systems Inventory tab

## Context
The Onboard Systems page currently has three top-level tabs: **Inventory**, **By Driver**, and **Assignment Sheets**. Users want a more discoverable shortcut to the By Driver view, specifically a clickable card in the same row as the device-type summary cards (ELD, Dash Camera, BestPass, Fuel Card) on the Inventory tab. The existing top tab between Inventory and Assignment Sheets will stay.

## Proposed changes
1. In `EquipmentInventory.tsx`, add a **By Driver** card as the first item in the per-type summary grid, just above the ELD card.
2. Update the grid layout from `grid-cols-2 sm:grid-cols-4` to `grid-cols-3 sm:grid-cols-5` so the new card fits without crowding.
3. Give the card a distinct visual treatment (driver icon, gold/primary accent) so it reads as a view switch, not a device filter.
4. Display useful counts:
   - Total drivers shown in the By Driver view (fully onboarded: go live + insurance).
   - Number of drivers missing ELD or Dash Camera (the existing gap count from `EquipmentByDriver`).
5. Clicking the card sets the active tab to `by_driver` so the user is taken to the By Driver view.
6. Keep the existing top tab (Inventory | By Driver | Assignment Sheets) unchanged.

## Out of scope
- No changes to the `EquipmentByDriver` data model or query logic.
- No changes to the Assignment Sheets tab.
- No new filters or sorting on the Inventory tab.

## Implementation details
- The card will be a `<button>` matching the existing summary cards so it inherits hover and focus states.
- Use a `Users` icon and a label like "By Driver".
- The count text can read: "{total} drivers · {gaps} missing device".
- The card should not be tied to `typeFilter` (unlike the device-type cards) because it switches tabs rather than filtering inventory.
- The data shown can be computed with a lightweight, targeted query (or reused from the existing `EquipmentByDriver` fetch if already loaded). To keep the Inventory tab fast and avoid duplicate data loading, the plan is to fetch the driver counts only when the Inventory tab is active and cache the result locally.

## UX rationale
A second entry point is acceptable because the user explicitly wants it for discoverability. Placing the card first in the device-type row keeps it contextually close to ELD and Dash Camera, which are the two devices most often paired by driver. The gap-count badge makes the shortcut actionable by highlighting drivers who still need equipment.
