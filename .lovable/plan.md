
## Goal

For **Fuel Cards only**:
- Replace the "Return" action with "Deactivate" (no return-condition choice — a deactivated card is retired).
- Allow deactivating both assigned and unassigned cards.
- Show an **Unassigned Inventory** subsection and an **Archived / Deactivated** subsection inside the Fuel Card group.
- Rename the "avail" label to "Available" across the Equipment Inventory summary.

Other device types (ELD, Dash Cam, BestPass) are unchanged — they keep the existing Return → Good / Damaged / Lost flow.

## Changes

### 1. Database (schema-only migration)

Add a new value to the `equipment_items.status` domain:

- If `status` is a Postgres `CHECK` constraint, drop and re-add it to include `'deactivated'`.
- If `status` is a native enum, `ALTER TYPE ... ADD VALUE 'deactivated'`.
- Do the same for `equipment_assignments.return_condition` so we can record `'deactivated'` as the closing reason when an assigned fuel card is retired.

No data backfill needed — existing rows keep their current status.

### 2. `EquipmentInventory.tsx`

- Add `'deactivated'` to the `EquipmentStatus` type and to `STATUS_CONFIG` (muted gray badge, `Archive` icon, label "Deactivated").
- Rename per-type summary text from `"{n} avail · {n} assigned"` to `"{n} Available · {n} Assigned"`.
- Rename group-header text from `"{n} avail"` to `"{n} Available"`.
- Add a Fuel Card–only rendering block **inside** the Fuel Card group card (only when `type === 'fuel_card'`), splitting `typeItems` into three ordered subsections, each with a small subtitle header:
  1. **Assigned** — cards currently issued to a driver.
  2. **Unassigned Inventory** — status `available`, not attached to any driver.
  3. **Deactivated** — status `deactivated` (archived list).
  Other device types render exactly as today (single flat list).
- Add `'deactivated'` as a chip in the status filter row so staff can filter to just archived cards.

### 3. Deactivate action (Fuel Card only)

- In `EquipmentRow` and `EquipmentCard`, when `item.device_type === 'fuel_card'`:
  - Replace the "Return" button (shown for `assigned` cards today) with a **Deactivate** button.
  - Also show the **Deactivate** button for `available` (unassigned) fuel cards, so unused inventory can be retired.
  - Hide the button entirely for cards already in `deactivated` status.
- Non–fuel-card rows keep the existing Assign / Return buttons unchanged.

### 4. New `FuelCardDeactivateModal.tsx`

Small dedicated confirm dialog (does not reuse the multi-condition Return modal):

- Header: "Deactivate Fuel Card".
- Body: shows card serial, current assignee (if any), a short warning ("This card will be archived and can no longer be assigned."), and an optional notes textarea.
- On confirm:
  - If the card is currently assigned: close the open row in `equipment_assignments` (`returned_at = now()`, `return_condition = 'deactivated'`, notes), and clear `onboarding_status.fuel_card_number` for that operator (same clearing logic the Return modal uses today).
  - Update `equipment_items.status = 'deactivated'`.
  - Toast "Fuel card deactivated".
- Respect `useDemoMode().guardDemo()` and show `DemoLockIcon`, matching the Return modal patterns.

### 5. `EquipmentReturnModal.tsx`

No functional change — it stays the Return flow for ELD / Dash Cam / BestPass. We just stop opening it for fuel cards.

## Out of scope

- No changes to ELD, Dash Cam, or BestPass behavior.
- No change to history/audit — deactivation is naturally captured by the closed assignment row + status change.
- No renaming of the top-level "Equipment" section (parked from earlier discussion).

## Technical notes

- File touch list: `supabase/migrations/<new>.sql`, `src/components/equipment/EquipmentInventory.tsx`, `src/components/equipment/FuelCardDeactivateModal.tsx` (new). `EquipmentReturnModal.tsx` untouched.
- `STATUS_CONFIG.deactivated` styling: `bg-muted text-muted-foreground border-border` with an `Archive` lucide icon, to visually distinguish "retired" from "available".
- Filter/search logic already keys off `item.status`, so adding `'deactivated'` flows through the existing filter chip and search bar with no extra work beyond adding the chip.
