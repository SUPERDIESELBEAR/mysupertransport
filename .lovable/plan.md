

## Fix: Top-Right Save Overwrites Truck & Device Data

### Problem
The top-right "Save Changes" button (`handleSave`) destructures the entire `status` state and writes ALL fields to `onboarding_status`. If the React state hasn't fully updated after a truck/device save (stale closure), `handleSave` overwrites the DB with null truck/device values — erasing data that was just saved by `handleTruckInfoEdit` or `handleTruckDeviceEdit`.

### Root Cause
Line 1262 in `OperatorDetailPanel.tsx`:
```typescript
const { id, fully_onboarded, operator_id, updated_at, updated_by, ...updateData } = status as any;
```
This sends ALL remaining fields (including truck_year, truck_make, eld_serial_number, etc.) to the DB. These fields have their own dedicated save handlers and should not be included in the global save.

### Fix
Strip truck and device fields from `updateData` before writing to the DB in `handleSave`. Since these fields are saved independently by `handleTruckInfoEdit` and `handleTruckDeviceEdit`, the global save should never touch them.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | In `handleSave`, exclude truck fields (`truck_year`, `truck_make`, `truck_model`, `truck_vin`, `truck_plate`, `truck_plate_state`, `trailer_number`) and device fields (`eld_serial_number`, `dash_cam_number`, `bestpass_number`, `fuel_card_number`) from the `updateData` destructure on line 1262, so the global save never overwrites them |

### Detail
Update the destructure to also strip these fields:
```typescript
const {
  id: _id, fully_onboarded: _fo, operator_id: _oid, updated_at: _ua, updated_by: _ub,
  // Truck fields — saved separately via handleTruckInfoEdit
  truck_year: _ty, truck_make: _tm, truck_model: _tmod, truck_vin: _tv,
  truck_plate: _tp, truck_plate_state: _tps, trailer_number: _tn,
  // Device fields — saved separately via handleTruckDeviceEdit
  eld_serial_number: _eld, dash_cam_number: _dc, bestpass_number: _bp, fuel_card_number: _fc,
  ...updateData
} = status as any;
```

This ensures the global Save button only writes the fields it manages (onboarding stages, insurance, costs, etc.) and never touches truck/device data.

### Expected result
- Save truck info via Edit Truck popover → data persists
- Click top-right Save → truck/device data is untouched
- Exit and return → all data intact

