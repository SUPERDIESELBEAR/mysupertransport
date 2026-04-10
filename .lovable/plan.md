

## Exclude Deactivated/Archived Operators from Compliance Alerts

### Problem
The compliance alerts query in both `ComplianceAlertsPanel` and `InspectionComplianceSummary` fetches **all** operators with an `application_id`, regardless of their `is_active` status. Deactivated or archived operators still appear in expiration alerts, counts, and bulk actions.

### Fix
Add `.eq('is_active', true)` to the operators query in both components. This is a one-line addition in each file.

### Files changed

| File | Change |
|------|--------|
| `src/components/inspection/ComplianceAlertsPanel.tsx` | Add `.eq('is_active', true)` to the operators query (line ~73) |
| `src/components/inspection/InspectionComplianceSummary.tsx` | Add `.eq('is_active', true)` to the operators query (line ~100) |

This ensures only active operators appear in CDL/Med Cert expiration alerts, compliance counts, and bulk reminder/renewal actions across the Staff Portal Compliance tab and Driver Hub alerts panel.

