# Sync IRP Expiration: Driver Hub → MO Plate Registry

## Problem

The IRP Registration (cab card) expiration date lives in `inspection_documents` (name = `IRP Registration (cab card)`, scope = `per_driver`, keyed by `driver_id`). The MO Plate Registry stores its own `mo_plates.expires_at` on the plate row. These two fields are edited independently, so recently-uploaded IRP dates in Driver Hub never propagate to the plate row shown in MO Plate Registry.

There are also multiple entry points where a staff member can change the IRP expiry (staff `InspectionBinderAdmin`, operator `OperatorBinderPanel`, `DocRow` inline edit), so a client-side patch alone would be fragile.

## Fix — database-side sync + one-time backfill

Do this in a single migration so every existing and future edit stays consistent regardless of which UI wrote it.

### 1. Trigger on `inspection_documents`
- `AFTER INSERT OR UPDATE OF expires_at` on `public.inspection_documents`
- When `NEW.name = 'IRP Registration (cab card)'` and `NEW.scope = 'per_driver'` and `NEW.driver_id` is set:
  - Look up the driver's `operator_id` (`operators.user_id = NEW.driver_id`).
  - Find the current open plate assignment: `mo_plate_assignments` where `operator_id` matches, `event_type = 'assignment'`, `returned_at IS NULL`, most recent.
  - `UPDATE mo_plates SET expires_at = NEW.expires_at WHERE id = <assignment.plate_id>` (only when the value actually differs, to avoid trigger noise).
- `SECURITY DEFINER`, `SET search_path = public`.

### 2. One-time backfill in the same migration
For every currently-assigned plate whose driver has an IRP doc with a non-null `expires_at`, copy that date onto `mo_plates.expires_at`. This immediately fixes the reported symptom for the recently-uploaded IRPs.

### 3. Reverse direction — leave alone
Do not sync MO Plate Registry edits back into `inspection_documents`. Driver Hub / binder is the source of truth (the cab card PDF drives the date). This matches the pattern used by `syncInspectionBinderDateFromVehicleHub` (one-way, vehicle hub authoritative).

## Optional UI polish (small, same PR)

In `MoPlateRegistry.tsx` where the plate's expiration is shown, append a subtle "Synced from Driver Hub IRP" tooltip on rows where a current assignment exists, so staff understand where the date came from and don't try to edit it on the plate row. No functional change beyond the tooltip.

## What we are NOT changing

- No schema changes to `mo_plates` or `inspection_documents` columns.
- No changes to the plate assign/return flows.
- No changes to how expiration reminders are sent (they already read from `inspection_documents`).

## Verification

- Load MO Plate Registry after migration → recently-updated IRP dates now show on the assigned plates (backfill).
- Edit an IRP `expires_at` in Driver Hub (staff binder), refresh MO Plate Registry → plate row's expiration updates.
- Assign a plate to a different driver → next IRP edit updates the new plate, not the old one (trigger uses current open assignment).
