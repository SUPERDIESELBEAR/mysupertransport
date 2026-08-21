# Record the two expected test baselines, and close the last unnamed gate

The gate conversion works. The reason only 2 skips showed up is that a database is reachable in this environment, so all three PGHOST-gated suites ran for real. Verified by re-running with the PG environment unset: each then registers a named `SKIPPED — no PGHOST, …` entry.

Two things remain.

## 1. One file was never converted

`src/test/definer-live-catalog.test.ts` gates 9 tests on `PGHOST` with per-test `skipIf`. Without a database they skip with no reason attached — the exact shape the gate work was meant to eliminate, just at test level instead of file level.

Convert it to `gatedDescribe` keyed on `PGHOST`, matching the other three: one named skip, a banner naming why, and a hard failure under CI. This collapses 9 unnamed skips into 1 named one, which changes the no-database baseline.

## 2. Write both baselines down somewhere durable

Record them as a comment block at the top of `src/test/helpers/gate.ts` (the file every gate imports, so it is read whenever a gate is touched), and mirror the same two shapes in `src/test/README.md`.

Stated plainly:

```text
WITH a database attached (PGHOST set), no RUN_BUNDLE_TESTS:
  508 passed | 2 skipped   (67 files passed | 1 skipped)
  skipped:
    - roadside bundle                        (opt-in; needs RUN_BUNDLE_TESTS=1 + a fresh build)
    - certify_rods_day live RPC, execute arm (no EXECUTE grant, no driver JWT)

WITHOUT a database (PGHOST absent):
  495 passed | 5 skipped   (63 files passed | 5 skipped)
  skipped: the two above, plus
    - share token throttling      (no PGHOST, live catalog unreadable)
    - purge_rods_day path coverage (no PGHOST, live column list unreadable)
    - certify_rods_day live RPC    (no PGHOST, outer gate)
    - live SECURITY DEFINER catalog (no PGHOST, pg_proc unreadable)

Anything that is not one of these two shapes is a signal, not a question.
```

Exact numbers get confirmed by running the suite both ways after the conversion and written in as measured, not as predicted. Today's measured figures are 514/2 with a database and 495/13 without; the conversion moves 9 unnamed skips into 1 named one, and the note will carry the post-change numbers.

## Technical notes

- `definer-live-catalog.test.ts`: replace the per-test `skipIf(!HAS_DB)` with a `describeLive` wrapper built on `gatedDescribe`, same pattern as `purge-path-coverage.test.ts`. Test bodies are unchanged.
- No change to `gate.ts` behaviour — only the baseline comment is added.
- Verification: run the suite twice, once as-is and once with the PG env vars unset, and confirm both totals match what the note claims.
