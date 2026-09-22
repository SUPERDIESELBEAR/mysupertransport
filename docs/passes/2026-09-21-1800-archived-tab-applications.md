# 2026-09-21 18:00 — Archived tab on the Applications page

BUILD MODE pass. The `archived` outcome and the 50 pipeline-archived rows were already
live, and the review drawer already handled archived, but the Applications page had no
Archived tab and never passed the drawer its archive actions (dead code).

## What changed

- `src/pages/management/ManagementPortal.tsx`
  - `StatusFilter` + `?status=` whitelist + tab row gain `archived`; `STATUS_COLORS.archived`
    is neutral (`bg-muted`), never destructive.
  - `fetchApplications` treats `archived` like `revisions_requested` — a plain
    `.eq('review_status', …)` with no submitted/reviewed `.or()`, because pipeline-archived
    rows are not submission-state dependent.
  - `fetchMetrics` adds a head count for the Archived tab badge (`archivedCount`).
  - New `handleArchive` (direct update + `audit_log` `application_archived`, **no**
    `functions.invoke`, so no applicant email) and `handleUnarchive` (back to `pending`,
    audit `application_unarchived`; `denied` hands off to the existing deny flow).
  - Row reason preview now shows for archived rows in muted, not destructive, text.
  - Drawer receives `onArchive` / `onUnarchive`. Undo noted in a comment.
- `src/test/archived-applicants.test.ts` — the two staged-migration checks were retired
  (that draft's migrations folder is gone; the enum and backfill are applied live) and
  replaced with wiring checks: the drawer props and the archived fetch branch. 13 pass.

## Proof

- Browser as Mae (management), `/management?view=applications&status=archived`: the tab
  renders with badge **50**, rows show neutral `archived` badges and their set-aside
  reasons. Screenshot taken; no record was changed.
- Typecheck clean. Full suite `--maxWorkers=4`: Test Files 8 failed | 201 passed | 2
  skipped (211); Tests 8 failed | 2080 passed | 16 skipped (2104); 2 sandbox
  `onTaskUpdate` timeouts. The failures are all live-DB checks unrelated to this pass —
  they reproduce serially and include `definer-search-path` failing on
  `drizzle/0021_release_note_approval.sql: public.notify_staff_on_release_note()` whose
  `search_path` is `'public'` and omits `extensions`, plus the tenancy/definer-catalog and
  staff-suspension catalog checks and the pre-existing grant-parity harness issue.

## Owed / open

- The `notify_staff_on_release_note()` search_path pin (from the release-note approval
  migration) needs a corrective migration; schema changes must be staged from a draft.
