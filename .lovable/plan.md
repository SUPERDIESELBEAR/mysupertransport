# Switch DOT Inspection Binder to Inspection Date + computed Next DOT Due

## What changes

### 1. Inspection Binder ("Periodic DOT Inspections" row only)
- Relabel the date field from **"Expires"** / **"Set expiry date"** to **"Inspection Date"** / **"Set inspection date"**.
- The badge text changes from `Expires Jun 17, 2026` → `Inspected Jun 17, 2025`.
- Replace the colored expiry badge (Expired / Expiring Soon / Valid) with a neutral "Inspected" badge for this row only — expiry is no longer derived here. All other binder docs (CDL, Med Cert, IFTA, etc.) keep their existing expiry behavior unchanged.
- The underlying column stays `expires_at` (no schema change), but for this single doc name it now stores the **inspection date**.

### 2. Vehicle Hub (Fleet Detail Drawer)
- The DOT Inspection card already shows `Next DOT Due` using `truck_dot_inspections.next_due_date`. We will additionally:
  - Show the **Inspection Date** prominently next to Next DOT Due.
  - When no `truck_dot_inspections` record exists for an operator but a `Periodic DOT Inspections` binder doc does, fall back to that binder date and compute Next DOT Due as `inspection_date + fleet default reminder interval`.
- Allowed intervals stay 90 / 180 / 270 / 360 days (the modal already exposes these). No interval logic changes.

### 3. One-time data rollback for existing records
Every current `inspection_documents` row with `name = 'Periodic DOT Inspections'` was entered as `inspection_date + 365 days`. We will run a one-time data update:

```
UPDATE inspection_documents
SET expires_at = expires_at - INTERVAL '365 days'
WHERE name = 'Periodic DOT Inspections'
  AND expires_at IS NOT NULL;
```

So `Expires 6/17/2026` becomes `Inspection Date 6/17/2025`, exactly as in your example. ~34 rows affected.

### 4. Compliance alerts
The "Periodic DOT Inspections" binder doc will be **excluded** from the Compliance Alerts panel and Driver Hub expiry chips, since the date no longer represents an expiry. DOT-due alerts continue to come from `truck_dot_inspections.next_due_date` in the Vehicle Hub (existing behavior).

## Technical notes

**Files touched**
- `src/components/inspection/InspectionBinderAdmin.tsx` — conditional label/badge for `name === 'Periodic DOT Inspections'`; skip expiry-tier coloring for this row.
- `src/components/inspection/OperatorBinderPanel.tsx` — same conditional relabel on operator-facing view.
- `src/components/inspection/DocRow.tsx` — accept an `isInspectionDate` flag (or branch on doc name) to swap badge text/color.
- `src/components/inspection/ComplianceAlertsPanel.tsx` & `src/components/drivers/DriverRoster.tsx` — exclude `Periodic DOT Inspections` from expiry tier calculations.
- `src/components/fleet/FleetDetailDrawer.tsx` — render Inspection Date alongside Next DOT Due; add fallback that reads the binder doc + fleet default interval when no `truck_dot_inspections` record exists.
- One-time `UPDATE` migration (data only) to subtract 365 days from existing `Periodic DOT Inspections` rows.

**No schema changes.** We are reinterpreting the existing `expires_at` value for this single doc name. The Vehicle Hub remains the source of truth for the actual "next due" calculation via `truck_dot_inspections`.

## Open question (non-blocking)
When both a `truck_dot_inspections` record and a binder `Periodic DOT Inspections` doc exist for the same operator and they disagree on the inspection date, the **Vehicle Hub record wins** (it has explicit interval, inspector, certificate, etc.). Confirm this priority or tell me to flip it.
