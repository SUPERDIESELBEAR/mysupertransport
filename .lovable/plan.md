## Two Inspection Binder bugs — root cause found

### Bug 1: Cab card upload fails (only for drivers with an assigned MO plate)
The `sync_irp_expiry_to_mo_plate` trigger fires on every insert/update of an "IRP Registration (cab card)" row. It runs this query:

```
SELECT plate_id FROM public.mo_plate_assignments
WHERE operator_id = ... AND event_type = 'assignment' AND returned_at IS NULL
ORDER BY created_at DESC LIMIT 1
```

`mo_plate_assignments` has **no `created_at` column** — the correct column is `assigned_at`. Reproduced on the database: the insert aborts with `ERROR: column "created_at" does not exist`. Delease has an active plate assignment, so every cab card upload for her hits this. Drivers without a current plate assignment skip the block early, which is why other people's uploads work. Inspection and Lease Agreement uploads work because the trigger name-guards to IRP only.

The frontend swallows the real error too: `throw dbRes.error` throws a Postgrest error object (not an `Error` instance), so `err instanceof Error` is false and staff see the generic "We couldn't upload that document" toast instead of the underlying message.

### Bug 2: Periodic DOT inspection date reverts on reload
`saveExpiry` writes the new date to `inspection_documents.expires_at`. On the next open, `syncInspectionBinderDateFromVehicleHub` runs and **overwrites the binder from `truck_dot_inspections.inspection_date`** ("Vehicle Hub wins"). Nothing writes the binder edit back to Vehicle Hub, so the date snaps back to the stale VH value every time. For Delease the newest VH row is `2026-07-13`, which is what she keeps seeing after re-entering the profile.

---

## Fix plan

**1. Repair the IRP → MO plate trigger (migration)**
- Redefine `sync_irp_expiry_to_mo_plate` replacing `ORDER BY created_at DESC` with `ORDER BY assigned_at DESC`. No other logic changes.

**2. Keep the binder's Periodic DOT date persistent (migration)**
- Add a trigger `trg_sync_dot_binder_to_vh` on `inspection_documents` (AFTER UPDATE OF `expires_at`) that, for `name = 'Periodic DOT Inspections'` + `scope = 'per_driver'`, updates the driver's most recent `truck_dot_inspections.inspection_date` to `NEW.expires_at` (falling back to inserting a new row if none exists).
- Guarded with `app.skip_dot_sync` (already used by the existing `sync_inspection_doc_to_dot` trigger) to prevent loops.
- Result: staff-edited binder date is now the value Vehicle Hub returns, so the auto-sync on next open confirms the date instead of reverting it.

**3. Surface real error messages (frontend, small)**
- In `src/components/inspection/OperatorBinderPanel.tsx` `handleUpload`/`handleStaffUpload`, and the equivalent handler in `src/components/inspection/InspectionBinderAdmin.tsx`, replace the `err instanceof Error ? err.message : '<generic>'` branch with a helper that also extracts `.message` from Postgrest-style error objects. Prevents future silent failures like this one.

### Files touched
- New migration: fix `sync_irp_expiry_to_mo_plate`; add `sync_dot_binder_to_vh` trigger + function.
- `src/components/inspection/OperatorBinderPanel.tsx`
- `src/components/inspection/InspectionBinderAdmin.tsx`

### Verification
- Re-run the failing insert as postgres to confirm the trigger no longer errors.
- Manually save a new inspection date on a driver's binder; reload the driver; confirm the date persists and the newest `truck_dot_inspections` row now reflects it.
