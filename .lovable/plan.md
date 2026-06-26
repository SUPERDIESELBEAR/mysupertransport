# Vehicle Hub + Pipeline Stage 5 Enhancements

Three coordinated changes in `src/components/fleet/FleetRoster.tsx`, a new logging modal, the Stage 5 section in `src/pages/staff/OperatorDetailPanel.tsx` / `src/components/operator/OperatorDocumentUpload.tsx`, and one DB migration for an extensible decal-photos array.

---

## a) Vehicle Hub — "Log Update" button on each card

**UI changes (`FleetRoster.tsx` card + table footer):**
- Keep existing `Edit` button (structural specs).
- Add a new outline-style button `+ Log Update` next to it. Card layout becomes a two-button footer (`Edit` ghost-outline + `Log Update` outline w/ Plus icon).
- In table view: add a second small icon button (Plus) in the Edit column.

**New component: `src/components/fleet/LogUpdateModal.tsx`**

Single modal with tab selector (matches existing modal patterns like `QuickTruckEditModal`):

1. **Repair / Maintenance tab** — writes to existing `truck_maintenance_records`
   - amount, service_date, vendor (optional), description, category dropdown
   - Reuses logic from `MaintenanceRecordModal.tsx` (extract shared form if cleanest, otherwise call its insert path).
2. **Inspection tab** — writes to existing `truck_dot_inspections`
   - inspection_type (DOT / Annual / Roadside / Other), inspection_date, result (pass/fail/notes), next_due_date, notes
   - Reuses `DOTInspectionModal.tsx` form fields.
3. **Quick Note tab** — writes a row to `truck_maintenance_records` with category `note` and `amount = 0` so it surfaces in history without needing a new table.

On save → toast + call `onSaved()` to refetch the roster (refreshes repair cost + DOT badge).

---

## b) Vehicle Hub — Additional fields on each card

**Equipment serials** (ELD / Dash Cam / BestPass / Fuel Card):
- Source: `equipment_assignments` joined to `equipment_items` filtered by `operator_id` and `returned_at IS NULL`, grouped by `device_type`.
- Extend `buildRows()` in `FleetRoster.tsx` to fetch active assignments for each operator and attach `eldSerial`, `dashCamSerial`, `bestPassNumber`, `fuelCardNumber` to `FleetRow`.
- Display in card as a compact 2-col grid row under VIN (label + monospaced value, "—" if unassigned). In table view, add an expandable detail or skip (already wide); keep equipment info card-only.

**Truck photo gallery on card:**
- Source: `operator_documents` rows where `document_type = 'truck_photos'` for the operator (Stage 2 uploads).
- Show up to 4 small (40x40) thumbnails in a horizontal strip with a `+N` chip if more, plus a small "View all" link.
- Clicking opens the existing `TruckPhotoGridModal` (already in `src/components/staff/`).
- Also append decal photos from Stage 5 into the same gallery (visually grouped: "Truck Photos" + "Decal Photos" sections in the modal).

---

## c) Pipeline Stage 5 — Decal photo uploads (extensible) + Vehicle Hub sync

**Current state:** DS/PS decal slots already exist via `onboarding_status.decal_photo_ds_url` / `decal_photo_ps_url`, uploaded from the driver portal. Staff side (`OperatorDetailPanel.tsx`) only views them.

**Changes:**

1. **DB migration** — add `decal_photos jsonb default '[]'::jsonb` to `onboarding_status` for extra angles beyond DS/PS. Each entry: `{ url, label, uploaded_at, uploaded_by }`. Keep DS/PS columns intact for backwards compatibility (treated as the first two required slots).

2. **Stage 5 staff section in `OperatorDetailPanel.tsx`:**
   - Convert the read-only decal viewer (~line 5320) into an editable gallery with staff upload buttons for DS and PS (mirroring driver upload logic, writing to `truck-photos` bucket and updating the same columns).
   - Add an "Add Angle" button that uploads to storage and appends to `decal_photos` jsonb (with optional label like "Front", "Rear", "Hood").
   - Each extra photo gets remove + relabel controls (staff-only).

3. **Driver portal `OperatorDocumentUpload.tsx`** — same "Add another angle" affordance under the existing DS/PS slots, so drivers can also add extras.

4. **Vehicle Hub sync** — `FleetRoster.buildRows()` already pulls `onboarding_status`; extend the select to include `decal_photo_ds_url`, `decal_photo_ps_url`, `decal_photos` and surface them in the card gallery as described in (b). No duplicate upload needed.

---

## Technical notes

- Storage: reuse the existing `truck-photos` bucket (or whichever bucket the current decal upload uses — confirmed `decal_photos/` path under operator folder).
- All DB writes follow the loud-failure pattern (throw on Supabase errors) and strip managed columns.
- Refetch strategy: pass `onSaved` callbacks through the new modal so `FleetRoster.fetchFleet()` reruns after a log entry; Stage 5 changes trigger the existing OperatorDetailPanel refresh.
- Real-time: `onboarding_status` is already on the realtime publication, so a Stage 5 decal upload will reflect in Vehicle Hub on the next refetch (we don't need a subscription on the roster).

## Files touched

- `src/components/fleet/FleetRoster.tsx` — new button, equipment fetch, photo strip
- `src/components/fleet/LogUpdateModal.tsx` — **new**
- `src/components/fleet/MaintenanceRecordModal.tsx` / `DOTInspectionModal.tsx` — extract or reuse form bodies
- `src/components/staff/TruckPhotoGridModal.tsx` — accept combined truck + decal photo lists
- `src/pages/staff/OperatorDetailPanel.tsx` — Stage 5 staff upload + extra-angles UI
- `src/components/operator/OperatorDocumentUpload.tsx` — extra-angles UI in driver portal
- One migration adding `onboarding_status.decal_photos jsonb`

Ready to implement on approval.
