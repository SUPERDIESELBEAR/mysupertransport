

## Add Owner Test Accounts Section to Pipeline Dashboard

### What this does
Your two Marcus Mueller accounts will be separated from the regular applicant pipeline into their own collapsible section at the bottom of the dashboard, labeled **"Owner Test Accounts"**. They will remain fully functional — clickable, with full stage tracks and all the same controls — but will no longer appear in the main pipeline list, filters, or counts.

### How it works

**File: `src/pages/staff/PipelineDashboard.tsx`**

1. Define the two known owner user IDs as a constant set:
   - `5cca4f77-c4a9-4c4d-bcf7-f950965c1ffe` (primary account)
   - `7e356f94-ce4a-47aa-8883-0e6b01d09aab` (test account)

2. Exclude these from the main filtered list by adding `!OWNER_USER_IDS.has(op.user_id)` to the existing filter chain (same line that already excludes `on_hold` operators).

3. Add a new collapsible section **below the On Hold section**, styled similarly but with a distinct icon (e.g. `ShieldCheck`), that:
   - Filters operators to only those matching the owner user IDs
   - Shows the same row layout as the main pipeline (name, stage track, dispatch badge, etc.)
   - Rows are clickable and open the Operator Detail Panel as usual
   - Collapsed by default, with a header showing "Owner Test Accounts (2)"

### Files changed

| File | Change |
|------|--------|
| `src/pages/staff/PipelineDashboard.tsx` | Add owner user ID constant, exclude from main list, add collapsible "Owner Test Accounts" section |

