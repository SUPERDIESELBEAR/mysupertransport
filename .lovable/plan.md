
## Fix: Truck Save Still Triggers Unsaved Changes

### What I found
The previous snapshot fix covered device fields correctly, but the truck-info save path is still incomplete in `src/pages/staff/OperatorDetailPanel.tsx`.

Right now:
- `handleTruckDeviceEdit` updates the database, updates `status`, and updates `savedSnapshot.current`
- `handleTruckInfoEdit` updates the database and updates `savedSnapshot.current`, but it only updates `icaTruckInfo` locally
- The unsaved-changes guard compares `savedSnapshot.current.status` against `status`
- That means truck saves can still leave `status` and `savedSnapshot.current.status` out of sync, which re-triggers the modal when leaving the profile

I also found one more gap:
- `trailer_number` exists in the `TruckInfoCard` payload and is displayed in the UI
- but `handleTruckInfoEdit` currently does not include `trailer_number` in the `truckFields` object that gets persisted to onboarding status or synced to ICA

### Plan
1. Update `handleTruckInfoEdit` so truck saves also update the main `status` state with the same truck fields that were just saved.
2. Include `trailer_number` in the truck save payload so it persists consistently with the rest of the truck info.
3. Keep `icaTruckInfo` updates in place so the card display still refreshes immediately.
4. Verify the snapshot sync uses the exact same saved truck fields so the navigation guard sees no differences after a successful save.

### Files to update
- `src/pages/staff/OperatorDetailPanel.tsx`

### Expected result
After saving truck info for drivers like Giovanni Colon:
- the values should remain visible
- truck edits should persist consistently, including trailer number
- leaving the profile should no longer show the false “Unsaved Changes” modal after a successful save

### Technical detail
The implementation should make `handleTruckInfoEdit` behave more like the device save handler:
- build one `truckFields` object including:
  - `truck_year`
  - `truck_make`
  - `truck_model`
  - `truck_vin`
  - `truck_plate`
  - `truck_plate_state`
  - `trailer_number`
- persist that object
- apply that same object to:
  - `setStatus(...)`
  - `setIcaTruckInfo(...)`
  - `savedSnapshot.current.status`

That keeps all three sources aligned:
```text
database
  ↓
status state
  ↓
savedSnapshot.current.status
  ↓
unsaved-changes comparison stays clean
```
