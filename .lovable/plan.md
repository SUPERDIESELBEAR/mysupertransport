## Fix `move_revisions_to_pending` and rename action

### Problem
The previous fix still references `profiles.email`, which doesn't exist on that table. The toast shows `column "email" does not exist`.

### Plan

1. **Migration: rewrite `move_revisions_to_pending`**
   - Resolve actor name from `profiles` using only `first_name` / `last_name` joined on `user_id`.
   - Fallback chain: full name → `'Staff'` (no `email` column reference anywhere).
   - Keep all other behavior identical: validates `is_staff`, requires `review_status = 'revisions_requested'`, sets `review_status = 'pending'`, stamps `revisions_handled_by_staff_at` / `revisions_handled_by_staff_id`, invalidates resume token, inserts `application.revisions_moved_to_pending` audit-log row with actor name + id.

2. **UI: rename the button**
   - In `src/components/management/ApplicationReviewDrawer.tsx`, change the button label from "Move to pending & suggest corrections" to **"Move to pending for staff corrections"**.
   - No other UI/logic changes — the existing click handler already calls the RPC and refreshes the audit log.

### Verification
- Click "Move to pending for staff corrections" on Kenneth Woods' application.
- Confirm: no SQL error toast, status flips to `pending`, banner still reads "sent May 15, 2026 · now handled by staff", and a new `application.revisions_moved_to_pending` row appears in the revision audit log attributed to the signed-in staff member (e.g., "James Hill").
