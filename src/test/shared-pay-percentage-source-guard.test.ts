/**
 * (b) THE SOURCE GUARD — no consumer re-derives what is shared.
 *
 * A spy test proves the shared function was called once. It does not prove a
 * second, private copy of the map is not sitting beside the call, which is
 * exactly how the three `PCT_FIELD` copies came to exist. This guard reads the
 * consuming modules as text and refuses:
 *
 *   - any literal `_pct` column name (percentage columns are named in ONE file),
 *   - `new Date(` applied to a delivery/appointment value (period attribution is
 *     carrier-zone, section 2 of the settlement rules),
 *   - month arithmetic done locally instead of through the shared helpers.
 *
 * Comments are stripped before matching: this is a rule about code, and the
 * reasoning above has to be allowed to name the columns it is protecting.
 *
 * PASS 3: the dispatch computation module is now in CONSUMERS. It is the module
 * this guard was really written for. It landed as `src/lib/dispatchSettlement.ts`
 * rather than the `dispatchSettlementEngine.ts` name this comment anticipated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/** Modules that CONSUME pay percentages and period logic, and must not restate them. */
const CONSUMERS = [
  'src/lib/settlementEngine.ts',
  'src/lib/driverLoadPay.ts',
  'src/lib/dispatchSettlement.ts',
];

/**
 * PASS 4: the gathering/persistence layer is NOT in CONSUMERS, and the reason
 * is worth stating so nobody "fixes" the omission. It legitimately names
 * `dispatch_pct` and `factoring_pct` — columns of
 * `dispatch_settlement_rates`, which are the dispatch company's own rates and
 * have nothing to do with the driver pay percentages this guard protects. A
 * blanket `_pct` ban there would be a false positive. What must NOT appear is
 * a PAY POLICY percentage column, so those are banned by name below.
 */
const RUN_LAYER = 'src/lib/dispatchSettlementRun.ts';

/** The pay-policy percentage columns. Named here and in the owner, nowhere else. */
const PAY_POLICY_PCT_COLUMNS = [
  'linehaul_pct', 'fsc_pct', 'detention_pct', 'layover_pct', 'tonu_pct',
  'stopoff_pct', 'lumper_pct', 'other_accessorial_pct', 'per_ton_pct', 'loadout_pct',
];

describe('the dispatch run layer does not restate the pay percentage map', () => {
  it('names no pay policy percentage column', () => {
    if (!existsSync(RUN_LAYER)) return;
    const src = code(RUN_LAYER);
    const hits = PAY_POLICY_PCT_COLUMNS.filter((c) => src.includes(c));
    expect(hits, `the run layer names ${hits.join(', ')} directly`).toEqual([]);
  });

  it('gets the column name for a verdict from the owner module', () => {
    if (!existsSync(RUN_LAYER)) return;
    expect(code(RUN_LAYER)).toMatch(/pctColumnForClassification/);
    expect(code(RUN_LAYER)).toMatch(/from '@\/lib\/payTreatment'/);
  });

  it('does no month arithmetic outside the shared helper', () => {
    if (!existsSync(RUN_LAYER)) return;
    const src = code(RUN_LAYER);
    expect(src).not.toMatch(/slice\(\s*0\s*,\s*7\s*\)/);
    expect(src).not.toMatch(/\.(getMonth|setMonth|getUTCMonth)\(/);
    expect(src).toMatch(/from '@\/lib\/settlementPeriod'/);
  });
});

/** The single module allowed to name percentage columns. */
const OWNER = 'src/lib/payTreatment.ts';

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const code = (path: string) => stripComments(readFileSync(path, 'utf8'));

describe('the percentage columns are named in exactly one module', () => {
  it('the owner names them', () => {
    expect(code(OWNER)).toContain('_pct');
  });

  for (const path of CONSUMERS) {
    it(`${path} contains no literal _pct column name`, () => {
      if (!existsSync(path)) return; // Pass 3 module not built yet.
      const hits = code(path).match(/[a-z_]*_pct\b/g) ?? [];
      expect(hits).toEqual([]);
    });

    it(`${path} imports the shared resolver`, () => {
      if (!existsSync(path)) return;
      expect(code(path)).toMatch(/pctForClassification/);
    });
  }
});

describe('delivery instants are never read in the machine timezone', () => {
  for (const path of CONSUMERS) {
    it(`${path} applies no new Date( to a delivery value`, () => {
      if (!existsSync(path)) return;
      const hits = code(path).match(/new Date\(\s*[^)]*(deliver|appointment|Delivered|At)[^)]*\)/g) ?? [];
      expect(hits).toEqual([]);
    });

    it(`${path} does no month arithmetic of its own`, () => {
      if (!existsSync(path)) return;
      const src = code(path);
      // slice(0, 7) is how a 'YYYY-MM' is cut by hand; getMonth/setMonth are the
      // local-zone versions of the same mistake.
      expect(src).not.toMatch(/slice\(\s*0\s*,\s*7\s*\)/);
      expect(src).not.toMatch(/\.(getMonth|setMonth|getUTCMonth)\(/);
      if (/month/i.test(src)) {
        expect(src).toMatch(/from '@\/lib\/settlementPeriod'/);
      }
    });
  }
});
