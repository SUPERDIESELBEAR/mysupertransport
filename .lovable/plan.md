

## Archive Applicants from On Hold Section

### Problem
When an applicant is placed On Hold and later needs to be fully removed from the Pipeline, there is no single action to do so. Deactivating them still leaves the `on_hold` flag set, so they remain visible in the On Hold section.

### Solution
Add an **"Archive"** button to each row in the On Hold section of the Pipeline Dashboard. This performs a multi-step cleanup that removes the applicant from the pipeline entirely, without deleting any records.

### Implementation

**File: `src/pages/staff/PipelineDashboard.tsx`**
- Add an "Archive" icon button (e.g. `ArchiveX`) to each operator row in the On Hold section
- Clicking it opens a confirmation dialog asking for a brief reason
- On confirm, the handler:
  1. Updates `operators` table: sets `on_hold = false`, `is_active = false`
  2. Updates `applications` table: sets `review_status = 'denied'` for the linked application
  3. Inserts an `audit_log` entry with action `applicant_archived` and metadata containing the reason plus original hold reason/date
  4. Shows a success toast confirming removal from the pipeline
- The operator will then appear only in the Archived Drivers view (already filtered by `is_active = false` in the Driver Hub)

**File: `src/pages/staff/OperatorDetailPanel.tsx`**
- No changes needed — the existing Deactivate button already handles reactivation if staff ever need to bring someone back

### What staff will see
- Each On Hold row gets a small archive button on the right side
- Clicking it shows: "Archive this applicant? They will be removed from the pipeline and moved to the Archived Drivers list. This does not delete any records."
- A reason field (optional) for context
- After archiving, the row disappears from On Hold immediately

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/PipelineDashboard.tsx` | Add Archive button + confirmation dialog to On Hold rows; handler clears hold, deactivates operator, denies application, logs to audit |

