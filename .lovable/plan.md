## Goal
When a staff member clicks **Archive** on an operator in the On-Hold list, the comment field should pre-fill with **only the raw on-hold reason text**. The "On Hold since..." prefix and date wrapper should be removed entirely.

## Scope
Single file: `src/pages/staff/PipelineDashboard.tsx`

## Changes
1. **Archive trigger `onClick` (around line 3628)**
   - Remove the `dateStr` calculation and the conditional prefix logic.
   - Set `prefill` to `op.on_hold_reason?.trim() ?? ''`.
   - `setArchiveReason(prefill)` remains.

2. **No other changes**
   - Staff can still edit/append in the textarea.
   - `handleArchiveFromHold` already writes `archiveReason` into `audit_log.metadata.reason`, which the Archived Drivers profile reads and allows editing. This carry-over behavior is unchanged.

## Acceptance
- Clicking Archive on an operator with reason `"Did not complete background check"` pre-fills the comment with exactly that text.
- Operators with no on-hold reason show an empty comment field.
- The archived profile later displays the same comment, editable by staff.