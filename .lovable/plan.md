

## Vehicle Hub Enhancements — License Plates, Deactivated Units, and MO Plate Integration

### What's Changing

1. **License Plate columns on Fleet Roster table** — Add "Plate #" and "Plate State" columns to the Vehicle Hub roster, sourced from `onboarding_status` or `ica_contracts` (same fallback chain used elsewhere).

2. **Deactivated Units section** — Add an Active/Deactivated toggle at the top of the Vehicle Hub (following the same pattern as Archived Drivers). The deactivated view queries `operators` with `is_active = false` and shows the same table structure in a muted/dimmed style.

3. **License Plate in FleetDetailDrawer Truck Specs** — Display plate number and state in the read-only Truck Specs card. Make them editable alongside Year, Make, VIN, and Unit Number (saving to `onboarding_status`).

4. **MO Plate Registry integration** — When viewing an assigned MO plate, show the operator's truck license plate number alongside the driver name and unit number. This surfaces the truck's plate directly in the MO Plate Registry table rows for quick cross-reference.

5. **Search enhancements** — Include license plate number in the Vehicle Hub search filter so staff can search by plate.

### Technical Details

| File | Change |
|------|--------|
| `src/components/fleet/FleetRoster.tsx` | Add `truckPlate`, `truckPlateState`, `isActive` to `FleetRow`. Add Active/Deactivated toggle. Add Plate # column. Include plate in search filter. Fetch deactivated operators separately. |
| `src/components/fleet/FleetDetailDrawer.tsx` | Add `truck_plate`, `truck_plate_state` to the `onboarding_status` select. Display in Truck Specs card (read-only and edit mode). Include in `handleSaveSpecs`. |
| `src/components/mo-plates/MoPlateRegistry.tsx` | Enrich assigned plates with the operator's truck plate info by joining through `operator_id` on the open assignment → `onboarding_status`/`ica_contracts`. Show truck plate in the assigned plate row. |

### No database migration needed
The `onboarding_status` and `ica_contracts` tables already have `truck_plate` and `truck_plate_state` columns. No schema changes required.

