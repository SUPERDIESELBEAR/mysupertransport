## Goal

Build a self-serve "Revert revision request" flow so any staff member can undo a mistakenly-sent "request revisions" email — instead of needing me or a direct DB write (like we just did for Tyler Walls).

## UX

In `ApplicationReviewDrawer.tsx`, inside the existing `revisions_requested` banner (line 1055), add a small **"Undo — was sent in error"** button (ghost link style, right-aligned).

Clicking it opens a confirmation modal (`RevertRevisionModal.tsx`) that shows everything the user needs to verify before pulling the trigger:

```text
Undo revision request

Applicant:        Tyler Walls
                  tylerwalls87@icloud.com

Sent:             May 15, 2026 at 6:18 AM CT
                  by Marcus Mueller

Message that
was emailed:      "Test send from Lovable agent: please verify..."

This will:
 ✓ Restore status to: Approved
 ✓ Invalidate 1 unused resume link in their inbox
 ✓ Reset revision count from 1 → 0
 ✓ Write an audit log entry

[ ] Also email the applicant a short "please disregard" note
                  (default OFF — most cases you'll just text them)

⚠ The applicant should be told to ignore the original email.
   The link in their inbox will stop working immediately.

                       [ Cancel ]   [ Confirm undo ]
```

After confirm: drawer refreshes, banner disappears, status badge flips back to Approved/Pending, toast confirms.

## Permissions

Allowed for **any staff** (`onboarding_staff`, `dispatcher`, `management`, `owner`) — same level as the original "Request Revisions" action. Rationale: whoever can send it should be able to unsend it.

## Technical pieces

### 1. New edge function `revert-application-revisions`

`supabase/functions/revert-application-revisions/index.ts`

- Auth: `getClaims(token)` from header (per project pattern), then check `is_staff` via DB query with `.limit(1)`.
- Body: `{ applicationId: string, sendCourtesyEmail?: boolean }` (Zod-validated).
- Loads application; rejects with 400 if `review_status !== 'revisions_requested'`.
- Computes pre-state for response payload (count of unused tokens, restored status).
- Atomic ops:
  - `UPDATE applications` → set `review_status = COALESCE(pre_revision_status, 'approved')`, clear `pre_revision_status`, `revision_requested_at`, `revision_requested_by`, `revision_request_message`; decrement `revision_count` (floor 0).
  - `UPDATE application_resume_tokens` → `used_at = now()` where `application_id = X AND used_at IS NULL`. Capture row count.
  - `INSERT audit_log` → action `revision_request_reverted`, actor = caller, metadata `{ restored_status, invalidated_tokens, courtesy_email_sent }`.
- If `sendCourtesyEmail`: enqueue via existing email queue (template name `application_revision_reverted_courtesy` — short body: "We mistakenly sent a request for revisions. Please disregard the previous email — no action needed."). If queueing fails, **don't** roll back the revert; just log and return `courtesy_email_sent: false` with a warning so the modal can show "couldn't send courtesy email — message them manually".
- Returns `{ ok: true, restoredStatus, invalidatedTokens, courtesyEmailSent }`.

### 2. New email template row

Insert one row in `email_templates` with `milestone_key = application_revision_reverted_courtesy`, subject "Please disregard our last email", short body. Editable later in the Email Catalog.

### 3. Frontend

- `src/components/management/RevertRevisionModal.tsx` (new)
  - Props: `application`, `open`, `onOpenChange`, `onSuccess`
  - Pre-loads unused token count via a quick `select count(*)` so the modal can show the exact number.
  - Calls `supabase.functions.invoke('revert-application-revisions', { body })`.
- `ApplicationReviewDrawer.tsx`
  - Add `[Undo — was sent in error]` button in the revisions banner.
  - Wire it to open the modal; on success, refetch the application and close.

### 4. Memory

After build, append a short leaf `mem://features/application-review/revert-revision-flow.md` and reference it from index, so future sessions know this affordance exists.

## Out of scope

- No bulk "revert all" tooling. One-off only.
- No change to `request-application-revisions` itself.
- The Email Log panel automatically picks up the courtesy email entry when sent — no extra wiring.

## What you'll get

A clearly-labeled undo path that staff can run themselves for the next "oops, sent that to the wrong person" moment, with full visibility into what gets touched before they confirm.

## What I need from you

Approve and I'll build it end-to-end (migration for the email template, edge function, modal, drawer wiring, deploy, and test).
