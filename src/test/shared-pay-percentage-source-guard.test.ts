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

/**
 * Modules that CONSUME pay percentages and period logic, and must not restate
 * them.
 *
 * PASS 2 of Module 7 splits this into two lists, and the split is a rule, not
 * a convenience. `src/lib/invoiceBuilder.ts` reads the same loads and the same
 * parts, so it is bound by every source rule below — no literal `_pct` column,
 * no `new Date(` on a delivery value, no local month arithmetic. But it
 * resolves NO percentage at all: the broker owes 100% of every line, and §4.3
 * is dispatch-only. Requiring it to import `pctForClassification` would force
 * a percentage into the one path that must not have one.
 */
const SOURCE_RULE_ONLY = [
  'src/lib/invoiceBuilder.ts',
  'src/lib/loadRateParts.ts',
];

/** These additionally MUST call the shared resolver rather than re-derive it. */
const PCT_CONSUMERS = [
  'src/lib/settlementEngine.ts',
  'src/lib/driverLoadPay.ts',
  'src/lib/dispatchSettlement.ts',
];

const CONSUMERS = [...PCT_CONSUMERS, ...SOURCE_RULE_ONLY];


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
      if (!existsSync(path)) return; // module not built yet.
      const hits = code(path).match(/[a-z_]*_pct\b/g) ?? [];
      expect(hits).toEqual([]);
    });
  }

  for (const path of PCT_CONSUMERS) {
    it(`${path} imports the shared resolver`, () => {
      if (!existsSync(path)) return;
      expect(code(path)).toMatch(/pctForClassification/);
    });
  }

  for (const path of SOURCE_RULE_ONLY) {
    it(`${path} resolves no pay percentage of its own`, () => {
      if (!existsSync(path)) return;
      // Not merely "does not import the resolver": it must not reach a
      // percentage by ANY route. The broker owes every line in full.
      expect(code(path)).not.toMatch(/pctForClassification|payClassOf|charge_pay_classes/);
    });
  }
});

describe('the §4.3 exclusion predicate exists exactly once', () => {
  it('only dispatchSettlement.ts knows the exclusion reasons at all', () => {
    // The predicate is dispatch-only. If a second module names an exclusion
    // reason, a copy has appeared — and adjustments are the likeliest place
    // for it, since they are judged by the same rule.
    for (const path of ['src/lib/loadRateParts.ts', 'src/lib/invoiceBuilder.ts']) {
      expect(code(path)).not.toMatch(/pct_100|reimbursement_class/);
    }
  });

  it('charges and adjustments are judged by ONE decision function', () => {
    const src = code('src/lib/dispatchSettlement.ts');
    // One place that can return 'pct_100', one that can return
    // 'reimbursement_class'. Two of either is a second copy of §4.3.
    // (the union type declares both names once; count the RETURN sites.)
    expect((src.match(/exclusionReason: 'pct_100'/g) ?? []).length).toBe(1);
    expect((src.match(/exclusionReason: 'reimbursement_class'/g) ?? []).length).toBe(1);
    // ...and both verdict builders route through it.
    expect(src).toMatch(/function verdictFor[\s\S]*?exclusionDecision\(/);
    expect(src).toMatch(/function adjustmentVerdictFor[\s\S]*?exclusionDecision\(/);
  });
});

describe('the parts are assembled in exactly one module', () => {
  const ASSEMBLER = 'src/lib/loadRateParts.ts';

  it('both consumers call the shared assembler', () => {
    for (const path of ['src/lib/dispatchSettlement.ts', 'src/lib/invoiceBuilder.ts']) {
      expect(code(path), `${path} does not call the shared assembler`)
        .toMatch(/assembleLoadRateParts/);
    }
  });

  it('neither consumer reassembles a header rate for itself', () => {
    for (const path of ['src/lib/dispatchSettlement.ts', 'src/lib/invoiceBuilder.ts']) {
      const src = code(path);
      // The columns the assembler owns. Naming one here means a second copy.
      for (const col of ['loadoutRelocationFee', 'ratePerMile', 'ratePerTon', 'fscAmount']) {
        expect(src.includes(col), `${path} names ${col} outside the assembler`).toBe(false);
      }
    }
  });

  it('nobody reads the broker gross column instead of the parts', () => {
    for (const path of [ASSEMBLER, 'src/lib/dispatchSettlement.ts', 'src/lib/invoiceBuilder.ts']) {
      expect(code(path)).not.toMatch(/total_load_value|totalLoadValue/);
    }
  });

  it('the assembler reads CONFIRMED tonnage and never the estimate', () => {
    expect(code(ASSEMBLER)).toMatch(/confirmedTons/);
    expect(code(ASSEMBLER)).not.toMatch(/estimatedTons|estimated_tons/);
  });
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
