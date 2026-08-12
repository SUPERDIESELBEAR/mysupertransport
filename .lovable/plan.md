# Collapse the section when a category box is unselected

## Behavior
On the Onboard Systems > Inventory tab, the four category boxes (ELD, Dash Camera, BestPass, Fuel Card) currently expand their matching section when selected, but leave it expanded after unselecting.

New behavior, identical for all four boxes:
- Select a box: filter to that type, expand its section, scroll it into view (unchanged).
- Unselect the same box (click it again): clear the filter back to "all" and collapse that section, so the page returns to the all-collapsed list.
- Select a different box while one is active: expand the new one and collapse the previously selected one, so only the selected section stays open.
- Manual expand/collapse using the section ribbon itself keeps working as it does today.

## Technical
In `src/components/equipment/EquipmentInventory.tsx`, update `selectTypeBox`: on deselect, remove the type from `expandedTypes` and clear `lastOpened`; when switching boxes, remove the previously filtered type from `expandedTypes` before adding the new one.