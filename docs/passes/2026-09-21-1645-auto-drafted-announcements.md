# 2026-09-21 16:45 — Auto-drafted announcements from each build

Plan approved by the owner: every staff-facing build writes a ready-made
announcement into his approval queue instead of him writing it by hand.

## What changed

1. **Standing build rule (memory, applies to every future build):** a pass that
   changes anything staff can see or use ends by inserting one
   `release_notes` row — status `pending`, `auto_drafted = true`, plain-language
   staff-facing title/body, category, staff-only target_roles, link_route,
   requires_ack, is_pinned. Nothing is sent on insert; the notify trigger only
   fires when the owner approves. Internal-only passes (security, plumbing,
   cron) write no draft and the report says so. Recorded at
   `mem://features/release-notes-auto-draft`, indexed.

2. **`auto_drafted` marker:** one additive line in the staged migration
   (`20260921170000_release_note_approval.sql`, section 2) —
   `ADD COLUMN IF NOT EXISTS auto_drafted boolean NOT NULL DEFAULT false`.
   Applies when the draft is accepted; undo line already covered by the
   migration header's column list. Queue shows a gold "Auto-drafted …" tag on
   pending rows (ReleaseNotesManager).

3. **Edit before approving (client only):** pending cards gain an Edit button
   (owner, or the author for his own submission) that loads the draft into the
   composer. "Save Changes" updates the same row and it stays pending; the
   owner also gets "Save & Approve" which updates then releases in one click —
   the review trigger still stamps reviewed_by/at and publishes. Deny and
   Archive remain owner-only (now explicitly gated per-button; the database
   gate was and is the real enforcement).

## Untouched

Approval trigger, audience targeting, pop-up, unread badge, Seen-by tracking,
email and bell behaviour. Drivers never see any of it. No new permissions,
tables, jobs, or emails.

## Verification

- Typecheck (`bunx tsgo --noEmit`): clean.
- `release-note-approval.test.ts`: 14/14, including three new checks
  (owner-or-author edit path, auto_drafted marker in migration + client).
- Full suite, `--maxWorkers=4`: 7 failed | 2067 passed | 16 skipped (2090),
  2 unhandled errors. Every failure is the known sandbox pooler timeout
  (`EAUTHQUERY auth_query secret check timed out`) on live-database tests —
  serial re-run of the noisiest file (accessorial-adjustment-schema) passes
  56/57 with the lone failure being the psql connection error itself. No
  product failure; the grant-parity harness item remains the owner's open
  decision.

## Files

- `.lovable/drafts/var_01m32a4twbexev1mjy249yke58/migrations/20260921170000_release_note_approval.sql` (one additive column)
- `src/lib/releaseNotes/types.ts` (`auto_drafted` on ReleaseNote + columns list)
- `src/components/management/ReleaseNotesManager.tsx` (edit-before-approve, Save & Approve, Auto-drafted tag, per-button owner gates)
- `src/test/release-note-approval.test.ts` (14 checks)
- `mem://features/release-notes-auto-draft` + index (the standing rule)

Note: the staged migration lands when the draft is accepted; until then the
`auto_drafted` column does not exist and the manager reads/writes go through
the notesDb layer as before.
