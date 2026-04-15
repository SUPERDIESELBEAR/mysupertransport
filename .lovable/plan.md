

## Add Editable Truck Specs to Vehicle Hub Detail Drawer

### Overview
Add an inline edit mode to the Fleet Detail Drawer header section, allowing staff to edit truck year, make, VIN, and unit number directly. Changes save back to `onboarding_status`.

### Changes

**`src/components/fleet/FleetDetailDrawer.tsx`**

1. **Add edit state**: `isEditing`, plus draft fields for `truck_year`, `truck_make`, `truck_vin`, `unit_number`, and an `otherMake` field for the "Other" fallback.

2. **Add "Truck Specs" card** below the header (above DOT section) with a read-only display that shows Year, Make, VIN, Unit Number in a 2×2 grid, with an Edit (pencil) button.

3. **Edit mode**: When editing, replace the display with:
   - Year: text input
   - Make: Select dropdown using `TRUCK_MAKES` from `TruckInfoCard.tsx` (with "Other" + free-text fallback)
   - VIN: text input
   - Unit Number: text input
   - Save / Cancel buttons

4. **Save logic**: Update `onboarding_status` table where `operator_id = operatorId`:
   - Set `truck_year`, `truck_make`, `truck_vin`, `unit_number`
   - Use the loud-failure pattern (throw on error, show toast)
   - Refresh data after save via `fetchData()`

5. **Respect `readOnly` prop**: Hide the edit button when `readOnly` is true.

### Files
| File | Change |
|------|--------|
| `src/components/fleet/FleetDetailDrawer.tsx` | Add truck specs edit card with save to `onboarding_status` |

### No migration needed
All target columns already exist on `onboarding_status`.

