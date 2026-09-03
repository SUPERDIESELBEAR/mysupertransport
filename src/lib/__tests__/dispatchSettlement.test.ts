/**
 * BEHAVIOURAL COVER for the dispatch company settlement computation.
 *
 * These pin the rules in section 4 of docs/tms-build-status.md against
 * hand-built inputs. They are NOT the verification of the module — the six
 * seed loads are, and that evidence is SEEDED-DATA EVIDENCE either way. These
 * exist so a rule change fails loudly here first.
 */
import { describe, it, expect } from 'vitest';
import { computeDispatchSettlement, type DispatchLoadInput } from '@/lib/dispatchSettlement';
import type { PayPolicyRates } from '@/lib/payTreatment';
import type { LoadChargeRecord } from '@/lib/loadCharges';

const policy: PayPolicyRates = {
  id: 'p1', name: 'fixture',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null, fuel_discount_passthrough: false,
};

const charge = (over: Partial<LoadChargeRecord>): LoadChargeRecord => ({
  id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'other',
  description: null, amount: 0, source: null, funding_source: null,
  actual_cost: null, proof_document_id: null, ...over,
});

const load = (over: Partial<DispatchLoadInput>): DispatchLoadInput => ({
  id: 'l1', loadNumber: 'ST-1', loadType: 'standard', rateType: 'flat',
  status: 'delivered', deliveredAt: '2026-08-18T21:10:00+00:00',
  linehaulRate: 1000, dispatcherId: null, charges: [], ...over,
});

const run = (loads: DispatchLoadInput[], over = {}) => computeDispatchSettlement({
  month: '2026-08', dispatchRate: 5, factoringRate: 2,
  companyPolicy: policy, loads, ...over,
});

describe('4.1 eligibility', () => {
  it('excludes a TONU load by STATUS, not by its charges', () => {
    const r = run([load({ status: 'tonu', charges: [charge({ charge_type: 'tonu', amount: 150 })] })]);
    expect(r.eligibleBase).toBe(0);
    expect(r.ineligible[0].reason).toBe('status_tonu');
  });

  it('excludes a cancelled load', () => {
    expect(run([load({ status: 'cancelled' })]).ineligible[0].reason).toBe('status_cancelled');
  });

  it('excludes a load with no delivered_at', () => {
    expect(run([load({ deliveredAt: null })]).ineligible[0].reason).toBe('no_delivered_at');
  });

  it('excludes a load delivered in another month', () => {
    expect(run([load({ deliveredAt: '2026-07-18T21:10:00+00:00' })]).ineligible[0].reason)
      .toBe('outside_month');
  });
});

describe('4.2 the base is built FROM PARTS', () => {
  it('per-ton reads confirmed tons, never estimated', () => {
    const r = run([load({
      rateType: 'per_ton', ratePerTon: 270, confirmedTons: 25, linehaulRate: 0,
    })]);
    expect(r.eligibleBase).toBe(6750);
  });

  it('an unscaled per-ton load contributes no linehaul', () => {
    const r = run([load({ rateType: 'per_ton', ratePerTon: 270, confirmedTons: null, linehaulRate: 0 })]);
    expect(r.eligibleBase).toBe(0);
  });

  it('per-mile multiplies the rate by loaded miles', () => {
    expect(run([load({ rateType: 'per_mile', ratePerMile: 2, loadedMiles: 500 })]).eligibleBase)
      .toBe(1000);
  });

  it('percentage_of_load behaves as flat', () => {
    expect(run([load({ rateType: 'percentage_of_load', linehaulRate: 1200 })]).eligibleBase)
      .toBe(1200);
  });

  it('adds the FSC only when it is explicitly unbundled', () => {
    expect(run([load({ fscAmount: 300, fscBundledIntoLinehaul: false })]).eligibleBase).toBe(1300);
    expect(run([load({ fscAmount: 300, fscBundledIntoLinehaul: null })]).eligibleBase).toBe(1000);
    expect(run([load({ fscAmount: 300, fscBundledIntoLinehaul: true })]).eligibleBase).toBe(1000);
  });

  it('a loadout contributes its relocation fee', () => {
    expect(run([load({ loadType: 'loadout', loadoutRelocationFee: 150, linehaulRate: 0 })])
      .eligibleBase).toBe(150);
  });
});

