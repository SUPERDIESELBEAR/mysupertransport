# Pass report — 2026-09-21 19:30 UTC — suite reconciliation after the other session's 2026-09-21 changes

## Scope

Tests and guard inventories only. No feature behaviour was changed, and nothing in
`src/` outside `src/test/` was touched.

THE RULE APPLIED: a test was brought up to date only when the TEST was stale (it read a
file that no longer exists, or counted an inventory that legitimately grew). Where the
test was right and the live system is wrong, the test was left failing and the defect is
named below with the feature it belongs to.

No contradiction with the live system was found in the three reports read
(`2026-09-21-1530-archived-applicants.md`, `-1620-release-note-approval.md`,
`-1645-auto-drafted-announcements.md`), with one exception recorded as a real defect:
the 1530 report describes Applications-page code that is not in this repository.

## Step 1 — the current state

`bunx vitest run --maxWorkers=4`, verbatim:

```
 Test Files  8 failed | 202 passed | 2 skipped (212)
      Tests  14 failed | 2085 passed | 16 skipped (2115)
     Errors  1 error
   Duration  408.99s
```

Difference from the 1820 report's 15: **14**, not 15. The 1820 run additionally caught
`grant-parity-live` (harness psql role, a known intermittent — it passed in this run) and
the run-to-run sandbox `psql` timeouts move between files. Re-running the six
feature/guard files on their own isolated exactly 12 failures in 6 files; the other two
failing files in the full run were sandbox connection timeouts
(`equipment-receipt-confirmation`, `fuel-import-live` / `grant-parity-live` shape:
`psql: error: ... FATAL: (EAUTHQUERY) auth_query secret check timed out`), not assertions.

## Step 2 — one line per failure, with its verdict

| file | test | cause | verdict |
| --- | --- | --- | --- |
| `release-note-approval.test.ts` | whole file (import-time throw) | `ENOENT ... .lovable/drafts/var_01m32a4twbexev1mjy249yke58/migrations/20260921170000_release_note_approval.sql` — staged file applied as `drizzle/migrations/0021_release_note_approval.sql`, then deleted | **STALE TEST** |
| `archived-applicants.test.ts` | staged database change > adds the archived value | `readdirSync('.lovable/drafts/var_01m327q9n4eqd9mzz6h503r8en/migrations')` — directory gone; applied as `drizzle/migrations/0022_review_status_archived.sql` | **STALE TEST** |
| `archived-applicants.test.ts` | staged database change > backfills the rows in a later migration | the backfill was applied as a one-off data statement, never as a migration file — correctly so, seeding rows is not DDL | **STALE TEST** |
| `archived-applicants.test.ts` | Applications page > offers an Archived tab | `ManagementPortal.tsx` has no Archived tab | **REAL DEFECT** |
| `archived-applicants.test.ts` | Applications page > accepts `?status=archived` | same file, no `archived` in the `?status=` whitelist | **REAL DEFECT** |
| `archived-applicants.test.ts` | Applications page > archives without sending an email | `handleArchive` does not exist | **REAL DEFECT** |
| `archived-applicants.test.ts` | Applications page > move an archived applicant back to Pending | `handleUnarchive` does not exist | **REAL DEFECT** |
| `archived-applicants.test.ts` | Applications page > styles archived neutrally | no `archived: 'bg-muted…'` status colour | **REAL DEFECT** |
| `tenancy-resolver.test.ts` | every stamped table shares one trigger name | live census grew to 132 by `release_note_reads` | **STALE TEST** |
| `tenancy-resolver.test.ts` | every company_id table carries tenant_isolation or is pending | `expected 161 to be greater than or equal to 162` — same new table | **STALE TEST** |
| `definer-search-path.test.ts` | every SECURITY DEFINER function pins `public, extensions` | `public.notify_staff_on_release_note()` is pinned to `public` alone | **REAL DEFECT** |
| `definer-live-catalog.test.ts` | every live public-only pin is accounted for | same function, same cause | **REAL DEFECT** |
| `notification-isolation.test.ts` | every notification insert outside `try_notify` is isolated | same function holds a raw `INSERT INTO public.notifications` with no `EXCEPTION` handler | **REAL DEFECT** |

### Evidence, from the live catalog

```
enforce_release_note_review    | t | {"search_path=public, extensions"} | postgres=X,service_role=X,sandbox_exec=X
notify_staff_on_release_note   | t | {search_path=public}               | postgres=X,service_role=X,sandbox_exec=X
```

```
release_note_reads_own            |PERMISSIVE|ALL   |(user_id = auth.uid())
release_note_reads_read_reviewers |PERMISSIVE|SELECT|(has_role(auth.uid(),'management') OR has_role(auth.uid(),'owner'))
tenant_isolation                  |RESTRICTIVE|ALL  |(company_id = ( SELECT current_company_id() AS current_company_id))
```

```
review_status enum: pending, approved, denied, revisions_requested, archived
applications by outcome: approved 96 | archived 50 | denied 113 | pending 78 | revisions_requested 7
denied rows still carrying '[Archived from pipeline]%': 0
```

`git log -S"handleUnarchive" -- src/pages/management/ManagementPortal.tsx` returns
nothing: the Applications-page half of the archived-applicants feature has never existed
in this repository. Its migrations and its pipeline/drawer halves did land
(`PipelineDashboard.tsx:1252` writes `review_status: 'archived'`, the drawer carries
`review-action-archive` and `review-action-unarchive`).

## Step 3 — the stale ones, fixed

New shared helper `appliedMigrationSql(needle)` in `src/test/helpers/migrationFunctions.ts`:
resolves a migration by a substring of its label across BOTH folders in applied order and
throws when nothing matches, so a rename or a move can never silently blank an assertion.

