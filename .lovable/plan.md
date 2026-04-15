

## Add Duplicate-Prevention Guards to Equipment System

### Changes

**1. `src/components/equipment/EquipmentItemModal.tsx` — Block duplicate serial + type on add/edit**
- In `handleSave`, before inserting/updating, query `equipment_items` for an existing row with the same `serial_number` (uppercased) and `device_type`
- If editing, exclude the current item's `id` from the check
- If a duplicate is found, show a destructive toast: "A {device type} with serial {serial} already exists" and abort

**2. `src/components/equipment/EquipmentAssignModal.tsx` — Block assigning an already-assigned device**
- In `handleAssign`, before inserting the assignment, query `equipment_assignments` for any row where `equipment_id = item.id` and `returned_at IS NULL`
- If an active assignment exists, show a destructive toast: "This device is already assigned to another operator" and abort

**3. Database unique constraint (migration)**
- Add a unique index on `equipment_items(serial_number, device_type)` as a backend safety net, so even if the UI check is bypassed, the database rejects duplicates

### Files to change
| File | Change |
|------|--------|
| `src/components/equipment/EquipmentItemModal.tsx` | Add duplicate serial+type check before save |
| `src/components/equipment/EquipmentAssignModal.tsx` | Add active-assignment check before assign |
| Database migration | `CREATE UNIQUE INDEX` on `equipment_items(serial_number, device_type)` |

