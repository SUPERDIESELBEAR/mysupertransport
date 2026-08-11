# Close the loop when an applicant returns their revisions

## What happens today

When staff request revisions (or a document retake), the application is reopened and the applicant gets a secure link. The applicant makes the fix and re-submits.

The problem: on re-submit the application is marked as submitted again, but its status is left on **REVISIONS_REQUESTED** instead of going back to **PENDING**. Because the review drawer only shows the Approve / Deny buttons for pending (or approved) applications, staff are stuck — there is no way to accept the correction and move the applicant forward. That is exactly the state Emma Mueller is in right now: her new medical certificate is uploaded and the application was re-submitted at 8:56 AM CT today, but the status never flipped.

## What to build

1. **Auto-return to review on re-submit.** When an applicant re-submits an application that was in the revisions state, put it back to **Pending** (keeping the record of the original status, so an application that was already approved before the correction still offers "Re-approve corrections" rather than a fresh invite).

2. **Fix the applications already stuck**, including Emma Mueller — move any application that was re-submitted after its revision request back to Pending so staff can act on it.

3. **Make the return visible.** In the review drawer, replace the "Awaiting applicant updates" panel with a "Corrections received on <date>" panel once the applicant has re-submitted, listing what was requested so staff can compare against the new upload before approving.

4. **Notify staff on return.** Send the same style of in-app notification (and email to the routed recruiting recipients) that a new application triggers, so a returned revision doesn't sit unnoticed.

5. **Safety net in the UI.** Show the action footer (Approve / Deny / Request revisions again) whenever an application has been submitted, not only when the stored status happens to be pending — so a status glitch can never again leave staff with no buttons.

## Result

Applicant fixes the document -> application returns to Pending automatically -> staff get notified -> staff review the new upload and either Approve (or Re-approve corrections) or request revisions again.

## Technical notes

- `submit_application_draft` uses `review_status = COALESCE(review_status, 'pending')`, which preserves `revisions_requested`. Change it to reset to `pending` when the current status is `revisions_requested`, preserving `pre_revision_status`.
- Data fix: `applications` where `review_status = 'revisions_requested'` and `submitted_at > revision_requested_at` and `is_draft = false`.
- UI: `ApplicationReviewDrawer.tsx` — resubmitted panel + widen the footer condition; `ManagementPortal.tsx` status filter counts follow automatically.
- Notification: reuse the `send-notification` `new_application` path with a `revision_resubmitted` variant.
