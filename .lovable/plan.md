## Goal

Add two new issued items to the Onboard Systems Assignment Sheet (OSAS), listed **above BestPass**:

1. **License Plate** — pulled from the MO Plate Registry assignment for the driver.
2. **Truck Registration** — a simple issued line item.

When equipment return instructions go out, the **License Plate** is listed alongside the ELD and Dash Camera. Truck Registration is *not* a returned item. Marking the plate returned does **not** auto-release it in the MO Plate Registry — staff still do that manually.

## What staff will see

**Creating an assignment sheet**
- Item order becomes: ELD → Dash Camera → **License Plate** → **Truck Registration** → BestPass.
- License Plate row auto-fills the plate number + state from the driver's active MO Plate Registry assignment. If none exists, the row shows "No active plate assignment" and is disabled with a hint to assign one first.
- Truck Registration row is a simple opt-in line item with an optional note field — no document lookup, no expiration display, no preview link.
- Both new rows are opt-in checkboxes like BestPass, so sheets without them still work.

**Signed sheet / preview / PDF**
- New rows appear in the item table in the same order, with the plate showing plate number + state and Truck Registration showing its note (or a dash).
- Existing verification toggles and the driver signature gate apply to the new items the same way.

**Equipment return**
- Return instructions email lists "License Plate — <plate> (<state>)" with the other returnable devices. Truck Registration is excluded from the return list.
- The driver-side return card and receipt upload flow already covers whatever is returnable on the sheet; the plate simply shows up as one more item to mail back.
- A short note on the sheet and email clarifies the plate must be removed from the truck and mailed with the other devices.

## Technical details

- **Enum**: extend `osas_device_type` with `license_plate` and `registration` (migration). Existing rows unaffected.
- **Sheet items**: `onboard_assignment_sheet_items` already stores `device_type` + `serial_snapshot`; the plate stores `"<PLATE> (<ST>)"` and Truck Registration stores the optional note. Add a nullable column to record the source plate assignment id so the sheet keeps a stable link.
- **Data source**: read the driver's active row from `mo_plate_assignments` joined to `mo_plates`.
- **Label maps / ordering** to update so the new types render everywhere in the right order: `equipmentUtils.ts`, `CreateSignOffSheetModal.tsx`, `SignOffSheetList.tsx`, `SignOffSheetPreviewModal.tsx`, `EquipmentAssetSheet.tsx`, `send-osas-to-operator` (`DEVICE_TYPES`), and `send-equipment-return-instructions` (`DEVICE_LABELS`).
- **Non-inventory items**: `license_plate` and `registration` are not rows in `equipment_items`, so `send-osas-to-operator` must skip inventory validation, status flips, and `equipment_assignments` inserts for those two types.
- **Return filter**: the return-instructions function and driver return card include `eld`, `dash_cam`, `bestpass`, `fuel_card`, `license_plate`; exclude `registration`.
- **No MO Plate mutation**: nothing in this flow writes to `mo_plate_assignments`.

## Out of scope

- Auto-releasing plates in MO Plate Registry on return.
- Tracking plates as inventory items with statuses.
- Linking or previewing the registration document on the sheet.
