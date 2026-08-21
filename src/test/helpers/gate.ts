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
