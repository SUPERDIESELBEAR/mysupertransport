# 2026-09-21 20:30 — The three defects from the 19:30 reconciliation, fixed

BUILD MODE pass. This session took the three real defects the 19:30 suite
reconciliation found in the other session's 2026-09-21 features. The other
session is paused. Nothing here contradicted the live system.

## Defects 1 and 2 — `public.notify_staff_on_release_note()`

Migration: `drizzle/migrations/0025_release_note_notifier_pin_and_isolate.sql`
(applied; undo in the file header).

1. **Pin.** Recreated with `SET search_path TO 'public', 'extensions'` — the
   convention in `docs/database-security-conventions.md` and the same pin carried
   by `enforce_release_note_review()` on the same table. Not added to
   `LEGACY_PUBLIC_ONLY_PINS`.
2. **Isolation.** The per-recipient `INSERT INTO public.notifications` is gone.
   Each notice now goes through `public.try_notify(...)` — copied from
   `notify_operator_on_status_change()`, which already routes every notice that
   way — so a notice that cannot be written records itself in `audit_log`
   (`notification_delivery_failed`) instead of aborting the transaction that
   approved the announcement.

Triggers, policies and grants are unchanged. Client EXECUTE is still revoked:
`pg_proc.proacl` lists `postgres`, `service_role` and the sandbox role only;
PUBLIC, `anon` and `authenticated` hold nothing.
`src/integrations/supabase/types.ts` was regenerated.

### Proof that a failed notice no longer cancels an approval

The sandbox role cannot run DDL, so the failure was induced through data, inside
one transaction that was rolled back. The onboarding-only test account
(`bc0bf6aa-8e61-4ef6-ad03-62e655231898`) was given a second
`company_members` row against a throwaway carrier, which makes
`stamp_company_from_recipient` refuse that one row. Then an approved
`release_notes` row was inserted, firing the notifier.

```
 announcement_status | approved
 recorded_failure    | 42501 Notification recipient bc0bf6aa-… belongs to 2
                       different carriers; refusing to guess which one this
                       notifications row belongs to.
 notices_that_did_land | 16
ROLLBACK
```

The announcement stood, the other sixteen notices landed, and the one that could
not be written was recorded as owed. On the old function the same insert aborted
the whole approval. Nothing was committed and no mail was sent.

Guards, all green after the migration: `definer-search-path` (7),
`definer-live-catalog` (13), `notification-isolation` (18),
`release-note-approval` (14).

## Defect 3 — the Applications page half of archived applicants

Built in `src/pages/management/ManagementPortal.tsx` to
`src/test/archived-applicants.test.ts` and the 15:30 report, and nothing beyond it:

- `StatusFilter` gains `archived`; an **Archived** tab sits between Denied and
  All, carrying its own count (`archivedCount`, fetched in `fetchMetrics`).
- `archived` accepted in the `?status=` whitelist, so `?status=archived`
  deep-links.
- `handleArchive(appId, notes)` — a direct `applications` update to `archived`
  plus an `application_archived` audit row. Deliberately **not** the
  `deny-application` function, so no applicant email is ever sent.
- `handleUnarchive(appId, target)` — back to `pending` (clearing `reviewed_at` /
  `reviewed_by`, audit `application_unarchived`), again with no email, or a
  hand-off to the existing deny flow when the reviewer chooses `denied`.
- `archived` styled `bg-muted text-muted-foreground border-border` — neutral, not
  destructive; the tab badge is muted too.
- Both handlers passed to the already-built `ApplicationReviewDrawer`
  (`onArchive` / `onUnarchive`), whose Archive and Move-back buttons existed but
  had nothing wired to them.

**Who may archive and unarchive:** exactly the staff who can deny today. Both are
direct table writes, so enforcement is the `Staff can update applications`
UPDATE policy on `public.applications` (`is_staff(auth.uid())`) — the same gate
`deny-application` writes through with its service-role client after checking the
caller's token.

### Proof on screen, as Mae Lauron (management)

- `/management?view=applications&status=archived` — Archived tab selected, badge
  reads **50**, every row shows the neutral `archived` chip
  (`/tmp/browser/arch/archived.png`).
- A throwaway applicant (`ZZTest ArchiveProof`,
  `zz-archive-proof@example.invalid`, id `7014401c-…`) was created, archived from
  the drawer, found on the Archived tab, moved back to Pending, then deleted.
  Never a real applicant.
- No mail: `select count(*) from public.email_send_log where recipient_email =
  'zz-archive-proof@example.invalid'` → `0`.
- Audit trail left behind as designed: `application_archived` and
  `application_unarchived` for that id.
- Cleanup confirmed: `select count(*) from public.applications where email =
  'zz-archive-proof@example.invalid'` → `0` (DELETE returned 204).

## Suite and typecheck

Typecheck (`tsgo --noEmit -p tsconfig.app.json`): clean, no output.

Full suite, `--maxWorkers=4`, verbatim:

```
 Test Files  3 failed | 207 passed | 2 skipped (212)
      Tests  3 failed | 2111 passed | 16 skipped (2130)
```

The three, each re-run alone and each an infrastructure failure, not a product
one:

- `grant-parity-live` — `ERROR: permission denied for function
  grant_parity_report` (the known sandbox-identity harness failure).
- `parked-and-termination-guardrail`, `dispatch-settlement-schema` — `psql:
  FATAL: (EAUTHQUERY) auth_query secret check timed out`.

Recorded for both sessions: two earlier full runs in this pass reported 168 and
145 failures. Every one of them was the shared pooler refusing new connections
(`EAUTHQUERY`, then `ECIRCUITBREAKER: too many authentication failures`) under
the suite's own connection storm; the files passed individually within seconds.
A large red count in this suite should be checked against the pooler before it is
read as a defect.

## Deployment

Nothing to deploy: the fix is a database migration (applied, verified live
against `pg_get_functiondef` and `pg_proc.proacl`) and client code served by the
existing build. No edge function changed.

## Files this pass authored

- `drizzle/migrations/0025_release_note_notifier_pin_and_isolate.sql`
- `src/integrations/supabase/types.ts` (regenerated)
- `src/pages/management/ManagementPortal.tsx`
- `docs/passes/2026-09-21-2030-teammate-defects-fixed.md`
- `docs/tms-wish-list.md`, `docs/tms-build-status.md` (entries below)
