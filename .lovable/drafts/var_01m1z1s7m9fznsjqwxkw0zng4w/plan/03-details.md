## Technical details

- `src/components/equipment/EquipmentInventory.tsx`: both `EquipmentRow` and `EquipmentCard` currently gate Return with `item.status === 'assigned' && !isFuelCard`. Add a fuel-card branch rendering an **Unassign** button (`RotateCcw`, status-complete styling) for `isFuelCard && item.status === 'assigned'`, wired to a new `unassignItem` state, next to the existing Deactivate. Leave non-fuel-card behaviour untouched.
- New `FuelCardUnassignModal.tsx`, modelled on `FuelCardDeactivateModal` (confirm step, optional notes, `guardDemo`, toast) but performing the `EquipmentReturnModal` write sequence with a fixed condition of `available`:
  1. `equipment_assignments`: set `returned_at = now()`, `return_condition = 'available'`, notes.
  2. `equipment_items`: `status = 'available'`.
  3. `onboarding_status.fuel_card_number = null` for the assignment's operator, via `updatePayload`.
  Every step's error is thrown, matching the loud-failure convention.
- No schema, RPC, or RLS change: `available` is already a valid `equipment_items` status and the return path already writes these columns.
- Fuel attribution is unaffected: `fuel_resolve_card(text, date)` matches by card plus assignment date range, so closing the 212 assignment today and opening 224 the same day leaves no gap or overlap.
- No behaviour change to ELD, dash cam, or BestPass returns, and Deactivate keeps its archive semantics.
