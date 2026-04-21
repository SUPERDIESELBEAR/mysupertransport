

## What's wrong

The Operator Detail Panel has **two different save flows** for the Truck & Equipment card, and they don't agree:

1. **Main "Save Changes" button** (bottom of panel) — saves Stage 5 toggles (Decal Applied, ELD Installed, Fuel Card Issued) but **explicitly excludes** the four serial-number fields (line 1333 strips them out before the update).
2. **Pencil icon → "Edit Device Numbers" popover** inside the Truck & Equipment card — the *only* path that actually persists `eld_serial_number`, `dash_cam_number`, `bestpass_number`, `fuel_card_number`.

For Johnathan McMillan (`mcmill16@yahoo.com`), the database shows exactly that pattern: `eld_installed = yes`, `decal_applied = yes`, `fuel_card_issued = yes` all saved, but ELD / Dash Cam / BestPass serials are NULL. The Fuel Card # `"198"` only landed because it was also assigned through the Equipment Inventory module. Craig typed the ELD and Dash Cam serials, hit the panel's main Save, got a "Saved successfully" toast, and the serial fields were silently dropped.

## Fix — two parts

### Part 1 — Recover Johnathan's data (manual, immediate)

Ask Craig for the ELD and Dash Cam serial numbers he originally entered, then re-enter them through the **correct path**:

```text
Operator Detail Panel → Truck & Equipment card → ✏️ pencil icon
  → "Edit Device Numbers" popover → Save
```

That path triggers `handleTruckDeviceEdit`, which writes to `onboarding_status` *and* syncs to Equipment Inventory.

### Part 2 — Code change so this can't happen again

Make the panel's main **Save Changes** button persist device serial numbers too, so staff intuition matches behavior. Two reinforcing changes:

**A. Include device serial fields in the main save** (`src/pages/staff/OperatorDetailPanel.tsx`, ~line 1317-1346)

- Stop stripping `eld_serial_number`, `dash_cam_number`, `bestpass_number`, `fuel_card_number` from `updateData`.
- After the `onboarding_status` update succeeds, if any of the four serial values changed vs. `prev`, call the existing `syncAllDeviceFields(...)` helper so Equipment Inventory stays in sync (same call already used by `handleTruckDeviceEdit`).
- Keep the pencil-popover flow as-is — it remains the fast inline editor; both paths now do the same thing.

**B. Guardrail against the silent milestone**

Update the `equipmentReady` check (~line 1259) used to fire the "Equipment Setup Complete" milestone:

```ts
const equipmentReady =
  status.decal_applied === 'yes' &&
  status.eld_installed === 'yes' &&
  status.fuel_card_issued === 'yes' &&
  !!status.eld_serial_number &&
  !!status.dash_cam_number &&
  !!status.fuel_card_number;
```

This matches the existing `autoCollapse` rule on line 1047 and prevents marking equipment "complete" when serials are still missing — which is what hid the bug for Johnathan in the first place.

### Why this is safe

- The `syncAllDeviceFields` helper is already idempotent (no-op when old === new), already used by `handleTruckDeviceEdit`, and handles the duplicate-serial case.
- No schema change, no migration, no RLS change — the columns and policies already allow staff updates.
- Operator-side display (`TruckInfoCard` on the operator portal) keeps reading the same fields, so it benefits automatically.
- Equipment Inventory module is unchanged.

### After deploying

1. Tell Craig to reopen Johnathan McMillan and either:
   - re-type the serials in Stage 5 and click the main Save button (now works), **or**
   - use the ✏️ Edit Device Numbers popover (was always working).
2. Verify the chips appear in the Truck & Equipment card and that matching rows now exist in Equipment Inventory.
3. Going forward, both save paths persist the serials, and the "Equipment Setup Complete" milestone won't fire until serials are actually present.

