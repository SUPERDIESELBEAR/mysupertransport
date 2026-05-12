## What's happening today

**Editing/deleting an inspection:** There is no UI for it. The `DOT Periodic Inspections` history list in the Vehicle Hub drawer (`FleetDetailDrawer.tsx`) only renders rows with a "view certificate" eye icon — no pencil, no trash. The `DOTInspectionModal.tsx` is add-only. So the accidental 5/20/2026 row for Unit 219 cannot be removed from the UI right now; it can only be deleted with a backend data fix.

**How Vehicle Hub syncs to the driver's binder** (`src/lib/syncInspectionBinderDate.ts`):

```text
truck_dot_inspections (Vehicle Hub)
        │  latest row by inspection_date DESC LIMIT 1
        ▼
inspection_documents row
  where scope = 'per_driver'
    and driver_id = <operator user_id>
    and name = 'Periodic DOT Inspections'
        │  writes vhDate into expires_at
        ▼
Driver's "Periodic DOT Inspections" binder doc
  (expires_at column stores the inspection date here)
```

Key points:
- Vehicle Hub is the **source of truth**. The binder always mirrors the **latest** `inspection_date` for that operator's truck.
- Sync runs whenever `syncInspectionBinderDateFromVehicleHub(driverUserId)` is called (binder open / inspection saved). It overwrites the binder if the dates differ.
- That's why the binder still shows **3/15/2026**: this driver's binder hasn't been re-synced since the 5/20/2026 row was added. The next time it syncs, the binder will jump to **5/20/2026** — unless we delete the bad row first.

## Plan

### 1. Add Edit + Delete to each inspection history row
In `src/components/fleet/FleetDetailDrawer.tsx`, in the history `.map(...)` block, add two icon buttons next to the existing eye icon (staff only, gated by `!readOnly`):

- **Edit** (Pencil icon) → opens `DOTInspectionModal` in edit mode, pre-filled with the row's values.
- **Delete** (Trash icon) → confirm dialog ("Delete this inspection record? This cannot be undone."), then `DELETE FROM truck_dot_inspections WHERE id = ?`.

After save/delete:
- Refresh `dotInspections` state.
- Call `syncInspectionBinderDateFromVehicleHub(operator.user_id)` so the binder immediately reflects the new latest record (or the prior one, after a delete).
- Toast confirmation.

### 2. Extend `DOTInspectionModal` to support edit mode
Accept an optional `existingInspection` prop. When present:
- Pre-fill all fields (inspection date, inspector, location, result, interval, certificate).
- On submit, run `UPDATE` instead of `INSERT`.
- Title becomes "Edit DOT Inspection".

### 3. Permissions / RLS
Confirm `truck_dot_inspections` already has staff `UPDATE` and `DELETE` policies. If `DELETE` is missing, add a migration granting it to `is_staff(auth.uid())`. (I'll verify before writing code.)

### 4. Immediate one-off cleanup for Unit 219
Separately from the feature, delete the 5/20/2026 row directly via the data tool so the user's current symptom is resolved without waiting on the new UI. After deletion, the green countdown card will revert to 3/15/2026, matching the binder. **I'll ask for confirmation before running the delete.**

### 5. Optional polish (carry-over from prior plan)
Relabel the green countdown card header "Latest inspection" so it's clear it reflects the most recent record, not a reminder date.

## Technical notes

- Files touched: `FleetDetailDrawer.tsx`, `DOTInspectionModal.tsx`, possibly one short migration for a DELETE RLS policy.
- No schema changes beyond a possible RLS policy addition.
- Sync helper is already idempotent and is the right hook to call after edit/delete.
