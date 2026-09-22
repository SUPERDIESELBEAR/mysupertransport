# Owner alert for a pending announcement (2026-09-21 17:55 UTC)

BUILD MODE, draft pass. The trigger is STAGED, not applied. Nothing in this pass
ran DDL and nothing mailed a real person.

## What existed before

`release_notes` rows arrive with `status = 'pending'` (auto-drafted by each
staff-facing build, or submitted by management). `notify_staff_on_release_note`
fires only on the transition into `approved`. A pending row therefore notified
**nobody**, including the owner: the only way to find it was to open
Settings → What's New. The gold count on that menu entry counts *unread
published* announcements, not pending ones.

## What this pass builds

### Staged migration
`.lovable/drafts/var_01m32gk4s5e59vb0a11jbzd2tr/migrations/20260921180000_notify_owner_pending_release_note.sql`
— additive only, undo in the header.

`notify_owner_on_pending_release_note()` — SECURITY DEFINER, `search_path` pinned
to `public, extensions`, EXECUTE revoked from PUBLIC, `anon`, `authenticated`.
Two triggers: AFTER INSERT `WHEN (NEW.status = 'pending')`, and
AFTER UPDATE OF status `WHEN (NEW.status = 'pending' AND OLD.status <> 'pending')`.
For every user holding `owner` it inserts one `notifications` row —
type `release_note_pending`, channel `in_app`, link `/dashboard?view=whats-new`,
title `New update ready to review — <title>`, body the first 300 characters —
honouring an explicit `notification_preferences` opt-out for that event type.
No `net.http_post`: the pending path is in-app only, so no staff member learns
anything about a draft before approval.

### Client
- `src/lib/notifications/taxonomy.ts` — `release_note_pending`, tier `action`,
  category `system`, label "Update Awaiting Approval". Registered before anything
  writes the type; an unregistered type renders as a bare "Notification".
- `src/components/NotificationBell.tsx` — gold megaphone icon for the new type;
  routing falls through to the row's own `link`.
- `src/hooks/useUnreadReleaseNotes.ts` — returns `pendingCount`, a head count of
  `status = 'pending'`, read only for viewers holding `owner` or `management`
  (the SELECT policy already hides pending rows from everyone else).
- `src/pages/management/ManagementPortal.tsx` — a second, outlined gold count on
  the Settings → What's New entry for announcements waiting for approval, beside
  the existing solid unread count.

## Untouched

The approval gate (`enforce_release_note_review`), audience targeting,
`notify_staff_on_release_note`, `WhatsNewDialog`, read receipts, permissions, and
driver visibility (none) are unchanged. Nothing is auto-approved and nothing is
sent on a timer.

## Verification

- `src/test/release-note-approval.test.ts` extended by six checks: the pending
  triggers and their WHEN clauses, owner-role-only targeting, no email on the
  pending path, pinned `search_path` plus the anon/authenticated revokes, the
  taxonomy registration, and the menu count. 20 tests, all passing.
- Also repaired in that file: `MIGRATION` pointed at the accepted draft's deleted
  folder, so the whole file errored on collection. It now reads the applied
  `drizzle/migrations/0021_release_note_approval.sql`.
- Typecheck clean (`bunx tsgo --noEmit -p tsconfig.json`).
- Full suite, `--maxWorkers=4`, verbatim:

```
 Test Files  6 failed | 203 passed | 2 skipped (211)
      Tests  14 failed | 2094 passed | 16 skipped (2124)
     Errors  2 errors
   Duration  410.58s
```

  The failures are pre-existing and unrelated: the accessorial live-catalog files
  (sandbox `psql` connection timeouts), the known grant-parity harness privilege,
  and `archived-applicants.test.ts`, which — like this file did — reads a draft
  migrations folder deleted when that draft was accepted; its backfill was applied
  through the migration tool and no file on disk answers it. Left for that pass's
  owner rather than reinterpreted here. The two errors are vitest worker timeouts.
- NOT verified, and cannot be here: the trigger does not exist until the draft is
  accepted. First proof owed after acceptance — insert a test pending row as
  management, confirm exactly one notification for the owner and none for
  dispatcher or onboarding staff, then delete the row.

## Files authored

- `.lovable/drafts/var_01m32gk4s5e59vb0a11jbzd2tr/migrations/20260921180000_notify_owner_pending_release_note.sql`
- `src/lib/notifications/taxonomy.ts`
- `src/components/NotificationBell.tsx`
- `src/hooks/useUnreadReleaseNotes.ts`
- `src/pages/management/ManagementPortal.tsx`
- `src/test/release-note-approval.test.ts`
- `docs/passes/2026-09-21-1755-owner-pending-announcement-alert.md`
