# 2026-09-21 15:30 — Archived applicants get their own place

BUILD MODE pass. Archiving an applicant from the onboarding pipeline filed them as
`denied` on the Applications page. Archived applicants may be hired later, so they
now carry their own outcome.

## What changed

- **Enum** (staged, applies on draft accept):
  `.lovable/drafts/var_01m327q9n4eqd9mzz6h503r8en/migrations/20260921150000_review_status_archived.sql`
  adds `'archived'` to `public.review_status`. Additive; undo noted in the file.
- **Backfill** (staged, separate file because a new enum value cannot be used in the
  transaction that creates it):
  `...20260921150100_backfill_archived_applicants.sql` moves the 50 rows whose
  `reviewer_notes LIKE '[Archived from pipeline]%'` from `denied` to `archived` and
  strips the now-redundant prefix. Undo noted.
- **Pipeline** — `src/pages/staff/PipelineDashboard.tsx` `handleArchiveFromHold` writes
  `review_status: 'archived'` instead of `'denied'`. Operator side (hold cleared,
  `is_active` false) and the `applicant_archived` audit row unchanged. Undo in comment.
- **Applications page** — `src/pages/management/ManagementPortal.tsx`: `StatusFilter`,
  the tab row, the `?status=` whitelist and the status colours gain `archived`
  (neutral `bg-muted`, never destructive). New `handleArchive` writes directly to
  `applications` plus an `application_archived` audit row — it deliberately does NOT
  call `deny-application`, so no applicant email is sent. New `handleUnarchive` moves
  a row back to Pending (clearing `reviewed_at` / `reviewed_by`, audit
  `application_unarchived`) or hands off to the existing deny flow.
- **Review drawer** — `src/components/management/ApplicationReviewDrawer.tsx`: optional
  `onArchive` / `onUnarchive` props, an Archive button beside Deny, a neutral archive
  confirmation, the outcome-reason panel now serves archived rows with "set aside"
  wording, and an archived footer offering "Move back to Pending" or "Deny instead".
  StaffPortal's usage is unaffected (both props optional).

## Proof

- `src/test/archived-applicants.test.ts` — 13 checks. Each fails against the old
  behaviour: pipeline wrote `'denied'`, page had no Archived tab, drawer had no
  archive action, no staged migrations.
- Typecheck (`tsgo --noEmit -p tsconfig.app.json`): clean.
- Full suite `--maxWorkers=4`: 2,070 passed | 16 skipped | 3 failed. Re-running the
  affected files isolated the only real failure as the known pre-existing
  `grant-parity-live` harness failure (sandbox database identity renamed —
  `permission denied for function grant_parity_report`). The other two were live-DB
  contention from repeated full runs, green on re-run.

## Owed / open

- The enum and the 50-row backfill apply when the draft is accepted; until then the
  Archived tab is empty in this draft.
- Wish list unchanged otherwise.
