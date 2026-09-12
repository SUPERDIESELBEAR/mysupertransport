# Test suite: gates and expected baselines

Most of this suite is pure and runs anywhere. A handful of tests read live
state — the Postgres catalog, or the emitted production bundle — and cannot run
in every environment. Those are **gated**, and a gate must always be visible.

## The rule

Never gate a test with bare `it.skip`, `it.skipIf`, `it.runIf`, or
`describe.skip`. `runIf` and module-level `describe.skip` contribute nothing to
the totals, so the suite can report green while whole files silently did not
run.

Use the helpers in `src/test/helpers/gate.ts` instead:

- `gatedDescribe(name, { enabled, reason, details })` — whole-suite gate.
- `gatedIt({ enabled, reason, details })` — per-test gate, for files where
  gated and ungated tests are interleaved.

Both behave the same way:

| Condition | Behaviour |
|---|---|
| Gate satisfied | Runs normally. |
| Gate unsatisfied, local | Boxed banner naming the reason, plus a **named, counted** skipped test. |
| Gate unsatisfied, CI (or `required: true`) | **Fails.** CI never skips silently. |

## THE REACHABILITY GUARDS (added 2026-09-10) — ALL THREE NOW GREEN

Read this before anything else if you are looking at a red suite.

The three guards shipped **red on purpose** with **16 findings**. As of
**2026-09-12 all three are GREEN, 0 findings**. Anything any of them reports now
is NEW. There is no expected-red reachability guard left, so there is no
"expected red" line to hide a new finding behind.

| Guard | Findings (shipped -> now) | Trigger | What it means |
|---|---|---|---|
| `src/test/function-reachability.test.ts` | 14 -> 0 | n/a — green | Database functions any signed-in client may EXECUTE that nothing calls — no trigger, policy, default, other function, view, or quoted literal in source. |
| `src/test/view-reachability.test.ts` | 1 -> 0 | n/a — green | Its one finding (management `app-errors`, left in the view union when the Application Errors panel was deleted on 2026-06-24) was closed on 2026-09-12 by deleting the view. |
| `src/test/nav-target.test.ts` | 1 -> 0 | n/a — green | Its one finding (`FleetRoster.tsx:732` navigating to `/management/drivers` instead of `/management?view=drivers`) was fixed on 2026-09-12. |

The function guard moved 14 -> 13 (`get_inspection_doc_by_token` dropped),
13 -> 12 (search scope corrected, below), 12 -> 11 (`can_driver_message_staff`
dropped) and then to 0 across the 2026-09-11/12 drop-and-repin passes
(`get_user_roles` dropped, the role writers repinned with justifications, the
inspection-grace RPCs registered). `KNOWN_NO_CALLER_ENTRIES` holds 2 entries
against a ceiling of 2. Every step was a deletion, a repin with a written
justification, or a guard fix.

**No flags needed.** The function guard's live checks declare
`LIVE_CATALOG_TIMEOUT_MS = 60_000` in the file (measured runtime ~11s), so
`bunx vitest run src/test/function-reachability.test.ts` is green bare. Before
2026-09-12 it needed `--testTimeout=180000` and a bare run printed
`Test timed out in 5000ms`. **A TIMEOUT IS NOT A FINDING** — a guard that cannot
finish has reported nothing at all, which is worse than reporting a failure, and
on this guard it was read as "still red" for two days.

### `storage-bucket-limits.test.ts` — the only record of a bucket cap

Added 2026-09-12, GREEN, 4 tests, ~5.4s. Writes to `storage.buckets` are rejected in
this project, so a bucket's `file_size_limit` exists only in the live database —
SEVENTEEN of the twenty-one caps appear in NO migration (only `message-attachments`
does). `docs/storage-bucket-limits.md` is the intent; this suite reads the live catalog
and fails on any drift from it. Change a cap and that document in the same pass, or this
goes red. Gated on PGHOST with a named skip.

