## Goal

When a driver's **decal photos** or **truck photos** are uploaded in any one place (driver-app onboarding, staff editor, vehicle hub), they should automatically appear everywhere they're viewed: Dispatch Board decal icon, Vehicle Hub decal viewer, and Vehicle Hub truck-photo gallery. No manual re-upload, no drift.

## What I found

All three viewers already read from the same source of truth on `onboarding_status`:

- Decal photos → `decal_photo_ds_url`, `decal_photo_ps_url`, `decal_photos` (jsonb of extra angles)
- Truck photos → `truck_photo_front_url`, `truck_photo_back_url`, `truck_photo_ds_url`, `truck_photo_ps_url`, `truck_photos_extra` (jsonb)

Both dispatch and vehicle-hub components resolve those paths through the existing `resolveDecalUrl` / truck-photo helpers, so the wiring is fine. The problem is that some uploads land in storage but the follow-up `UPDATE onboarding_status` never persists — so the file exists but the column stays `NULL`, and every downstream view shows nothing.

Confirmed drift today:
- **13** operators have decal files in `operator-documents/{op}/decal_photos/`; only **11** have the URL columns populated. Two drivers (e.g. Matthew Clovis `aa76…0520`) have photos in storage but disabled icons everywhere.
- The same class of drift exists for truck photos in `operator-documents/{op}/truck_photos/` — I'll audit exact counts as part of the migration.

## Fix (three parts, applied to both decal and truck photos)

### 1. One-time backfill migration

For every operator whose `operator-documents/{op}/decal_photos/` or `truck_photos/` folder contains files but whose matching columns are `NULL`, populate them from the newest object of each side/angle. Store the bare storage path — resolvers already re-sign at read time. Extra files beyond the named slots get appended into the corresponding jsonb array so nothing is dropped.

Rows that already have values are left alone.

### 2. Auto-sync trigger going forward

Add an `AFTER INSERT` trigger on `storage.objects` scoped to `bucket_id = 'operator-documents'` that:

- On `<uuid>/decal_photos/(ds|ps)_...` → upserts the path into the matching `decal_photo_*_url`.
- On any other `<uuid>/decal_photos/...` → appends into `decal_photos` jsonb.
- On `<uuid>/truck_photos/(front|back|ds|ps)_...` → upserts the path into the matching `truck_photo_*_url`.
- On any other `<uuid>/truck_photos/...` → appends into `truck_photos_extra` jsonb.

`SECURITY DEFINER`, with a session flag so the update bypasses the operator whitelist guard. Realtime subscriptions on `onboarding_status` already re-render Dispatch and Vehicle Hub, so the icon flips on without a manual refresh.

### 3. Harden the uploaders (small client change)

In `OperatorDocumentUpload.tsx` and `StaffDecalPhotoEditor.tsx` (and the truck-photo equivalents), verify the `onboarding_status` update succeeded and surface a toast on failure instead of swallowing it. Prevents future silent drift while the trigger above catches anything that still slips through.

## Verification

- Re-run the audit query: 0 operators where storage has decal or truck files but columns are null.
- Matthew Clovis (`aa76…0520`) and the second known driver show enabled decal icons on Dispatch and photos in the Vehicle Hub decal viewer.
- Upload a new truck photo via the driver app on a fresh operator → the Vehicle Hub gallery updates without a page refresh (trigger + existing realtime).
- Same test for a new decal upload → Dispatch icon enables automatically.

## Technical details

- Migration: backfill CTEs selecting latest object per side/angle per operator from `storage.objects`, `UPDATE onboarding_status` conditionally.
- Trigger function: `public.sync_photos_from_storage()`, one function branching on the folder name. Guarded by regex on `NEW.name`.
- No changes to Dispatch board wiring, `DecalPhotoViewerModal`, truck-photo viewer, `FleetRoster`, or `OperatorDetailPanel` — they already consume the same columns.
- No RLS or grant changes; trigger runs as definer.
