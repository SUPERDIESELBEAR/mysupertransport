## Goal

Undo the accidental "request revisions" sent to Tyler Walls (`tylerwalls87@icloud.com`, application `7ef1d5c9-7954-480b-a59d-4dad44706156`). His application should go back to its prior **approved** state, and the resume link in his inbox should stop working so he can't accidentally reopen the form.

## Current state

- `review_status` = `revisions_requested`
- `pre_revision_status` = `approved` (this is what it was before the mistake)
- `revision_count` = 1
- `revision_requested_at` = 2026-05-15 11:18 UTC
- `revision_request_message` = the test message
- An unused `application_resume_tokens` row exists for him

## Plan

### 1. Restore the application row

Update `applications` where `id = 7ef1d5c9-7954-480b-a59d-4dad44706156`:

- `review_status` ← `approved` (from `pre_revision_status`)
- `pre_revision_status` ← `NULL`
- `revision_requested_at` ← `NULL`
- `revision_requested_by` ← `NULL`
- `revision_request_message` ← `NULL`
- `revision_count` ← `0` (since the only increment was this mistake)

### 2. Invalidate the emailed resume link

Mark all unused `application_resume_tokens` rows for this application as used (`used_at = now()`) so the link in his inbox returns "invalid/expired" if he clicks it.

### 3. Audit trail

Insert an `audit_log` entry: action `revision_request_reverted`, entity_type `application`, entity_id = his application id, entity_label = "Tyler Walls", with metadata noting it was a mistaken send.

### 4. Verify

Re-read the applications row and the resume tokens row to confirm the revert and that no token is still consumable. No email is sent — he simply ignores the original message.

## Out of scope

- No changes to `request-application-revisions` logic. The Email Log panel + admin resender already covers future cases; this is a one-off data fix.
- Not contacting Tyler from the app — if you want a courtesy "ignore that email" note, send it manually or tell me and I'll add a step.

## What I need from you

Approve and I'll run the two data updates + audit log insert, then confirm the final state.
