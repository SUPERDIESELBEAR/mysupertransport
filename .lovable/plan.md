# Record the two expected test baselines, and close the last unnamed gate

The gate conversion works. The reason only 2 skips showed up is that a database is reachable in this environment, so all three PGHOST-gated suites ran for real. Verified by re-running with the PG environment unset: each then registers a named `SKIPPED — no PGHOST, …` entry.

## 1. Sweep result — one offender, and only one

Swept every test file for `skipIf`, `runIf`, `it.skip`, `test.skip`, `describe.skip`, `.only` and `.todo`, excluding the gate helper.

- `src/test/definer-live-catalog.test.ts` — `it.runIf(HAS_DB)` on 9 tests. `runIf` drops them from the report entirely when the gate is unmet: invisible, and the only remaining case of it.
- `src/test/rods-live-certification.test.ts:102` — `const itExecuting = CAN_EXECUTE ? it : it.skip`. Already visible: registers a named, counted skip. Left as is.
- The three converted suites use `gatedDescribe` correctly.
- Every other match is prose or an unrelated identifier (`skippedRungs`, embed-check counters). No gating.

Nothing else can shift the baseline later.

## 2. Convert definer-live-catalog

Its gated and ungated tests are interleaved (3 pure tests sit between the 9 live ones), so hoisting them into a `gatedDescribe` means reordering the file. Add a per-test counterpart instead.

- `src/test/helpers/gate.ts`: add `gatedIt(options)`, returning an `it`-shaped function with the same contract as `gatedDescribe` — runs when enabled, registers `SKIPPED (<reason>) — <name>` when not, fails under CI. Document that bare `runIf`/`skip` must not be used for environment gating.
- `definer-live-catalog.test.ts`: define `itLive = gatedIt({ enabled: HAS_DB, … })`, replace the 9 `it.runIf(HAS_DB)(` call sites, and swap the hand-rolled banner block for `skipBanner` so the wording matches the other gates. Test bodies unchanged.

Result without a database: 9 named counted skips from this file instead of 9 invisible ones.

## 3. Write both baselines down somewhere durable

A comment block at the top of `src/test/helpers/gate.ts` (read whenever a gate is touched), mirrored in `src/test/README.md`:

```text
WITH a database attached (PGHOST set), no RUN_BUNDLE_TESTS:
  514 passed | 2 skipped
  skipped:
    - roadside bundle                        (opt-in; RUN_BUNDLE_TESTS=1 + a fresh build)
    - certify_rods_day live RPC, execute arm (no EXECUTE grant, no driver JWT)

WITHOUT a database (PGHOST absent):
  495 passed | 13 skipped
  skipped: the two above, plus
    - share token throttling         (no PGHOST, live catalog unreadable)
    - purge_rods_day path coverage   (no PGHOST, live column list unreadable)
    - certify_rods_day live RPC      (no PGHOST, outer gate)
    - live SECURITY DEFINER catalog  (no PGHOST) x9, one per live check

Anything that is not one of these two shapes is a signal, not a question.
```

Numbers go in as measured after the conversion, not as predicted — today's figures are 514/2 and 495/13, and the conversion is expected to leave both totals unchanged while making the 9 skips named.

## Verification

Run the full suite twice — once as-is, once with the PG environment variables unset — and confirm both totals and the named skip list match the note exactly before it is written.
