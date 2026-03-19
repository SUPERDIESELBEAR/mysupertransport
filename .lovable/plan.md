
## Two-part change: collapse Compliance Summary by default + add a Compliance tab

### What's changing

**1. Default Compliance Summary to collapsed in PipelineDashboard**
- `src/pages/staff/PipelineDashboard.tsx` line 123: change `useState(true)` → `useState(false)` for `complianceExpanded`.

**2. Add a "Compliance" tab to the Staff Portal navigation**
- `src/pages/staff/StaffPortal.tsx`:
  - Add `'compliance'` to the `StaffView` type union (line 28).
  - Add a nav item `{ label: 'Compliance', icon: <ShieldCheck />, path: 'compliance', badge: criticalExpiryCount || undefined }` — the badge already exists and fits perfectly here; remove it from the Pipeline entry since it belongs on this dedicated tab.
  - Render `<InspectionComplianceSummary />` when `currentView === 'compliance'`, passing the existing `onOpenOperator`, `onOpenOperatorAtBinder`, and `onOpenInspectionBinder` handlers.
  - Import `InspectionComplianceSummary` and `ShieldCheck` (already imported from lucide).

### Navigation order
```text
Pipeline
Drivers
Messages
Compliance   ← new (badge = critical expiry count)
Inspection Binder
Doc Hub
Service Library
FAQ Manager
Resources
Notifications
```

### Badge move
The `criticalExpiryCount` badge currently sits on the **Pipeline** tab. Moving it to **Compliance** is more accurate — the count reflects CDL/Med Cert expiries, which is exactly what the Compliance tab contains. Pipeline will no longer show the red badge.

### Files changed
| File | Change |
|---|---|
| `src/pages/staff/PipelineDashboard.tsx` | `useState(false)` on line 123 |
| `src/pages/staff/StaffPortal.tsx` | Add `'compliance'` to type, new nav item, render block, import |
