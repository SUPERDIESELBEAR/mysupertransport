# 2026-09-17 13:14 UTC — the Drizzle migration folder, explained

Documentation + guard pass. No migration, no app or function code, no package
change, no data change.

## Step 1 — what happened

**(a) Who added the Drizzle files and packages.** The Lovable platform's
migration tool. `git show --stat a3ff8dc3a18f7c3f77c884bc4ca7b667dcd44e61`
("Changes", 2026-09-17 11:59:21 +0000, 7 files, 350 insertions) added
`drizzle.config.ts`, `drizzle/schema.ts`,
`drizzle/migrations/0000_restrictive_tenant_policy_batch_2.sql`,
`drizzle/migrations/meta/0000_snapshot.json`,
`drizzle/migrations/meta/_journal.json`, and `drizzle-kit ^0.31.10` /
`drizzle-orm ^0.45.2` / `postgres` in `package.json` + `bun.lock` — in the same
commit as the batch 2 SQL. This agent issued no command that writes a Drizzle
file. Not chosen by the agent.

**(b) Is `drizzle/migrations` where ALL future migrations go.** Yes, not a
one-off. The platform's migration tool creates every migration as a Drizzle Kit
CUSTOM migration under `drizzle/migrations`, writes nothing to
`supabase/migrations`, and owns the journal and snapshots.
`drizzle.config.ts` sets `out: "./drizzle/migrations"`.
`supabase/migrations` stays the historical record, read-only by hand.

**(c) Was batch 2 applied.** Yes.

- `SELECT count(*) FROM pg_policies WHERE schemaname='public'` → `609`
- restrictive policies (`permissive='RESTRICTIVE'`) → `49`
- rows named `tenant_isolation` for the 20 batch 2 tables → `20`
- `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5`
  → newest `20260916225721`; **no batch 2 entry**
- Drizzle keeps its own ledger: live table `drizzle.__drizzle_migrations`

So applied-migration history now lives in TWO ledgers, and a query against the
Supabase one alone under-reports. Recorded as a gap.

**(d) Why the report omitted them, and why it listed `types.ts`.** The
files-changed list was written from the agent's intended edits rather than from
`git`, so files a platform tool wrote were invisible to it, and
`src/integrations/supabase/types.ts` was listed on the assumption the tool
regenerates it. `git diff --stat 22fc7cc..HEAD` shows `types.ts` UNCHANGED.
That listing is an error. The report is immutable; the correction is in
`docs/tms-build-status.md`.

## Step 2 — safety of the blank schema

`drizzle/schema.ts` is exactly one comment line, no tables. `drizzle-kit
generate` and `drizzle-kit push` diff it against the database and would read
193 live tables as absent from the schema, i.e. propose dropping them.

Checked: `package.json` contains no script invoking `drizzle-kit` (dependency
only); there is no `.github` directory and no other CI configuration;
`LOVABLE_DB_MIGRATION_URL`, the only connection `drizzle.config.ts` names, is
NOT set in this sandbox. Nothing in this repository can run `push` or
`generate` against this database today. Neither command was run.

What runs is the platform tool's own sequence: empty custom migration → SQL
written verbatim → `drizzle-kit check` → Drizzle's migrator over a connection
the tool supplies. The blank schema is safe only while no `db:push` script
exists; that is a standing hazard, now on the follow-up list.

## Step 3 — readers of the migration folder

| Reader | Checks | Blind to a Drizzle-only migration |
|---|---|---|
| `src/test/helpers/migrationFunctions.ts` | shared resolver: newest definition of each SQL function, staged-draft detection; feeds `definer-search-path`, `definer-fail-open`, `actor-stamp-fk`, `notification-isolation`, `pgFake` and more | was YES — **fixed** |
| `src/test/policy-grant-parity.test.ts` | policy/grant parity per table created in scope | was YES — **fixed** |
| `src/test/resume-token-reuse.test.ts` | resolved body of `consume_application_resume_token` | YES, still |
| `src/test/notification-priority.test.ts` | `priority` literals vs the check constraint | YES, still |
| `src/test/settlement-foundation.test.ts` | forbidden vocabulary walk over `src` + migrations | YES, still |
| `src/lib/__tests__/settlementRun.test.ts` | `store_settlement_run` refusal rules | YES, still |
| `src/components/dispatch/loadDetail/__tests__/verbatimVerificationCard.test.tsx` | envelope keys the migration writes | YES, still |
| `src/lib/eld/offline/__tests__/parityFixtures.test.ts` | cites one migration path in a comment; reads no folder | n/a |

Because Step 1(b) is settled, the SHARED reader was changed:
`migrationSources()` returns `{ file, path }` across both folders —
`supabase/migrations` first, then `drizzle/migrations` labelled `drizzle/…` and
LAST, so the newest-definition rule still resolves to the truly newest text.
`resolveMigrationFunctions()` now reads each source's absolute path instead of
rebuilding it from one root. `migrationFiles()` is the labels of that list.

`policy-grant-parity` was moved onto the shared reader; its `20260730180000`
cutoff admits every `drizzle/` file, which carries no timestamp prefix. Its new
test is the demonstration asked for — it fails if the folder is not read:

```
✓ policy / grant parity > reads the drizzle migration folder too
```

asserting `drizzle/0000_restrictive_tenant_policy_batch_2.sql` is enumerated,
that exactly 20 policies named `tenant_isolation` parse out of it, and that
`broker_notes` is among their tables.

Named suites: `policy-grant-parity` 5/5, `definer-fail-open` 5/5,
`definer-search-path` 7/7, `notification-isolation` 18/18, `actor-stamp-fk`
16/16 — 51/51 across the five files.

The five still-blind readers own local `readdirSync` calls and their own
selection logic; converting them was outside this pass's permitted changes and
is on the follow-up list, not silently deferred.

## Step 5 — full suite

204 files: 201 passed, 1 failed, 2 skipped. 2,026 tests: 2,010 passed, 1
failed, 15 skipped. Two unhandled
`Error: [vitest-worker]: Timeout calling "onTaskUpdate"`.

Failure, verbatim:

```
FAIL  src/pages/dispatch/__tests__/brokersPage.test.tsx > Brokers page editing > offers delete only when the broker has zero loads
Error: Test timed out in 5000ms.
```

Re-run alone: 8/8 green in 2,993 ms, the named test 1,084 ms. Load flake under
a 425-second whole-suite run, not a defect. One green re-run is one sample.

## Contradictions

None between this prompt and the live system or the record. The prompt's
premises were all confirmed: the Drizzle files and packages exist, no new file
landed in `supabase/migrations`, and `types.ts` is unchanged.

## Files changed — `git diff --stat d88ceec09 HEAD`

```
 docs/tms-build-status.md               | 113 +++++++++++++++++++++++++++++++++
 docs/tms-wish-list.md                  |   4 ++
 src/test/helpers/migrationFunctions.ts |  62 +++++++++++++++---
 src/test/policy-grant-parity.test.ts   |  62 +++++++++++-------
 4 files changed, 211 insertions(+), 30 deletions(-)
```

This report itself lands in the commit that follows, and is the fifth file of
the pass.
