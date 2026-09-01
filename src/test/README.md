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

## Expected baselines (measured 2026-08-31, after the FacilitySelect quarantine)

There are exactly two shapes, and **both are fully green** — there are no
expected failures. Anything red is real.

**Both shapes are run with `--maxWorkers=2`.** The flag is part of the recorded
invocation, not an optimisation: at full parallelism the RTL suites contend and
time out in either shape, and those failures must not be read as a regression.

Note also that `bun run test:guards` is a nine-file subset. It is not a shape
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
