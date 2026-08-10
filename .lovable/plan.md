# Move Unit Number into the Edit Truck dropdown

The Truck & Equipment card in the Onboarding Pipeline currently has two edit buttons: "Edit Truck" (year, VIN, plate, plate state, trailer) and "Edit Unit #" — which now holds only the unit number, since device serials moved to Onboard Systems.

## What changes

- Unit Number becomes the first field inside the **Edit Truck** popover, above Year.
- The separate **Edit Unit #** button and its popover are removed, leaving one edit entry point on the card.
- Display sections stay as they are: Unit Number still shows in the device section, serials stay read-only with the "managed in Onboard Systems" note.
- Saving the truck popover writes the unit number and truck fields together with a single confirmation.

## Technical details

- `src/components/operator/TruckInfoCard.tsx`
  - Add `unit_number` to `TruckFieldsEditPayload` and to the `truckDraft` initial state, re-sync effect, and open handler (sourced from `deviceInfo?.unit_number`).
  - Render a Unit Number input at the top of the Edit Truck popover.
  - Delete the device popover block, the `draft` state, `handleOpenEdit`, `handleSave`, the `onEdit` prop, and the `TruckInfoCardEditPayload` export.
- `src/pages/staff/OperatorDetailPanel.tsx`
  - Remove `handleTruckDeviceEdit` and the `onEdit` prop on `<TruckInfoCard>`.
  - In `handleTruckInfoEdit`, write `unit_number` to the onboarding record alongside the truck specs save, and update local status/snapshot state so the main Save button doesn't see a phantom change.
- The driver-side usage in `OperatorPortal.tsx` passes no edit props, so it is unaffected.

## Verify

Open a driver in the Onboarding Pipeline, click Edit Truck, change the unit number and a truck field, save, and confirm both persist after reload and that no second edit button remains.