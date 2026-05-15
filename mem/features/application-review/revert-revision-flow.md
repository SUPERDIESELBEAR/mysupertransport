---
name: Revert revision request flow
description: Staff can undo a mistakenly-sent "request revisions" via Undo button in the revisions banner of ApplicationReviewDrawer
type: feature
---
Affordance: "Undo — sent in error" link inside the `revisions_requested` banner in `src/components/management/ApplicationReviewDrawer.tsx`. Opens `RevertRevisionModal` which calls edge function `revert-application-revisions`.

The edge function:
- Auth: any staff role (onboarding_staff, dispatcher, management, owner)
- Restores `review_status` from `pre_revision_status` (defaults to `approved`)
- Clears `pre_revision_status`, `revision_requested_at/by`, `revision_request_message`
- Decrements `revision_count` (floor 0)
- Marks all unused `application_resume_tokens` as `used_at = now()`
- Writes `audit_log` action `revision_request_reverted`
- Optionally sends a "please disregard" courtesy email (off by default in modal)

Use this instead of one-off DB fixes when staff mis-send a revision request.