The fourth test asserts that EXACTLY four buckets are uncapped — `rods-logs`,
`eld-notices`, and the two passenger-auth buckets, all deliberate and reasoned in the
document. A null anywhere else is an unset cap and fails here rather than blending in.

### Live-catalog suites and the 5s default (swept 2026-09-12)

All 26 psql suites were run together and timed. Only three sit near or over the
default, and all three now declare their own timeout in-file rather than relying
on a CLI flag:

| Suite | Measured | Declared |
|---|---|---|
| `function-reachability.test.ts` | 11.1s in one test | `60_000` per live check |
| `payments-schema.test.ts` | 4.93s ('no writer reads the dispatch factoring rate' reads six function bodies) — inside the default by 70ms | `vi.setConfig({ testTimeout: 60_000 })` |
| `accessorial-adjustment-schema.test.ts` | 1-3.4s per test, 59s total; three tests were recorded as 5s timeouts on 2026-09-09 under contention | `vi.setConfig({ testTimeout: 60_000 })` |

Every other live suite's slowest test is at or under 3.4s. File TOTALS are
larger (`billing-schema` 44s, `dispatch-settlement-schema` 38s,
`fuel-import-live` 26s) but the limit is per test, so those are fine.

**Pooler flakes are not findings either.** Running all 26 together, three tests
failed with `FATAL: (EAUTHQUERY) auth_query secret check timed out` — a
connection refusal, not an assertion. All three passed on a serial re-run. Read
the failure text before counting a finding.

**Every red guard needs a trigger — a date, an event or a condition.** `nav-target`
sat red for nine days with its defect diagnosed and attributed in three places and
no trigger saying when it had to be fixed; `view-reachability` was red for two
days with none either, and it was carrying a view whose screen had already been
deleted three months earlier. A guard left red carries a trigger, or it is fixed
now. "Expected red" is not a status a guard may hold indefinitely.

These are a **backlog made visible**, not broken tests. Every finding is a real
gap; each will go green when the gap is closed.

**Green is reached by fixing or revoking — never by allowlisting a finding.**
The allowlists exist only for things that are legitimately uncalled-from-source
(a drill-down view, a deep link, a default-else render branch). Every entry
carries a written reason and the tests reject a bare name. If you find yourself
adding a finding to an allowlist to get a green run, you are deleting the
finding, not fixing it.

Each failure message names what was searched, which categories came back empty,
and the three ways out. Read the message; it was written for you.

### A FINDING IS A CANDIDATE, NOT A VERDICT — and state the search scope

`function-reachability` originally searched policies, function bodies and views
with `schemaname = 'public'`. `is_valid_application_draft_token` is called by
two RLS policies on **`storage.objects`**, a different schema, so the guard
reported it uncalled and its finding recommended dropping the function that
gates applicant document and signature uploads.

A guard that searches too narrowly does not miss answers — it produces
**confident wrong ones**, and nothing in the guard reveals it. This was caught
only because the finding was investigated instead of acted on.

Two standing rules follow:

1. **A reachability guard must state its search scope in the failure message** —
   which schemas, which categories — so a narrowing is visible in the output
   rather than invisible in the query. The function guard now searches every
   schema and says so on every finding.
2. **A guard's output is a candidate, not a verdict.** Every remaining finding
   gets the same treatment: read the live body, expand the callers, then act.

## Expected baselines (measured 2026-08-31, after the FacilitySelect quarantine)

Two shapes. Apart from the 16 reachability findings above, **everything else is
green** — anything else red is real.

**Both shapes are run with `--maxWorkers=2`.** The flag is part of the recorded
invocation, not an optimisation: at full parallelism the RTL suites contend and
time out in either shape, and those failures must not be read as a regression.

Note also that `bun run test:guards` is a twelve-file subset. It is not a shape
and must never be reported as one.

