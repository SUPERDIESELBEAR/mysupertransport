## Goal
The Onboard Systems Assignment Sheet (OSAS) card should not appear inside a driver's Onboarding Pipeline (staff Operator Detail Panel). It should live only under the **Onboard Systems** menu, where staff already create/manage sheets via `CreateSignOffSheetModal` + `SignOffSheetList` and where shipment receipts are tracked.

## Change

**`src/pages/staff/OperatorDetailPanel.tsx`**
- Remove the `<EquipmentAssetSheet mode="management" ... />` block (lines ~3685–3693) from the pipeline view, including its `isQuickView` order wrapper.
- Remove the now-unused `import EquipmentAssetSheet from '@/components/equipment/EquipmentAssetSheet'` (line 26).
- If the surrounding equipment shipping/props (e.g. `equipmentShipping`) become unused only because of this removal, drop them too — otherwise leave untouched (Truck Info card above still uses them).

## Not changing
- `EquipmentAssetSheet.tsx` component stays (still used inside Onboard Systems flows and history).
- Driver portal OSAS surfaces (`PendingOSASCard`, `OperatorOSASSign`) stay.
- `EquipmentInventory.tsx` (Onboard Systems menu) — unchanged; remains the sole home for sending/managing OSAS.

## Verification
- Typecheck.
- Open a driver's onboarding pipeline: OSAS card should be gone; other stages intact.
- Open Onboard Systems menu: Create Sign-off Sheet + Sheet list still work.
