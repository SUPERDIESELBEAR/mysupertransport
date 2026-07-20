## Goal

Add a third ribbon to the Vehicle Hub unit drawer titled **"Registration and 2290"** with an **"Add Registration / 2290"** button. Each upload is tagged as either **Registration** or **Form 2290**, tracks an expiry date, and appears both in the Vehicle Hub ribbon and in the driver's Fleet Compliance → Driver Docs tab underneath the Lease Agreement group.

## User-facing behavior

1. **Vehicle Hub — new ribbon** (below "Repairs & Maintenance" in `FleetDetailDrawer`):
   - Header: **"Registration and 2290"** with an **"Add Registration / 2290"** outline button (Plus icon), matching the existing "Add Inspection" / "Add Record" styling.
   - Search box + table like the existing sections: columns **Type** (Registration / 2290), **Effective / Filed Date**, **Expires**, **Uploaded By**, **File**, **Actions** (view via in-app modal, delete).
   - Empty state: "No registration or 2290 records yet."

2. **Add modal** (`Registration2290Modal`):
   - Type selector (radio): **Registration** or **Form 2290**.
   - Date fields — Registration: `effective_date` + `expires_at`. 2290: `tax_period_start` + `expires_at` (defaults to next June 30).
   - File upload (PDF/JPG/PNG, max 10 MB) → uploads via `uploadToBucket` helper to `driver-documents/registration-2290/<driver_id>/…`.
   - On save: insert into `inspection_documents` with `scope='per_driver'`, `name='Registration'` or `'Form 2290'`, `shared_with_fleet=true`, and the chosen `expires_at`.

3. **Fleet Compliance — Driver Docs tab** (`InspectionBinderAdmin` / driver docs list):
   - Registration and 2290 documents automatically appear grouped **directly below "Lease Agreement"** because they are `per_driver` rows on `inspection_documents`.
   - Add the two new names to the per-driver required-doc list so they render with status dots (green when a non-expired file is present, red when missing/expired) alongside CDL, Med Cert, IRP, Lease Agreement.

4. **Fleet Compliance Summary cards** (`InspectionComplianceSummary` / `v_compliance_items`):
   - Registration and 2290 join CDL / Med Cert / IRP as tracked items with the same expiry-threshold color logic (green > 60d, amber ≤ 60d, red expired). Same MM/DD/YYYY layout using the existing `CertSubRow` (already fixed for whitespace).

## Technical outline

- **Migration**
  - Extend the per-driver required-doc seed (`pipeline_config` or the equivalent list used by `InspectionBinderAdmin`) to include `"Registration"` and `"Form 2290"`.
  - Update `v_compliance_items` view to include rows for `name IN ('Registration','Form 2290')` from `inspection_documents`, filtered to active + insured + Go-Live drivers (existing filter).
  - No new tables — reuses `inspection_documents` (`scope='per_driver'`, `driver_id`, `expires_at`).

- **Frontend**
  - `src/components/fleet/Registration2290Modal.tsx` — new modal (mirrors `MaintenanceRecordModal`).
  - `src/components/fleet/FleetDetailDrawer.tsx` — add state (`reg2290`, `reg2290ModalOpen`, `reg2290Search`), fetch via `.from('inspection_documents').eq('driver_id', driverId).in('name', ['Registration','Form 2290'])`, render section below Repairs & Maintenance, wire up delete + PreviewLink (in-app modal preview per existing rule).
  - `src/components/inspection/InspectionComplianceSummary.tsx` — extend the cert list rendered per driver to include Registration and 2290 subrows.
  - `src/components/inspection/InspectionBinderAdmin.tsx` — no change needed if it reads the required-doc list from `pipeline_config`; otherwise add the two names to the local list so they render in the Driver Docs tab under Lease Agreement.

- **Realtime / sync**
  - Existing `inspection_documents` realtime subscription in `PipelineDashboard` / `ManagementPortal` already covers the new rows — no additional channels required.
  - `sync_dot_binder_to_vh` trigger is scoped to CDL/Med Cert/IRP names; leave untouched.

## Out of scope

- No changes to operator/driver-facing upload UI (staff-only ribbon).
- No email reminders wired up in this pass (cert reminder engine can be extended later if desired).

## Files touched

- `supabase/migrations/<timestamp>_add_registration_2290_compliance.sql` (new)
- `src/components/fleet/Registration2290Modal.tsx` (new)
- `src/components/fleet/FleetDetailDrawer.tsx`
- `src/components/inspection/InspectionComplianceSummary.tsx`
- `src/components/inspection/InspectionBinderAdmin.tsx` (only if required-doc list is local)
