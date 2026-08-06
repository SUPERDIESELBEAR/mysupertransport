# Onboard Systems: "By Driver" pairing view

Add a new section to the Onboard Systems page that lists every active driver with their ELD and Dash Camera side by side, plus a smaller line for Fuel Card and BestPass when assigned.

## What it looks like

- New tab on the Onboard Systems page: **Inventory | By Driver | Sign-Off Sheets**.
- Card/table toggle, matching the rest of the page.
  - **Cards:** one card per driver — header shows "Unit ### · Driver Name"; two prominent blocks for ELD and Dash Camera (serial number + status); a small footer row with Fuel Card and BestPass chips when present.
  - **Table:** columns Unit #, Driver, ELD, Dash Camera, Fuel Card, BestPass.
- Search box (driver name, unit number, any serial number) and a filter for "Missing ELD or Dash Cam".
- Sorted by unit number, then driver name.

## Coverage and gaps

Every active driver appears, including those with nothing assigned. A missing ELD or Dash Camera renders as a red "No ELD" / "No Dash Cam" marker so gaps are obvious. Fuel Card and BestPass show only when a value exists (no red marker — they are optional).

## Mismatch flagging

Each device value is resolved from two sources:
1. The open equipment assignment in inventory (used for display).
2. The driver's onboarding record device number fields.

Rules:
- Both present and equal → show the value plain.
- Both present and different → show the inventory value with an amber warning icon; tooltip reads "Onboarding record says <other value>".
- Only one present → show that value with a subtle note of where it came from ("onboarding record only" / "not in onboarding record").

Nothing is written or auto-corrected — this view is read-only reporting.

## Technical details

- New file `src/components/equipment/EquipmentByDriver.tsx`, rendered from a new tab in `src/components/equipment/EquipmentInventory.tsx` (existing `activeTab` state extends from `'inventory' | 'sheets'` to include `'by_driver'`).
- Data load in the new component:
  - `operators` where `is_active` is true (respecting the existing demo-driver visibility rule), embedding `applications(first_name, last_name)` and `onboarding_status(unit_number, eld_serial_number, dash_cam_number, bestpass_number, fuel_card_number)`.
  - `equipment_assignments` with `returned_at is null`, embedding `equipment_items(device_type, serial_number, status)`, grouped by `operator_id`.
- Unit number resolves as `onboarding_status.unit_number ?? operators.unit_number`, matching existing inventory behavior.
- Reuses `DEVICE_CONFIG` / `STATUS_CONFIG` and `ViewModeToggle` / `useViewMode` for consistent styling; no schema changes, no new tables, no writes.