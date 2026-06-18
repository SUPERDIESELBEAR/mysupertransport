## Problem

The previous fix targeted `OperatorDetailPanel.tsx`'s Deactivate dialog, but the user is archiving from the **Pipeline Dashboard** On-Hold list, which uses a separate "Archive this applicant?" `AlertDialog` in `src/pages/staff/PipelineDashboard.tsx`. That dialog opens with an empty `archiveReason`, so the on-hold reason and "since" date shown next to the name are not carried into the comment field.

## Fix

In `src/pages/staff/PipelineDashboard.tsx`:

1. **Line ~3628** — On the archive trigger button's `onClick`, replace `setArchiveReason('')` with a pre-fill derived from the operator's on-hold context:
   - If `op.on_hold_reason` exists and `op.on_hold_date` exists → `"On Hold since {Mon D, YYYY}: {reason}"`
   - If only reason → `"On Hold: {reason}"`
   - If only date → `"On Hold since {Mon D, YYYY}"`
   - If neither → `""` (preserve current behavior)
   - Date formatting uses the same `format(parseISO(op.on_hold_date), 'MMM d, yyyy')` already imported and used on line 3604 for consistency.

2. **Line ~3727** — The dialog's `onOpenChange` reset currently sets `archiveReason` to `''` on close. Keep that as-is so the next open reseeds fresh from the then-current `archiveTarget`.

No changes to `handleArchiveFromHold` are needed — it already writes `archiveReason` into `audit_log.metadata.reason` (line 1280), which is what the Archived Drivers profile reads and allows editing. So the pre-filled (and optionally appended) text carries over to the archived profile automatically.

No database, RLS, or `ArchivedDriversView` changes required.