- **`release-note-approval.test.ts`** — reads `appliedMigrationSql('release_note_approval')`
  (resolves to `drizzle/0021_release_note_approval.sql`). All 12 checks pass.
- **`archived-applicants.test.ts`** — the `staged database change` block is now
  `applied database change`: the enum is read through the reader
  (`drizzle/0022_review_status_archived.sql`), the live enum is asserted to carry
  `archived`, and the backfill is asserted against the live table (0 denied rows with the
  note prefix, 50 archived) rather than against a migration file that was never written.
- **`tenancy-resolver.test.ts`** — new `ANNOUNCEMENT_STAMPED = ['release_note_reads']`,
  added to the stamped-trigger census and to `RESTRICTIVE_DONE`, each with the live
  policy reading quoted in the comment. 125/125 pass.
- **`definer-search-path` / `definer-live-catalog` / `notification-isolation`** — NOT
  touched. `notify_staff_on_release_note` is not pinned to `public, extensions` and holds
  a bare notification insert, so no inventory entry was added and the three tests stay
  red. Adding the function to `LEGACY_PUBLIC_ONLY_PINS` or to `OWNERS` would have been
  loosening a guard to hide a live defect.

## The real defects, named

1. **`public.notify_staff_on_release_note()` — search_path pinned to `public` alone.**
   Feature: What's New announcement approval (other session, 2026-09-21 16:20). Client
   EXECUTE is correctly absent (only `postgres`, `service_role`, the sandbox role). The
   fix is one line: `ALTER FUNCTION public.notify_staff_on_release_note() SET search_path = public, extensions;`
   Two tests go green with it. Not done here: this pass changes tests, not features.
2. **The same function holds an unisolated `INSERT INTO public.notifications`.** This is
   the exact shape that silently rolled back weeks of coordinator saves (see the header of
   `notification-isolation.test.ts`): if the insert raises — a `notifications` check
   constraint, a bad `type` value — it aborts the owner's approval of the announcement.
   It should call `public.try_notify(...)`, or the loop body should sit in a `BEGIN ...
   EXCEPTION WHEN OTHERS THEN NULL; END` block. Feature: same.
3. **The Applications page half of archived applicants is missing.** Feature: archived
   applicants (other session, 2026-09-21 15:30). The report describes `StatusFilter`, the
   Archived tab, the `?status=` whitelist, `handleArchive`, `handleUnarchive` and the
   neutral `bg-muted` colour in `ManagementPortal.tsx`; none is in the repository, and git
   history shows none ever was. The database and the pipeline/drawer halves are live, so
   today an applicant archived from the pipeline becomes invisible on the Applications
   page — he is neither Pending nor Denied and there is no tab that shows him. Five tests
   stay red until that session restores the file.

## Step 4 — every guard I touched still bites

Each was broken deliberately, run, and restored.

- Census, `ANNOUNCEMENT_STAMPED` changed to `['zz_not_a_table']`:
  `FAIL ... every stamped table shares one trigger name ... expected [ 'active_dispatch', …(132) ] to deeply equal [ 'active_dispatch', …(132) ]`
- `RESTRICTIVE_DONE`, `'release_note_reads'` removed:
  `FAIL ... the DONE list shrank below the live inventory ... expected 161 to be greater than or equal to 162`
- The new reader, needle changed to `release_note_approval_typo`:
  `Error: No applied migration matches "release_note_approval_typo". Searched /dev-server/supabase/migrations and /dev-server/drizzle/migrations.`
- Archived enum assertion changed to `'nonsense'`:
  `FAIL ... adds the archived value to review_status ... to match /ADD VALUE IF NOT EXISTS 'nonsense'/`

All four restored; `grep -c release_note_reads src/test/tenancy-resolver.test.ts` → 5.

## Step 5 — migration hygiene, recorded

Standing rule for BOTH sessions, recorded here and in `docs/tms-build-status.md`:

1. **New migrations go to `drizzle/migrations`** (since 2026-09-17 the platform's
   migration tool writes there and nothing to `supabase/migrations`). `supabase/migrations`
   is history; do not add to it.
2. **A draft's staged migration is not a permanent file.** On accept the SQL is applied
   and the staged copy is deleted. Any test that reads a staged path breaks on acceptance —
   which is what produced 9 of today's 14 failures.
3. **Tests read migrations through the shared reader**, never a hard-coded path:
   `appliedMigrationSql(needle)` for one migration's text, `migrationSources()` /
   `resolveMigrationFunctions()` for the whole set. Both folders, applied order, loud
   failure when nothing matches.
4. **Data changes are not migrations.** A backfill applied as a one-off statement leaves no
   file, so assert it against the live table, not against SQL text.

## Full suite — `--maxWorkers=4`, verbatim

```
 Test Files  1 failed | 209 passed | 2 skipped (212)
      Tests  8 failed | 2103 passed | 16 skipped (2127)
   Errors  1 error
   Duration  400.51s
```

The one failing file is `src/test/archived-applicants.test.ts` (5 assertions) plus the
three guard assertions in `definer-search-path`, `definer-live-catalog` and
`notification-isolation` — all four named as real defects above, all belonging to the
other session's two features. Nothing this pass authored fails.

Typecheck: clean.

## Files this pass authored

- `src/test/helpers/migrationFunctions.ts` (new `appliedMigrationSql`)
- `src/test/archived-applicants.test.ts`
- `src/test/release-note-approval.test.ts`
- `src/test/tenancy-resolver.test.ts`
- `docs/tms-build-status.md` (appended)
- `docs/tms-wish-list.md` (appended)
- `docs/passes/2026-09-21-1930-suite-reconciliation.md` (this report)
