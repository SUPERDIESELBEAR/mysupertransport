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

## EXPECTED RED: the three reachability guards (added 2026-09-10)

Read this before anything else if you are looking at a red suite.

`function-reachability`, `view-reachability` and `nav-target` **ship failing on
purpose**. They shipped with **16 findings**; **13** remain:

| Guard | Findings (shipped -> now) | What it means |
|---|---|---|
| `src/test/function-reachability.test.ts` | 14 -> 11 | Database functions any signed-in client may EXECUTE that nothing calls — no trigger, policy, default, other function, view, or quoted literal in source. |
| `src/test/view-reachability.test.ts` | 1 | Management `app-errors`: declared in the view union and in `ALLOWED_VIEWS`, but no render branch and no way in. |
| `src/test/nav-target.test.ts` | 1 | `FleetRoster.tsx:617` navigates to `/management/drivers`; Management parses only `?view=`, so the click silently lands on the overview. |

The function guard moved 14 -> 13 (`get_inspection_doc_by_token` dropped),
13 -> 12 (search scope corrected, below) and 12 -> 11
(`can_driver_message_staff` dropped). Every step was a deletion or a guard fix;
none was an allowlist entry.

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