describe('4.3 the exclusion predicate', () => {
  it('excludes a charge whose resolved percentage is 100', () => {
    const r = run([load({ charges: [charge({ charge_type: 'detention', amount: 500 })] })]);
    expect(r.eligibleBase).toBe(1000);
    const v = r.contributions[0].verdicts[0];
    expect(v).toMatchObject({ excluded: true, exclusionReason: 'pct_100', resolvedPct: 100 });
  });

  it('includes a TONU CHARGE on a delivered load at its full amount', () => {
    const r = run([load({ charges: [charge({ charge_type: 'tonu', amount: 150 })] })]);
    expect(r.eligibleBase).toBe(1150);
    expect(r.contributions[0].verdicts[0]).toMatchObject({ excluded: false, resolvedPct: 72 });
  });

  it('excludes a reimbursement-classed charge whatever its percentage', () => {
    const reimbursing: PayPolicyRates = {
      ...policy, charge_pay_classes: { other: 'reimbursement' },
    };
    const r = run([load({ charges: [charge({ charge_type: 'other', amount: 90 })] })],
      { companyPolicy: reimbursing });
    expect(r.eligibleBase).toBe(1000);
    expect(r.contributions[0].verdicts[0]).toMatchObject({
      excluded: true, exclusionReason: 'reimbursement_class', resolvedPct: 72,
    });
  });

  it('a new accessorial configured at 100 drops out with no code change', () => {
    const r = run([load({ charges: [charge({ charge_type: 'stopoff', amount: 75 })] })],
      { companyPolicy: { ...policy, stopoff_pct: 100 } });
    expect(r.eligibleBase).toBe(1000);
    expect(r.contributions[0].verdicts[0].exclusionReason).toBe('pct_100');
  });
});

describe('4.5 arithmetic, in order', () => {
  it('takes factoring off the base before the dispatch rate', () => {
    const r = run([load({ linehaulRate: 471_608 })], {
      deductions: [{ id: 'd1', label: 'DAT', amount: 779 }],
    });
    expect(r.factoringReduction).toBe(9432.16);
    expect(r.reducedBase).toBe(462_175.84);
    expect(r.dispatchFee).toBe(23_108.79);
    expect(r.netAmount).toBe(22_329.79);
  });

  it('the net is the sum of the lines', () => {
    const r = run([load({})], {
      deductions: [{ id: 'd1', label: 'DAT', amount: 100 }],
      oneOffs: [{ label: 'comcheck', amount: 25, loadId: 'l1' }],
    });
    expect(r.netAmount).toBe(r.lines.reduce((s, l) => s + l.amount, 0));
    expect(r.deductionsAmount).toBe(125);
  });
});

describe('4.6 attribution', () => {
  it('carries an unattributed bucket and sums to the base', () => {
    const r = run([
      load({ id: 'a', loadNumber: 'A', dispatcherId: 'jack' }),
      load({ id: 'b', loadNumber: 'B', dispatcherId: null, linehaulRate: 150 }),
    ]);
    const unattributed = r.byDispatcher.find(b => b.dispatcherId === null);
    expect(unattributed?.base).toBe(150);
    expect(r.byDispatcher.reduce((s, b) => s + b.base, 0)).toBe(r.eligibleBase);
  });

  it('the unattributed bucket exists even when every load has a booker', () => {
    const r = run([load({ dispatcherId: 'jack' })]);
    expect(r.byDispatcher.some(b => b.dispatcherId === null)).toBe(true);
  });
});
