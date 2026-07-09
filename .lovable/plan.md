## Findings

### 1. Current query
The Overview's Compliance Summary (`src/components/inspection/InspectionComplianceSummary.tsx`) reads from the Postgres view `public.v_compliance_items`. The per-driver branch of that view is:

```sql
FROM operators o
JOIN applications a ON a.id = o.application_id
CROSS JOIN (VALUES ('CDL',...), ('Medical Certificate',...), ('IRP Registration (cab card)',...)) doc
LEFT JOIN inspection_documents d ON d.scope='per_driver' AND d.driver_id=o.user_id AND d.name=doc.name
WHERE o.is_active = true AND o.application_id IS NOT NULL
```

So today the only driver filter is: `operators.is_active = true` AND has an application. There is no insurance or Go-Live gate — every active operator surfaces, even mid-onboarding.

### 2. Fields that mark the two criteria
- **Active in Driver Hub** → `operators.is_active = true` (already used).
- **Insurance confirmed** → `onboarding_status.insurance_added_date IS NOT NULL` (the value staff set in Stage 7 Insurance; matches how the operator's own portal shows insurance as confirmed).
- **Go Live reached in the Applicant Pipeline** → `onboarding_status.go_live_date IS NOT NULL`. This is the single flag used everywhere else in the app to mark Stage — Go Live complete (see `OperatorDetailPanel.tsx` stage7 check and `OperatorPortal.tsx` go-live card).

There is no separate `go_live` boolean or pipeline_stage integer — the presence of `go_live_date` is the source of truth.

### 3. Impact on current data
Live counts on this project's database:

| Metric | Count |
|---|---|
| Active operators today | 58 |
| Active + `insurance_added_date` set | 39 |
| Active + `go_live_date` set | 39 |
| Active + BOTH set (would remain visible) | 39 |
| **Would be hidden by the new filter** | **19** |

No records are deleted or altered. Those 19 drivers keep every compliance document, expiry date, audit log entry, and driver-hub record intact — they simply do not appear in this Overview widget until Insurance is confirmed AND Go-Live date is set. They still show up in the full Compliance page, Driver Hub, and Pipeline as usual.

Fleet-wide rows (Insurance, IFTA) are unaffected — they aren't per driver.

## Proposed change (pending your approval)

Update `public.v_compliance_items` (via a Supabase migration) so the `drivers` CTE additionally joins `onboarding_status` and filters:

```sql
JOIN onboarding_status os ON os.operator_id = o.id
WHERE o.is_active = true
  AND o.application_id IS NOT NULL
  AND os.insurance_added_date IS NOT NULL
  AND os.go_live_date IS NOT NULL
```

No frontend changes required — the component reads the view as-is, so filtering at the view level automatically fixes the Overview widget everywhere it's rendered (Staff Portal, Pipeline Dashboard, Management Portal).

Awaiting your approval to proceed.
