## What's there today

In Vehicle Hub (`FleetRoster`), the `+` button on each truck row/card opens **Log Update**, which offers three choices: Repair / Maintenance, DOT Inspection, Quick Note. Registration / 2290 upload only exists inside the driver's detail drawer (`FleetDetailDrawer` → "Registration and 2290" card → `Registration2290Modal`), so staff must open the card first.

## Recommendation

Add **Registration / 2290** as a fourth tile in the Log Update chooser. It matches the existing pattern (Log Update is already the "quick action from the roster" hub), reuses `Registration2290Modal` unchanged, and requires no new UI surface. Alternatives considered and not recommended: a separate roster icon (button clutter — the row already has edit, photos, decals, `+`), or a bulk uploader (different problem, worth its own pass later).

## Changes

**1. `src/components/fleet/FleetRoster.tsx`**
- Add `driverUserId: string | null` to the `FleetRow` interface.
- Include `user_id` in the `operators` select inside `buildRows` and map it onto each row.
- Pass `driverUserId={logUpdateTarget.driverUserId}` into `LogUpdateModal`.

**2. `src/components/fleet/LogUpdateModal.tsx`**
- Accept a new optional `driverUserId: string | null` prop.
- Add mode `'reg2290'` and a fourth tile ("Registration / 2290" — file-badge icon, subtext "Upload a new registration or Form 2290 with its expiration date.").
- When that mode is active, render `Registration2290Modal` with the same `open`/`onClose`/`onSaved` wiring used for the maintenance and inspection sub-modals.
- If `driverUserId` is null (driver has no linked account), show the tile disabled with a short hint rather than opening a modal that can't save.

**3. No changes** to `Registration2290Modal`, `FleetDetailDrawer`, or the database — the drawer's existing entry point stays as-is, and saving from either place writes the same `inspection_documents` row and refreshes the roster via `onSaved`.

## Notes

The 2290 modal replaces any existing row for that driver + document type, so uploading from the roster keeps "latest = source of truth" exactly as it does from the drawer.