`FacilitySelect > keeps the add action reachable after typing a query with no
matches` is **quarantined** as of 2026-08-31: it is a Vitest/testing-library
timing issue (userEvent typing into cmdk runs ~40s in isolation and trips the 5s
limit), not a product defect. It is logged as KNOWN DEBT ("test tooling can
change without a commit") in `docs/tms-wish-list.md`. The test body is intact and
the skip is named and counted; unskip when the tooling is pinned. The global
timeout was deliberately not raised.

**With a database attached** (`PGHOST` set), `RUN_BUNDLE_TESTS` unset:

```text
Test Files  133 passed | 2 skipped (135)
     Tests  1106 passed | 15 skipped (1121)


skipped:
  stop time source trigger x5
    columns and trigger are installed, but the harness role has SELECT +
    INSERT and no UPDATE, and the trigger is BEFORE UPDATE, so it cannot
    fire here; granting UPDATE is forbidden
  equipment serial guard, write arms x7
    same missing UPDATE, plus no EXECUTE on canonical_equipment_serial —
    the unique index expression evaluates it as the CALLER on every write,
    so even an INSERT is refused here. `authenticated` holds that EXECUTE,
    so the application is unaffected
  roadside bundle
    opt-in; needs RUN_BUNDLE_TESTS=1 and a build newer than src/
  certify_rods_day live RPC > certifies a clean initial draft and supersedes it
    no EXECUTE grant for the harness role, and no driver JWT can be minted here
  FacilitySelect add action
    quarantined — Vitest/testing-library timing, not a product defect
```

**Without a database** (`PGHOST` absent), same `--maxWorkers=2`:


```text
Test Files  123 passed | 12 skipped (135)
     Tests  1031 passed | 82 skipped (1113)



skipped: the above, plus
  share token throttling             no PGHOST, live catalog unreadable
  purge_rods_day path coverage       no PGHOST, live column list unreadable
  certify_rods_day live RPC          no PGHOST, outer gate
  live SECURITY DEFINER catalog x9   no PGHOST, one named skip per live check
  caller-evaluated functions x3      no PGHOST, live catalog unreadable
  live grant / policy parity x3      no PGHOST, live catalog unreadable
  parked live schema / rows x7       no PGHOST, live catalog unreadable
  operator pay exposure x5           no PGHOST, live catalog unreadable
  stop time source structure x4      no PGHOST, live catalog unreadable
  equipment serial guard catalog x4  no PGHOST, live catalog unreadable
  fuel import live structure x12     no PGHOST, live catalog unreadable
  ST-TEST-005 claim hold, real load  no PGHOST, live claim row unreadable
  operator settlement isolation x4   no PGHOST, live policy catalog unreadable

```

Note on flakiness: a few React Testing Library suites (`brokersPage`,
`loadChargesCard`, `loadReferencesCard`, `loadsRouting`, `RequestRetakeModal`,
`blueGraceLoadPath`, `FacilitySelect`) time out at the default 5s under full worker parallelism on
a loaded machine. They pass individually and with `--maxWorkers=2`. A timeout in
one of those files is contention, not a regression — re-run it alone before
reading anything into it.


Every skip in both shapes is named in the report. If the skip count moves and no
named line moved with it, a gate has regressed to `runIf`/`skip` — fix the gate,
do not adjust these numbers to match.

## Running the gated suites

```bash
# bundle assertions: build first, then opt in
bun run build && RUN_BUNDLE_TESTS=1 bunx vitest run --maxWorkers=2

# the database-attached baseline
bunx vitest run --maxWorkers=2

# reproduce the no-database baseline
env -u PGHOST -u PGUSER -u PGPASSWORD -u PGDATABASE -u PGPORT bunx vitest run --maxWorkers=2
```


The `certify_rods_day` execute arm cannot run here at all: the sandbox psql role
is deliberately barred from `EXECUTE` on database functions, and granting it is
forbidden. It belongs on a disposable instance with a real driver session.
