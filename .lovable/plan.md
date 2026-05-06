## Goal

Allow staff to send an already-approved application back to the driver for corrections, even after onboarding has started. The driver keeps full access to all 8 onboarding stages while fixing the application in parallel. When they resubmit, staff must re-approve before the application is locked again.

## Current behavior

- "Request Revisions" only appears for applications in `pending` review status.
- Once staff hits **Approve & Invite**, the application becomes `approved` and the action footer disappears.
- The applicant becomes an operator and starts the 8 stages — there's no way back to the form.

## What changes

### 1. Staff UI — Application Review Drawer
- Show a **Request Revisions** button for approved applications too (not just pending).
- Reuse the existing confirmation modal + mandatory message field.
- Add a small note in the confirm dialog: *"The driver will keep full access to their onboarding stages while making corrections."*
- The existing "Revisions requested" banner already handles display — extend it to also render when the prior status was `approved`.

### 2. Edge function — `request-application-revisions`
- Remove the implicit assumption that the app is `pending`.
- When the current status is `approved`:
  - Set `is_draft = true`, `review_status = 'revisions_requested'`, clear `submitted_at`.
  - Store the previous status (`approved`) in a new column `pre_revision_status` so we know whether to restore onboarding access on re-approval (it's already active — nothing to restore, but we use this to skip the "create operator/invite" step).
  - Send the same revision email with the secure resume link.
- Do **not** touch the `operators` row, ICA, or any onboarding data — onboarding stays fully active.

### 3. Applicant flow
- Resume link works the same: opens the form with the staff's revision message banner.
- On resubmit, application returns to `review_status = 'pending'` (or a new `resubmitted` value) and `is_draft = false`.

### 4. Re-approval — Application Review Drawer
- For a resubmitted app where `pre_revision_status = 'approved'`:
  - The Approve button label becomes **Re-approve corrections** instead of **Approve & Invite**.
  - Clicking it sets `review_status = 'approved'`, clears `pre_revision_status`, and **skips** the operator-creation / invite-email side effects (operator already exists).
  - Existing approval path runs unchanged for first-time approvals.

### 5. Pipeline visibility
- The existing **Revisions** filter tab on the Management Portal already surfaces `revisions_requested` apps — no change needed beyond confirming approved-then-revising apps appear there.
- On the operator/staff onboarding pipeline, add a small "Application revisions pending" pill next to the driver's name when their app is `revisions_requested` so staff can tell at a glance.

## Database changes

```sql
ALTER TABLE applications
  ADD COLUMN pre_revision_status review_status;
```

That's the only schema change. Re-uses existing `revision_*` columns and `application_resume_tokens` flow.

## Files touched

- `supabase/functions/request-application-revisions/index.ts` — allow `approved` source status, set `pre_revision_status`.
- `src/components/management/ApplicationReviewDrawer.tsx` — show Request Revisions for approved apps; differentiate Approve vs Re-approve button.
- `src/pages/management/ManagementPortal.tsx` / `PipelineDashboard.tsx` — small pill indicator for in-onboarding drivers with pending revisions.
- New migration adding `pre_revision_status`.

## Out of scope

- Pausing or locking onboarding stages (you chose to allow both in parallel).
- Notifying the operator inside the PWA — the email with the resume link is the trigger.
