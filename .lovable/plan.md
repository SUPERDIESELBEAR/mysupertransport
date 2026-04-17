

Let me first understand the current structure. The Inspection Binder has company-wide docs defined in `InspectionBinderTypes.ts`:
- Hazmat (company_wide)
- Overweight/Oversize Permits (company_wide)

User wants these hidden by default from the company-wide binder view, but available as opt-in per-driver overrides for the rare case a specific driver hauls hazmat or oversize loads.

Let me look at how this would work cleanly.

## Plan: Hide Hazmat & Overweight/Oversize from Inspection Binder

### What changes
Mark **Hazmat** and **Overweight/Oversize Permits** as "hidden by default" company-wide. They disappear from:
- Operator Inspection Binder (main view + flipbook)
- Inspection Compliance Summary / Alerts
- Staff/Management Inspection Binder admin (Company tab)
- Inspection share page

They remain available to **opt in per driver** via a new toggle in the Per-Driver tab — "Add Hazmat" / "Add Overweight/Oversize" — for the rare case a specific driver needs them.

### How it works

**1. Schema flag — minimal addition**
Add one boolean column to a new lightweight table:
```
driver_optional_docs (driver_id uuid, doc_name text, enabled bool, primary key (driver_id, doc_name))
```
- Empty by default → driver does NOT see Hazmat or Oversize
- Staff toggles row on for a specific driver → that driver's binder shows the slot

**2. Constants update**
In `src/components/inspection/InspectionBinderTypes.ts`:
- Tag Hazmat and Overweight/Oversize with `optional: true`
- Add a helper `isOptionalCompanyDoc(name)` and `getVisibleCompanyDocs(enabledOptionalDocs)`

**3. Filter at every read site**
Components that loop over `COMPANY_WIDE_DOCS` get filtered through the helper:

| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderTypes.ts` | Add `optional` flag + helpers |
| `src/components/inspection/OperatorInspectionBinder.tsx` | Filter company docs by driver's opt-in list |
| `src/components/inspection/OperatorBinderPanel.tsx` | Same filter |
| `src/components/inspection/InspectionBinderAdmin.tsx` | Hide optional docs in Company tab; add per-driver toggle UI in Per-Driver tab header: "Optional add-ons: ☐ Hazmat  ☐ Overweight/Oversize" |
| `src/components/inspection/InspectionComplianceSummary.tsx` | Skip optional docs unless any driver opts in |
| `src/components/inspection/ComplianceAlertsPanel.tsx` | Same — don't alert on docs no one needs |
| `src/pages/InspectionSharePage.tsx` | Filter the public share view too |
| `src/hooks/useBinderOrder.ts` | Exclude optional docs from default order; include only when opted in |

**4. Migration**
- Create `driver_optional_docs` table with RLS (staff manage; drivers read own)
- No data migration needed — empty table = current behavior preserved (hidden everywhere)

### UI for the per-driver toggle
In the admin Per-Driver tab, above the existing per-driver doc list when a driver is selected:

```
┌─ Optional Add-ons (this driver only) ─────────┐
│  ☐ Hazmat Permit                              │
│  ☐ Overweight / Oversize Permit               │
└───────────────────────────────────────────────┘
```
Toggling on inserts the row + that driver's Hazmat/Oversize slot appears in their binder, compliance alerts, and flipbook. Toggling off removes the slot but does NOT delete an existing uploaded file (kept on the server, just hidden — re-enable to restore).

### Why this design
- **Zero impact on existing fleet**: defaults match user's reality (no hazmat / no oversize)
- **Per-driver granularity**: matches the requested "specific driver only" workflow
- **Reversible**: toggling off doesn't destroy files; toggling on restores
- **Safe placeholder**: data model ready when needs change, but UI stays clean today

### Out of scope
- Removing Hazmat/Oversize from the existing uploaded data (none has been uploaded based on schema review — and we don't delete it even if it had been)
- Making other company docs optional (only the two requested)

