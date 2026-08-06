# Show last assigned driver on Damaged and Lost devices

## What changes

In Onboard Systems → Inventory, any device marked **Damaged / Needs Repair** or **Lost / Not Returned** will show a line with the last driver it was assigned to, plus that driver's unit number and the date it was returned/reported.

Example line on the row and the card:

```text
Last held by: Unit 412 · Kevin Foy · returned Jul 28, 2026
```

If the device was never assigned to anyone, nothing extra is shown.

Assigned devices keep their existing "currently assigned to" line unchanged. Available and deactivated devices are unchanged.

## Technical notes

`src/components/equipment/EquipmentInventory.tsx`

- In `fetchItems`, add a second query against `equipment_assignments` for rows where `returned_at is not null`, ordered by `returned_at desc`, embedding `operators(unit_number, applications(first_name,last_name), onboarding_status(unit_number))` — same embed shape already used for open assignments.
- Build a `lastAssignmentMap` keyed by `equipment_id`, keeping only the first (most recent) row per equipment id. Store `{ name, unitNumber, returnedAt }`, resolving unit number as `onboarding_status.unit_number ?? operators.unit_number` and name the same way as the current map.
- Extend the `EquipmentItem` type with `last_operator_name`, `last_unit_number`, `last_returned_at` and populate them in the `enriched` map.
- Render in both `EquipmentRow` (under the serial/badge block) and `EquipmentCard` (below the assigned block): show only when `status === 'damaged' || status === 'lost'` and `last_operator_name` exists. Use muted styling for the row line; for the card use a warning-toned box for damaged and destructive-toned for lost, matching existing status tokens.
- Include `last_operator_name` and `last_unit_number` in `matchesQuery` so section search finds damaged/lost devices by the last holder.
- Format the date with the existing Central-time / noon-anchor convention used elsewhere in the app.
