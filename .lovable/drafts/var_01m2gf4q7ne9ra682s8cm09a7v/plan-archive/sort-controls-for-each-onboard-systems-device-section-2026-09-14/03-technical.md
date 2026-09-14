# Technical details

All changes are in `src/components/equipment/EquipmentInventory.tsx`. No database or backend work.

- New per-section sort state: `Record<DeviceType, SectionSort>` where
  `SectionSort = 'default' | 'driver' | 'unit' | 'serial'`, all starting at `'default'`.
- `sortEquipment(list, mode)` gains the mode parameter:
  - `default` → existing logic untouched (status rank → name → unit → serial).
  - `driver` → collator compare on `current_operator_name`; items without one sort last, then serial.
  - `unit` → numeric-aware collator on `current_unit_number`; missing sorts last, then serial.
  - `serial` → collator compare on `serial_number`.
- Toolbar row (the row holding the section search + Add button) gains a small
  `Select` with the four options; changing it re-sorts that section's `displayItems`.
- `FuelCardSections` receives the mode and passes it to its internal
  `sortEquipment` calls, keeping the four sub-groups.
- Sorting happens after the existing search/status filtering, so counts shown in
  section headers still reflect filtered results.

## Verification
- Extend the existing unit tests around `sortEquipment` (or add a focused test file)
  for each mode: missing values last, numeric unit ordering (Unit 9 before Unit 214),
  default mode byte-identical to today's output.
- Manual: open Onboard Systems, sort ELDs by unit in table and card view, sort fuel
  cards by card number, confirm sub-groups and search still behave.
