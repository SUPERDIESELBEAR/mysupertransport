# What's New — owner approval, audience, read receipts (2026-09-21 16:20 UTC)

BUILD MODE. Draft pass: the schema is STAGED, not applied. Nothing in this pass ran
DDL and nothing mailed a real person.

## What existed before

`release_notes` had five columns plus `flagged_faq_ids`. Any INSERT by management
or the owner fired `trg_notify_staff_on_release_note` AFTER INSERT, which wrote a
bell notification for every user holding `onboarding_staff`, `dispatcher`,
`management` or `owner` and POSTed `send-release-note` for the email. There was no
draft state, no review, no audience choice, and no record of who read what.

## What this pass builds

### Staged migration
`.lovable/drafts/var_01m32a4twbexev1mjy249yke58/migrations/20260921170000_release_note_approval.sql`
— additive only, undo in the header. It applies when the draft is accepted.

1. Two enums: `release_note_status` (draft/pending/approved/denied/archived) and
   `release_note_category` (feature/change/fix/reminder).
2. `release_notes` gains `status` (default `pending`), `category`, `target_roles`
   (default all four staff roles), `link_route`, `link_label`, `requires_ack`,
   `is_pinned`, `submitted_by/at`, `reviewed_by/at`, `denial_reason`,
   `published_at`. Existing rows are backfilled to `approved` with
   `published_at = created_at`, so nothing already delivered disappears.
3. `permission_actions` gains `release_note.approve`. NO `role_permissions` row is
   granted: the owner holds it through the short-circuit in `has_permission`, per
   P1. Management keeps its existing write access, which now produces pending rows.
4. `aa_enforce_release_note_review` — BEFORE UPDATE on `release_notes`, fires only
   when `status` itself moves into `approved`, `denied` or `archived`, and refuses
   without the permission (ERRCODE 42501). Ordinary edits to a draft are untouched.
   It also stamps `reviewed_by`, `reviewed_at` and `published_at`. EXECUTE revoked
   from PUBLIC, `anon` and `authenticated`.
5. Delivery moves off INSERT: the AFTER INSERT trigger now carries
   `WHEN (NEW.status = 'approved')`, and a second AFTER UPDATE OF status trigger
   fires on the transition into `approved`. `notify_staff_on_release_note` reads
   `target_roles` instead of notifying every staff role unconditionally, still
   intersected with the four staff roles so a bad array can never reach a driver.
6. The staff SELECT policy narrows to `status = 'approved'`, plus the person's own
   rows, plus management and the owner. The queue, denials and the archive belong
   to the reviewers.
7. `release_note_reads` (unique per note per person): GRANT select/insert/update to
   `authenticated`, ALL to `service_role`, REVOKE ALL from PUBLIC and `anon`;
   `aa_stamp_tenant_company_id`; RESTRICTIVE `tenant_isolation`; own-rows policy on
   `user_id = auth.uid()`; read-all for management and owner.

### Client
- `src/lib/releaseNotes/types.ts` — shapes, labels, audience roles (drivers absent
  by construction), and the single documented loosely-typed database handle. The
  generated `types.ts` is not editable and cannot describe a staged schema.
- `src/hooks/useUnreadReleaseNotes.ts` — published notes inside the viewer's roles
  with no read row, plus any `requires_ack` note not yet acknowledged; `markRead`
  upserts seen/acknowledged.
- `src/components/WhatsNewDialog.tsx` — one announcement at a time, newest first,
  "Got it" and optional "Take me there". Suppressed in demo mode, suppressed while
  another dialog or sheet owns the screen (which is how a form in progress is left
  alone), 1.2s settle delay.
- `src/components/management/ReleaseNotesManager.tsx` — composer with category,
  audience checkboxes, needs-a-"Got it", pin, and a screen picker built from
  `STAFF_HELP_INDEX`; "Submit for Approval" for management, "Post Announcement" for
  the owner; Pending Approval queue with Approve & Send / Deny with a reason /
  Archive (owner only); Sent Back section with the reason; Published list with
  "Seen by N of M" expanding to names; Archived section.
- `ManagementPortal.tsx` and `StaffPortal.tsx` render `WhatsNewDialog` once each;
  the Settings sub-nav "What's New" entry carries a gold unread count.

## Verification

- Typecheck: clean (`bunx tsgo --noEmit -p tsconfig.json`, no output).
- New test `src/test/release-note-approval.test.ts` — 12 checks, all passing. They
  fail on the old behaviour: the unconditional AFTER INSERT trigger, the
  all-staff audience, and the absence of a review gate.
- Full suite, `--maxWorkers=4`, verbatim:

```
 Test Files  2 failed | 205 passed | 2 skipped (209)
      Tests  2 failed | 2070 passed | 16 skipped (2088)
     Errors  2 errors
   Duration  427.19s
```

  The two failures are `payments-schema` (sandbox `psql` connection timeout) and
  the known `grant-parity-live` harness permission; the two errors are vitest
  worker timeouts. No product failure.

- NOT verified here, and cannot be: the approval gate, the notify triggers and the
  read table do not exist until the draft is accepted. No live proof of a refused
  approval by a non-owner exists yet. That proof is owed on the first pass after
  acceptance, with raising transactions and real sessions (Mae submits, Leo is
  refused the approval, Marcus approves — to a test row only, never mailing real
  staff).

## Files authored

- `.lovable/drafts/var_01m32a4twbexev1mjy249yke58/migrations/20260921170000_release_note_approval.sql`
- `src/lib/releaseNotes/types.ts`
- `src/hooks/useUnreadReleaseNotes.ts`
- `src/components/WhatsNewDialog.tsx`
- `src/components/management/ReleaseNotesManager.tsx`
- `src/pages/management/ManagementPortal.tsx`
- `src/pages/staff/StaffPortal.tsx`
- `src/test/release-note-approval.test.ts`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-21-1620-release-note-approval.md`
