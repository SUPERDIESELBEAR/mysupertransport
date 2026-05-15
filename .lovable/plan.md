## Problem

7 applicants are currently in `review_status = 'revisions_requested'` from the old flow (where the applicant had to log back in and edit everything themselves). The new staff-driven "Suggest Corrections" feature only renders for `pending` / `approved` apps, so staff can't use it on these.

The existing "Undo — sent in error" button restores `pre_revision_status`, but for 5 of the 7 that field is NULL (defaults to `approved`) and for 2 it's `approved` — none would land back in `pending`. So the existing Undo isn't the right tool here.

## Solution

Add a new staff action available on `revisions_requested` applications:

**"Move to pending & suggest corrections"** — converts the application back to pending, invalidates the old self-serve revision link, and immediately opens the new `SuggestCorrectionsModal` so staff can pick the specific fields to fix.

## What to build

### 1. New backend RPC `move_revisions_to_pending`
- Auth: staff only (`onboarding_staff` / `management` / `owner`).
- Input: `p_application_id uuid`.
- Effect:
  - Sets `review_status = 'pending'`
  - Clears `revision_requested_at`, `revision_request_message`, `pre_revision_status`
  - Marks all unused rows in `application_resume_tokens` for this app as used (`used_at = now()`) so the old email link stops working
  - Writes an `audit_log` entry: `action = 'application.revisions_moved_to_pending'` with `staff_id`, `staff_name`, applicant snapshot
- `SECURITY DEFINER`, `SET search_path = public`.

### 2. UI in `ApplicationReviewDrawer.tsx`
In the existing "Revisions requested" banner block (the one showing the "Undo — sent in error" link):

- Add a primary action button next to / below the existing Undo link:
  **"Move to pending & suggest corrections"**
- On click: call the new RPC, then on success:
  - Refetch the app so `review_status` flips to `pending`
  - Open `SuggestCorrectionsModal` automatically
  - Toast: "Moved to pending. Old revision link disabled."
- Keep the existing "Undo — sent in error" link unchanged for the rare case staff truly sent the request by mistake.

No new copy or schema beyond the RPC + audit entry.

### 3. No data migration
Existing 7 rows are left as-is; staff can process them one at a time using the new button.

## Out of scope
- Automatic bulk migration of the 7 applicants (manual review per app is safer).
- Changing the existing Undo flow.
- Letting staff invoke `SuggestCorrectionsModal` while the app is still in `revisions_requested` (we want a clean status transition first so the "pending" Action Footer + Suggest Corrections button render normally).

## Files

- New migration — `move_revisions_to_pending` RPC.
- `src/components/management/ApplicationReviewDrawer.tsx` — add the new button + handler in the revisions-requested banner.
