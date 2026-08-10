# Onboard Systems as the single source of truth for devices

## The problem today

Device serials live in two places and both can write to the other:

- **Stage 5 / Driver Hub** ("Edit Devices" on the truck card) writes the four serial fields on the driver's onboarding record, then pushes them into inventory.
- **Onboard Systems** (Assign / Return / Fuel Card Deactivate) writes the assignment, then back-fills or clears the same onboarding field.

The guardrails are not symmetric. The Stage 5 path blocks a serial that is already assigned elsewhere, lost, or deactivated; the Onboard Systems path does not run the same check before overwriting the onboarding field. Stage 5 also strips dashes and uppercases the serial before saving, while the inventory path stores whatever was typed. Clearing a serial field in Stage 5 silently returns the device to inventory with no prompt.

A check of live data confirms the drift:

- 22 device slots have a number on the onboarding record with no matching open assignment in inventory
- 3 open assignments exist with the onboarding field blank
- 2 genuine serial mismatches
- 12 values contain dashes, which is the main cause of false mismatch warnings

## What changes

### 1. One entry point

Device adds and changes happen only in Onboard Systems. In Stage 5 and on the Driver Hub truck card, the four device fields (ELD, Dash Camera, BestPass, Fuel Card) become read-only displays showing the current inventory value, each with a "Manage in Onboard Systems" link that jumps to that driver. Unit number, truck fields, and the yes/no checklist items in Stage 5 stay editable as they are.

### 2. No dashes, ever

Serials are normalized on entry everywhere: uppercase, dashes and spaces and dots removed. The assign/add forms reject a typed dash with an inline message ("Serial numbers cannot contain dashes") rather than silently rewriting it. Comparison between inventory and onboarding uses the normalized value.

### 3. Auto-heal existing data

A one-time backfill makes inventory the winner:

- Where an open assignment exists, the onboarding field is overwritten with the normalized inventory serial (fixes the 2 mismatches and the 3 blanks).
- Where the onboarding record has a number and no assignment exists, an inventory item is created and assigned to that driver so nothing is lost (covers the 22 orphans).
- All stored serials are normalized to dash-free uppercase.

After the backfill the two sides are identical, so the amber mismatch warnings in the By Driver view go quiet and now mean a real problem rather than formatting noise.

### 4. Confirm before releasing a device

Any action in Onboard Systems that ends an assignment (return, deactivate, reassign to another driver) shows a confirmation first: "This will return <serial> to inventory as Available and clear it from <driver>'s record. Continue?" Nothing is written until confirmed. The silent-clear path disappears along with the editable Stage 5 fields.

### 5. Keep the duplicate guard, apply it both ways

The existing "already assigned / lost / deactivated" block moves into the shared sync helper so the assign modal enforces it too, and the error message keeps the same plain-English wording it uses now.

## Technical details

- `src/lib/equipmentSync.ts`: export a `normalizeSerial()` used by every write and comparison; move the `DuplicateAssignmentError` checks into a shared `assertAssignable()` called by both `syncDeviceToInventory` and `EquipmentAssignModal`.
- `src/pages/staff/OperatorDetailPanel.tsx`: the four device serial inputs in Stage 5 become read-only text plus a link; drop the `syncAllDeviceFields` call from the save path (no longer a write source). `src/components/operator/TruckInfoCard.tsx`: remove the serial fields from the edit drawer, keep the display rows.
- `src/components/equipment/EquipmentAssignModal.tsx` / `EquipmentReturnModal.tsx` / `FuelCardDeactivateModal.tsx`: normalize on input, reject dashes, add the release confirmation step, and keep the existing onboarding back-fill (now the only writer).
- Backfill runs as a one-time data update against `equipment_items`, `equipment_assignments`, and `onboarding_status`; no schema change is required.
- `EquipmentByDriver.tsx` keeps its mismatch flag as a safety net, comparing normalized values.

## Verify

After the backfill, By Driver should show zero amber warning icons and zero "onboarding record only" notes. Assigning an already-assigned serial should be blocked with the holder's name. Stage 5 should show the device numbers but offer no way to type over them.