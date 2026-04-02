

## Fix: Back Button Label — Dynamic Based on Source

### Problem
The back button in `OperatorDetailPanel` is hardcoded to say "Pipeline". When opened from Driver Hub, it should say "Driver Hub" instead.

### Changes

**1. `src/pages/staff/OperatorDetailPanel.tsx`**
- Add optional prop `backLabel?: string` to `OperatorDetailPanelProps` (default: `"Pipeline"`)
- Replace the hardcoded `"Pipeline"` text on line 1771 with `{backLabel ?? 'Pipeline'}`

**2. `src/components/drivers/DriverHubView.tsx`**
- Pass `backLabel="Driver Hub"` to `<OperatorDetailPanel>` on line 244

All other callers (StaffPortal, ManagementPortal) continue to default to "Pipeline" with no changes needed.

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add `backLabel` prop; use it in back button |
| `src/components/drivers/DriverHubView.tsx` | Pass `backLabel="Driver Hub"` |

