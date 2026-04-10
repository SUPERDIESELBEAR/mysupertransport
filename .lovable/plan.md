

## Fix CDL & Med Cert Dates: Use Inspection Binder as Source of Truth

### Problem
The Driver Hub roster, Compliance Alerts Panel, and Inspection Compliance Summary all pull CDL and Medical Certificate expiration dates from the `applications` table (data entered at application time). However, staff maintain and update these dates in the **Inspection Binder** (`inspection_documents` table). Many drivers have current dates in the binder but `NULL` in their application, causing "No Date" to display incorrectly.

### Solution
In all three components, add a query to `inspection_documents` for per-driver CDL and Medical Certificate entries, then prefer the binder date over the application date. This makes the Inspection Binder the authoritative source while keeping the application date as a fallback.

### Files changed

| File | Change |
|------|--------|
| `src/components/drivers/DriverRoster.tsx` | In `fetchDrivers`, add a query to `inspection_documents` for `CDL (Front)` and `Medical Certificate` entries scoped `per_driver`. Build a lookup map by `driver_id` (which is the operator's `user_id`). When mapping driver rows, use the binder date if available, falling back to the application date. |
| `src/components/inspection/ComplianceAlertsPanel.tsx` | In `fetchData`, add a parallel query to `inspection_documents` for per-driver CDL/Med Cert entries. When building alerts, prefer the binder expiration date over the application date. |
| `src/components/inspection/InspectionComplianceSummary.tsx` | In `fetchData`, add a parallel query to `inspection_documents` for per-driver CDL/Med Cert entries. When building per-operator rows, prefer the binder date. |

### How the lookup works

```text
inspection_documents query:
  SELECT driver_id, name, expires_at
  FROM inspection_documents
  WHERE scope = 'per_driver'
    AND name IN ('CDL (Front)', 'Medical Certificate')

Build map:  binderDates[driver_id] = { cdl: expires_at, med: expires_at }

Usage:      cdl_expiration = binderDates[op.user_id]?.cdl ?? app.cdl_expiration
            medical_cert_expiration = binderDates[op.user_id]?.med ?? app.medical_cert_expiration
```

This is a data-sourcing fix only — no UI or layout changes.

