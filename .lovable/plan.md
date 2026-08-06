# Onboard Systems inventory: unit numbers, sorting, per-section search and add

Four improvements to the Inventory tab of Onboard Systems, applied to both the table view and the card view.

## 1. Unit number on every row and card

Each assigned device shows the operator's unit number next to the driver name, e.g. `Unit 214 · Kevin Foy`. Devices that are not assigned show nothing extra. The unit number also becomes searchable.

## 2. Automatic status ordering

Within each device type section, devices are ordered:

```text
1. Assigned   (sorted A-Z by driver name, then unit number)
2. Available  (sorted by serial number)
3. Damaged / Needs Repair
4. Lost / Missing
5. Deactivated (last; mainly fuel cards)
```

The existing Fuel Card sub-sections (Assigned / Unassigned / Lost / Deactivated) already group this way and keep their layout, with the same alphabetical sort applied inside each sub-section.

## 3. Search bar inside each device type section

Each expanded section (ELD, Dash Camera, BestPass, Fuel Card) gets its own compact search box in the section header area that filters only that section's devices by serial number, driver name, unit number, or notes. It works alongside the existing global search and status chips rather than replacing them; the section device count reflects the filtered result.

## 4. "Add Device" inside each section

Each section header gets an `+ Add <type>` button that opens the same Add Device dialog with the device type pre-selected and locked to that section, so there is no scrolling back to the top. The top-level Add Device button stays for the free-choice case.

## Technical notes

- `src/components/equipment/EquipmentInventory.tsx`
  - Extend the assignment lookup to also select `operators.unit_number`, and add `current_unit_number` to the `EquipmentItem` type populated from the assignment map.
  - Add a `sortItems()` helper implementing the status rank order plus the alphabetical tiebreaker; apply it to `grouped[type]` and inside `FuelCardSections`.
  - Add per-section search state keyed by device type (`Record<DeviceType, string>`) and filter section items with it before sorting.
  - Render the section search input and the per-section Add button in a toolbar row directly under the collapsible group header (only when expanded).
  - `EquipmentRow` and `EquipmentCard` render `Unit {current_unit_number}` alongside the operator name when assigned.
  - Include `current_unit_number` in the existing global search match.
- `src/components/equipment/EquipmentItemModal.tsx`
  - Accept an optional `defaultDeviceType` prop; when provided on an add (no `item`), preselect it and disable the device type select.

No database or backend changes are required — `operators.unit_number` already exists.
