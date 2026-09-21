# Technical details

## What changes

1. **Standing build rule (workflow, no code):** every BUILD MODE pass that changes staff-visible behaviour ends with one additional step — insert one row into `release_notes` with `status='pending'`, `submitted_by` = the build session's user, category/audience/link_route/requires_ack/is_pinned chosen from the change, body written in staff-facing plain language. Internal-only passes write no row and say so in the report.

2. **"Auto-drafted" marker (small client change):** the release-notes queue shows a subtle "Auto-drafted {date}" tag on pending rows so Marcus can tell a machine-written draft from a hand-submitted one. Implementation: the draft body is inserted by the build's own session, so the tag keys off `submitted_by` matching the build identity — or, if a distinct marker is preferred, one additive column `auto_drafted boolean not null default false` staged in a migration (applies when the draft is accepted).

3. **Queue tweaks (client only):** an **Edit before approving** path on pending rows — Marcus opens the composer pre-filled with the draft, changes any field, then Approves & Sends. (Today the queue only approves as-is.)

## What does not change

- The approval trigger (`aa_enforce_release_note_review`), the audience targeting, the pop-up, the unread badge, Seen-by tracking, email and bell behaviour — all untouched.
- Drivers still never see any of it.
- Hand-written submissions keep working exactly as before; auto-drafts are just another source of pending rows.

## Data / security

- Inserts use the existing `release_notes` INSERT policy (management/owner/staff writers). The build session writes as its authenticated user; the `release_note.approve` gate still means only the owner can move a draft to approved.
- No new permissions, no new tables. If the `auto_drafted` column is wanted, it is one additive line in a staged migration with the standard grants.
- No scheduled jobs, no email changes, nothing is sent automatically at any point.

## Verification

- After the rule is active, the next staff-facing build's report names the drafted announcement; the queue shows it pending with no bell/email sent.
- Approve as Marcus → staff get the pop-up + badge; deny → writer-reason path works on auto-drafts the same as hand-written ones.
- Typecheck + the release-note-approval test file re-run to confirm no regressions.
