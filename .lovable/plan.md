
## Problem Summary

IRP Registration (cab card) is unique per truck/driver — each operator has their own cab card issued to their specific vehicle. Currently it sits in `COMPANY_WIDE_DOCS`, meaning one single file is uploaded for the whole fleet. It needs to move to `PER_DRIVER_DOCS` so each driver has their own slot, with their own file, expiry date, and reminders.

The label also needs updating from `'IRP Registration'` → `'IRP Registration (cab card)'` everywhere.

---

## What changes

### 1. `InspectionBinderTypes.ts`
- Move `{ key: 'IRP Registration (cab card)', hasExpiry: true }` out of `COMPANY_WIDE_DOCS` and into `PER_DRIVER_DOCS`.
- Update the `DocName` type union accordingly.

### 2. `InspectionComplianceSummary.tsx`
- The `DocKey` type, `DOC_BADGE`, `DOC_DISPLAY`, `INSPECTION_NAMES` maps, the `.in('name', [...])` query, and the company-wide doc loop — all currently reference `'IRP Registration'` as a fleet-wide document.
- IRP will now be fetched as a **per-driver** `inspection_documents` row (scope `per_driver`), exactly like CDL and Med Cert already are.
- Update the query: remove `'IRP Registration'` from the company-wide `.in('name', [...])` fetch and add it to the per-driver fetch logic instead.
- Update `DOC_DISPLAY` label to `'IRP Registration (cab card)'` (or keep the internal key as the old value and update display only — but since the DB name changes, the key must also change).

### 3. `InspectionBinderAdmin.tsx`
- The admin binder renders `COMPANY_WIDE_DOCS` for the Company tab and `PER_DRIVER_DOCS` for the Driver tab. Since the type arrays change in step 1, the correct tab will pick it up automatically.
- No structural changes needed here beyond the type file update.

### 4. `OperatorBinderPanel.tsx` & `OperatorInspectionBinder.tsx`
- Both render `PER_DRIVER_DOCS` directly — once the type file is updated, IRP (cab card) will appear in the "My Documents" / "Driver Docs" section automatically.
- No structural changes needed.

### 5. `check-inspection-expiry` edge function
- Update `ALERT_DOCS` set: rename `"IRP Registration"` → `"IRP Registration (cab card)"`.
- IRP is already handled in the per-driver loop (the function already fetches both company-wide and per-driver docs by name). Remove it from the company-wide processing path since it will now only exist as `per_driver` scope.

### 6. Database — existing data migration note
Any existing `inspection_documents` rows with `name = 'IRP Registration'` and `scope = 'company_wide'` will become orphaned (no UI slot will render them). A migration will rename those rows to `'IRP Registration (cab card)'` and update their scope to `per_driver`. Since cab cards are per-driver/truck, these rows will also need a `driver_id` — without one they can't be matched. The migration will update the name/scope but leave `driver_id` null; staff will re-upload per-driver IRP docs for each operator going forward. A migration SQL statement handles this cleanly.

---

## Files to change

| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderTypes.ts` | Move IRP to `PER_DRIVER_DOCS`, rename label |
| `src/components/inspection/InspectionComplianceSummary.tsx` | Update DocKey type, display map, query (fetch IRP as per-driver not company-wide) |
| `supabase/functions/check-inspection-expiry/index.ts` | Rename string in `ALERT_DOCS`, ensure IRP is handled in per-driver path only |
| DB migration | Rename existing IRP rows to new label, change scope to `per_driver` |

`InspectionBinderAdmin.tsx`, `OperatorBinderPanel.tsx`, and `OperatorInspectionBinder.tsx` require no changes — they all consume `PER_DRIVER_DOCS` / `COMPANY_WIDE_DOCS` by reference.
