# Equipment Auto-Populate Asset Sheet

## Goal
When staff assigns an ELD, Dash Cam, BestPass, or Fuel Card to a driver — from either the Onboarding Stage 5 fields or the Onboard Systems (Inventory) page — the item auto-populates the driver's Equipment Asset Sheet. Both surfaces stay in sync (one entry only), duplicate serials are blocked, and each auto-filled row must be verified by staff before the sheet can be signed/finalized.

## Behavior

### 1. Single source of truth — bi-directional sync
Today, `EquipmentAssignModal` already writes `serial_number` to the matching `onboarding_status` column (`eld_serial_number`, `dash_cam_number`, `bestpass_number`, `fuel_card_number`), and Stage 5 inline edits already flow the other way via `equipmentSync.ts`. Confirm both paths and close remaining gaps so a single assignment (from either surface) populates:
- `onboarding_status.<device>_number` (drives the Asset Sheet row)
- `equipment_items.status = 'assigned'` + open row in `equipment_assignments` (drives the Inventory page)
- Assignment metadata: `assigned_at`, `assigned_by`

Result: staff only ever enters equipment in one place; the Asset Sheet row for that line appears automatically with serial + assignment date + assigned-by name.

### 2. Duplicate serial guard (Block + warn)
Before any assignment commits — from `EquipmentAssignModal` (Inventory) and from Stage 5 inline serial edits (`syncDeviceToInventory`):
- Look up any existing active assignment for the same serial + device type where `returned_at IS NULL` and the holder's operator is still active.
- If found on a *different* driver → abort the write and show a red toast/modal: "Serial {number} is already assigned to {Driver Name}. Return or deactivate it from that driver before reassigning." No override.
- If the item exists in inventory but is `status = 'lost'` or `'deactivated'` → also block with a clear reason.
- Enforced twice: client-side check for a friendly message, plus a Postgres partial unique index for safety:
  `CREATE UNIQUE INDEX one_active_assignment_per_item ON equipment_assignments(equipment_id) WHERE returned_at IS NULL;`

### 3. Per-item Verified checkbox on the Asset Sheet
Add a "Verified by staff" checkbox to each of the four equipment rows (ELD, Dash Cam, BestPass, Fuel Card) in `EquipmentAssetSheet.tsx`:
- Unverified rows show a small amber "Unverified" badge next to the serial.
- Checking the box stamps `<line>_verified_at` and `<line>_verified_by` and swaps the badge to a green "Verified — {name}, {date}" chip.
- Unchecking re-opens the row (staff-only, audit-logged).
- **Finalize gate:** the "Execute / Sign" button on the Asset Sheet stays disabled until every assigned line is Verified. Not-Assigned lines don't require verification.
- Driver view is read-only (badge shown, checkbox hidden).

### 4. Small UX touches
- Auto-filled rows display a subtle "Auto-filled from Inventory" hint under the serial until verified.
- Assignment date and Assigned-by are shown inline (already stored on `equipment_assignments`).
- Editing a serial on a verified row clears its Verified stamp and re-locks Execute.

## Technical details

**Migration**
- Add columns to `onboarding_status`: `eld_verified_at timestamptz`, `eld_verified_by uuid`, and the same pair for `dash_cam`, `bestpass`, `fuel_card`.
- Add partial unique index on `equipment_assignments(equipment_id) WHERE returned_at IS NULL`.
- No new tables → no new GRANT/RLS blocks needed.

**Files touched**
- `supabase/migrations/<new>.sql` — columns + index.
- `src/lib/equipmentSync.ts` — pre-flight duplicate check, surface a typed error the callers can toast.
- `src/components/equipment/EquipmentAssignModal.tsx` — call the duplicate check before insert; show blocking error dialog with current holder's name.
- `src/pages/staff/OperatorDetailPanel.tsx` (Stage 5 inline edits) — same guard on serial change.
- `src/components/equipment/EquipmentAssetSheet.tsx` — render Verified checkbox + badge per line, wire `<line>_verified_at/by` writes, block Execute button until all assigned lines verified, show "Auto-filled" hint and assignment metadata.
- `src/integrations/supabase/types.ts` — regenerated after migration.

**Out of scope**
- Decal row stays as-is (no serial number).
- No changes to Truck / MO Plate cards.
- No bulk "Confirm all" button (per-item was chosen).
