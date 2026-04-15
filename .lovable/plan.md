

## Two-Way Sync: Stage 5 Device Fields → Equipment Inventory

### Problem
When a serial number is entered in Stage 5 of the Pipeline (via `handleTruckDeviceEdit` or the main save flow), the Equipment Inventory is not updated. The sync only works one way: Equipment Inventory → Stage 5 (via `EquipmentAssignModal`).

### Solution
Add a helper function that, after a device serial number is saved to `onboarding_status`, checks the `equipment_items` table:
- **If a matching device exists** → create an `equipment_assignments` record (if not already assigned to this operator) and set the device status to `assigned`
- **If no matching device exists** → create the device in `equipment_items` with status `assigned`, then create the `equipment_assignments` record
- **If the serial number is cleared** → return the previously assigned device (set status back to `available`, close the assignment)

### Implementation

**1. New helper: `src/lib/equipmentSync.ts`**
A reusable async function `syncDeviceToInventory(operatorId, deviceType, serialNumber, assignedBy)` that:
- Queries `equipment_items` for a matching `serial_number` + `device_type`
- If found and already assigned to this operator → no-op
- If found but available → creates assignment, sets status to `assigned`
- If not found → inserts new `equipment_items` row + assignment
- If `serialNumber` is empty/null → finds any active assignment for this operator+device_type and returns it (sets device back to `available`, sets `returned_at` on assignment)

**2. Update `src/pages/staff/OperatorDetailPanel.tsx`**
- In `handleTruckDeviceEdit`: after saving to `onboarding_status`, call `syncDeviceToInventory` for each of the 4 device types where the value changed from the previous state
- In the main `handleSave` flow: same sync for any device fields that were modified

**3. Update `src/components/drivers/AddDriverModal.tsx`**
- After successfully creating the operator and setting device serial numbers on `onboarding_status`, call `syncDeviceToInventory` for each non-empty device field

### Files to change
| File | Change |
|------|--------|
| `src/lib/equipmentSync.ts` | New helper function |
| `src/pages/staff/OperatorDetailPanel.tsx` | Call sync after device number saves |
| `src/components/drivers/AddDriverModal.tsx` | Call sync after driver creation with device numbers |

### No migration needed
The existing `equipment_items` and `equipment_assignments` tables already have the required columns and RLS policies.

