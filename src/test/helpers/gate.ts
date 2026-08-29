/**
 * Deterministic, VISIBLE gating for tests that cannot run everywhere.
 *
 * The problem this solves: `describe.skip` at module scope contributes nothing
 * to the totals, so a suite can report green while whole files silently did not
 * run. And a gate that keys off incidental state (a stray `dist/`, say) makes
 * the skip count carry no information at all.
 *
 * The contract:
 *   - gate satisfied            -> the suite runs normally.
 *   - gate unsatisfied, local   -> a boxed banner naming the reason, plus ONE
 *                                  named skipped test so the non-execution is
 *                                  a counted line in the report.
 *   - gate unsatisfied, required (CI) -> a FAILING test. CI never skips
 *                                  silently; if the gate could not be
 *                                  satisfied where it must be, that is a red
 *                                  run, not an absent one.
 *
 * ---------------------------------------------------------------------------
 * EXPECTED BASELINES — measured 2026-08-29 (look-alike serial guard fix). There are exactly two shapes. A
 * total that matches neither is a signal, not a question: something started
 * or stopped running, and the run should be read before it is trusted.
 *
 *   Both shapes are run with --maxWorkers=2; at full parallelism the RTL
 *   suites contend and time out in EITHER shape, and those timeouts are not a
 *   regression. Note too that `bun run test:guards` is a nine-file subset
 *   (86 tests, zero skips) — it is not a shape.
 *
 *   WITH a database attached (PGHOST set), RUN_BUNDLE_TESTS unset:

 *     914 passed | 14 skipped       (119 files passed | 1 skipped, 120 total)
 *     skipped:
 *       - stop time source trigger x5
 *           the provenance columns and the trigger ARE installed; the harness
 *           role (`sandbox_exec`) holds SELECT + INSERT and no UPDATE on any
 *           public table, and stamp_load_stop_time_source is BEFORE UPDATE, so
 *           it cannot fire from here. Granting UPDATE is forbidden; these five
 *           run on a disposable instance.
 *       - equipment serial guard, write arms x7
 *           the same missing UPDATE, plus no EXECUTE on
 *           canonical_equipment_serial — which the unique index expression
 *           evaluates as the CALLER on every write, so even an INSERT is
 *           refused here. `authenticated` does hold that EXECUTE, so the app
 *           is unaffected. Assign / return / archive against a near-twin are
 *           verified manually and on a disposable instance.
 *       - roadside bundle
 *           opt-in; needs RUN_BUNDLE_TESTS=1 and a build newer than src/
 *       - certify_rods_day live RPC, execute arm
 *           no EXECUTE grant for the harness role, no driver JWT mintable here
 *
 *   WITHOUT a database (PGHOST absent), same --maxWorkers=2:

 *     876 passed | 44 skipped       (111 files passed | 9 skipped, 120 total)
 *     skipped: the above, plus
 *       - share token throttling              (live catalog unreadable)
 *       - purge_rods_day path coverage        (live column list unreadable)
 *       - certify_rods_day live RPC, outer    (whole suite gated)
 *       - live SECURITY DEFINER catalog  x9   (one named skip per live check)
 *       - caller-evaluated functions     x3   (live catalog unreadable)
 *       - live grant / policy parity     x3   (live catalog unreadable)
 *       - stop time source structure     x4   (live catalog unreadable)
 *       - equipment serial guard, catalog x4  (live catalog unreadable)

 *
 * Every skip in both shapes is NAMED and COUNTED. If a skip count moves
 * without a matching named line, a gate has regressed to `runIf`/`skip`.
 * See src/test/README.md.
 * ---------------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';

export const IS_CI = Boolean(process.env.CI);

export function skipBanner(title: string, lines: string[]): void {
  const body = [title, '', ...lines];
  const width = Math.max(58, ...body.map((l) => l.length)) + 4;
  const bar = '  #'.padEnd(width + 3, '#');
  console.warn(
    [
      '',
      bar,
      ...body.map((l) => `  #  ${l.padEnd(width - 4)}#`),
      bar,
      '',
    ].join('\n'),
  );
}

export interface GateOptions {
  /** Is the gate satisfied? When true the suite runs for real. */
  enabled: boolean;
  /** Short reason, shown in the skipped test's name. */
  reason: string;
  /** Longer explanation lines for the banner. */
  details?: string[];
  /**
   * Must this gate be satisfiable here? Defaults to CI. When true and the gate
   * is unsatisfied, the suite fails instead of skipping.
   */
  required?: boolean;
}

type SuiteBody = () => void;

export function gatedDescribe(name: string, options: GateOptions, body: SuiteBody): void {
  const { enabled, reason, details = [] } = options;
  const required = options.required ?? IS_CI;

  if (enabled) {
    describe(name, body);
    return;
  }

  if (required) {
    describe(name, () => {
      it(`GATE NOT SATISFIED — ${reason}`, () => {
        expect.fail(
          `${name}: this suite is required in this environment but its gate was not satisfied — ${reason}. ` +
            `${details.join(' ')}`.trim(),
        );
      });
    });
    return;
  }

  skipBanner(`${name} DID NOT RUN`, [reason, ...details]);
  describe(name, () => {
    it.skip(`SKIPPED — ${reason}`, () => {
      /* not executed; present so the non-execution is counted and named */
    });
  });
}

/**
 * Per-test counterpart to `gatedDescribe`, for files where gated and ungated
 * tests are interleaved and hoisting the gated ones into their own block would
 * mean reordering the file.
 *
 * Same contract: runs when enabled, registers a NAMED skipped test when not
 * (so the non-execution is a counted line in the report), and FAILS under CI
 * where the gate is required.
 *
 * Never use bare `it.runIf` / `it.skipIf` for environment gating — `runIf`
 * drops the test from the report entirely, which is exactly the invisible
 * shape this helper exists to prevent.
 */
export function gatedIt(options: GateOptions) {
  const { enabled, reason, details = [] } = options;
  const required = options.required ?? IS_CI;

  return (name: string, body: () => void | Promise<void>): void => {
    if (enabled) {
      it(name, body);
      return;
    }
    if (required) {
      it(`GATE NOT SATISFIED — ${name}`, () => {
        expect.fail(
          `${name}: required in this environment but the gate was not satisfied — ${reason}. ` +
            `${details.join(' ')}`.trim(),
        );
      });
      return;
    }
    it.skip(`SKIPPED (${reason}) — ${name}`, () => {
      /* not executed; present so the non-execution is counted and named */
    });
  };
}
