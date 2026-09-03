/**
 * BEHAVIOURAL COVER for the dispatch settlement gather/store layer (Pass 4).
 *
 * Three things are worth pinning here and nowhere else:
 *
 *  1. GATHERING DECIDES NOTHING. A TONU load and a load with no delivered_at
 *     must still ARRIVE at the engine, or the engine cannot report them as
 *     ineligible and the writer's "omits an eligible load" check has nothing
 *     to compare against. A gathering layer that filters is the "called then
 *     overridden" pattern in a new costume.
 *  2. THE FIVE IDENTITIES. Every stored total is also the sum of a subset of
 *     the lines. `load_base` and `factoring_reduction` are workings and sit
 *     OUTSIDE the net; a test that let them in would sanction double counting.
 *  3. THE PAYLOAD SHAPE the RPC reads — line types, signs, and the load_id on
 *     the rows whose CHECK constraints require one.
 */
import { describe, it, expect } from 'vitest';
import { computeDispatchSettlement, type DispatchLoadInput } from '@/lib/dispatchSettlement';
import {
  checkAttributionSums,
  checkTotalsEqualLines,
  dispatchSettlementPayload,
  gatherDispatchMonth,
  periodMonthDate,
  persistedDispatchLines,
} from '@/lib/dispatchSettlementRun';
import type { PayPolicyRates } from '@/lib/payTreatment';

const policy: PayPolicyRates = {
  id: 'p1', name: 'fixture',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null, fuel_discount_passthrough: false,
};

const load = (over: Partial<DispatchLoadInput>): DispatchLoadInput => ({
  id: 'l1', loadNumber: 'ST-1', loadType: 'standard', rateType: 'flat',
  status: 'delivered', deliveredAt: '2026-08-18T21:10:00+00:00',
  linehaulRate: 1000, dispatcherId: null, charges: [], ...over,
});

const result = (over = {}) => computeDispatchSettlement({
  month: '2026-08', dispatchRate: 5, factoringRate: 2, companyPolicy: policy,
  loads: [load({}), load({ id: 'l2', loadNumber: 'ST-2', linehaulRate: 2000, dispatcherId: 'd1' })],
  deductions: [{ id: 'ded1', label: 'DAT', amount: 100 }],
  ...over,
});

/* ------------------------------------------------------------------ */
/* 1. gathering decides nothing                                        */
/* ------------------------------------------------------------------ */

/** Minimal stand-in for the query builder shapes gatherDispatchMonth uses. */
function fakeClient(tables: Record<string, unknown>) {
  const chain = (rows: unknown) => {
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'gte', 'lt', 'lte', 'order']) {
      self[m] = () => self;
    }
    self.maybeSingle = () => Promise.resolve({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null });
    self.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
    return self;
  };
  return { from: (t: string) => chain(tables[t] ?? []) };
}

describe('gathering decides nothing', () => {
  const rows = {
    loads: [
      { id: 'a', load_number: 'ST-A', load_type: 'standard', status: 'tonu',
        delivered_at: '2026-08-10T12:00:00+00:00', rate_type: 'flat', linehaul_rate: 500,
        dispatcher_id: null, operator_id: null, load_charges: [] },
      { id: 'b', load_number: 'ST-B', load_type: 'standard', status: 'delivered',
        delivered_at: '2026-08-11T12:00:00+00:00', rate_type: 'flat', linehaul_rate: 1000,
        dispatcher_id: null, operator_id: null, load_charges: [] },
    ],
    dispatch_settlement_rates: [
      { dispatch_pct: 5, factoring_pct: 2, effective_from: '2026-01-01', effective_to: null },
    ],
    dispatch_deductions: [
      { id: 'd', label: 'DAT', amount: 100, is_active: true, effective_from: '2026-01-01', effective_to: null },
    ],
    pay_policies: [policy],
    pay_policy_assignments: [],
    dispatch_settlements: [],
  };

  it('hands the ineligible load to the engine rather than dropping it', async () => {
    const g = await gatherDispatchMonth(fakeClient(rows), '2026-08');
    expect(g.input.loads.map(l => l.id).sort()).toEqual(['a', 'b']);
    const r = computeDispatchSettlement(g.input);
    expect(r.ineligible.map(i => i.reason)).toEqual(['status_tonu']);
    expect(r.eligibleBase).toBe(1000);
  });

  it('reads the rates from the table, never from a default', async () => {
    const g = await gatherDispatchMonth(fakeClient(rows), '2026-08');
    expect(g.input.dispatchRate).toBe(5);
    expect(g.input.factoringRate).toBe(2);
  });

  it('refuses a month with no effective rates instead of assuming one', async () => {
    await expect(
      gatherDispatchMonth(fakeClient({ ...rows, dispatch_settlement_rates: [] }), '2026-08'),
    ).rejects.toThrow(/No dispatch settlement rates/);
  });
});

/* ------------------------------------------------------------------ */
/* 2. the five identities                                              */
/* ------------------------------------------------------------------ */

describe('every stored total is also the sum of its lines', () => {
  const r = result();
  const lines = persistedDispatchLines(r);

  it('holds for a computed result', () => {
    const check = checkTotalsEqualLines({
      eligible_base: r.eligibleBase,
      factoring_reduction: r.factoringReduction,
      reduced_base: r.reducedBase,
      dispatch_fee: r.dispatchFee,
      deductions_amount: r.deductionsAmount,
      net_amount: r.netAmount,
    }, lines);
    expect(check.problems).toEqual([]);
  });

  it('the workings do not enter the net', () => {
    // base 3000, factoring 2% = 60, reduced 2940, fee 5% = 147, deduction 100.
    expect(r.eligibleBase).toBe(3000);
    expect(r.factoringReduction).toBe(60);
    expect(r.dispatchFee).toBe(147);
    expect(r.netAmount).toBe(47);
    const net = lines
      .filter(l => ['dispatch_fee', 'flat_deduction', 'one_off'].includes(l.line_type))
      .reduce((s, l) => s + l.amount, 0);
    expect(net).toBe(47);
  });

  it('catches a total that does not follow from the lines', () => {
    const check = checkTotalsEqualLines({
      eligible_base: 9999, factoring_reduction: r.factoringReduction,
      reduced_base: r.reducedBase, dispatch_fee: r.dispatchFee,
      deductions_amount: r.deductionsAmount, net_amount: r.netAmount,
    }, lines);
    expect(check.ok).toBe(false);
    expect(check.problems.join()).toMatch(/eligible_base/);
  });

  it('the dispatcher attribution sums to the eligible base', () => {
    expect(checkAttributionSums(r).problems).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. the payload shape the writer reads                               */
/* ------------------------------------------------------------------ */

describe('the stored payload', () => {
  const r = result();
  const payload = dispatchSettlementPayload(r);

  it('carries one load_base line per contribution, with the load id', () => {
    const base = payload.lines.filter(l => l.line_type === 'load_base');
    expect(base).toHaveLength(r.contributions.length);
    expect(base.every(l => typeof l.load_id === 'string')).toBe(true);
  });

  it('signs the factoring reduction and the deduction negative', () => {
    expect(payload.lines.find(l => l.line_type === 'factoring_reduction')!.amount).toBe(-60);
    expect(payload.lines.find(l => l.line_type === 'flat_deduction')!.amount).toBe(-100);
    expect(payload.lines.find(l => l.line_type === 'dispatch_fee')!.amount).toBe(147);
  });

  it('freezes the dispatcher on the load_base line at compute time', () => {
    const l2 = payload.lines.find(l => l.load_id === 'l2');
    expect(l2!.dispatcher_id).toBe('d1');
  });

  it('records which percentage column decided each charge verdict', () => {
    const withCharge = computeDispatchSettlement({
      month: '2026-08', dispatchRate: 5, factoringRate: 2, companyPolicy: policy,
      loads: [load({
        charges: [{
          id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'detention',
          description: null, amount: 100, source: null, funding_source: null,
          actual_cost: null, proof_document_id: null,
        }],
      })],
    });
    const verdict = dispatchSettlementPayload(withCharge).contributions[0].verdicts[0];
    expect(verdict.excluded).toBe(true);
    expect(verdict.exclusion_reason).toBe('pct_100');
    expect(verdict.pct_column).toBe('detention_pct');
  });

  it('states the period as the first of the month', () => {
    expect(periodMonthDate('2026-08')).toBe('2026-08-01');
  });
});

/* ------------------------------------------------------------------ */
/* 4. the months a person may choose between                           */
/* ------------------------------------------------------------------ */

import { defaultDispatchMonth, listDispatchMonths, monthLabel } from '@/lib/dispatchSettlementRun';

describe('the month selector offers real months only', () => {
  const client = fakeClient({
    dispatch_settlements: [
      { period_month: '2026-08-01', status: 'draft' },
      { period_month: '2026-06-01', status: 'paid' },
    ],
    loads: [
      { delivered_at: '2026-08-11T12:00:00+00:00' },
      { delivered_at: '2026-09-02T12:00:00+00:00' },
      { delivered_at: '2026-09-03T12:00:00+00:00' },
    ],
  });

  it('lists stored months and uncomputed months with deliveries, newest first', async () => {
    const list = await listDispatchMonths(client);
    expect(list.map(o => o.month)).toEqual(['2026-09', '2026-08', '2026-06']);
    expect(list[0]).toMatchObject({ hasSettlement: false, deliveredLoads: 2, label: 'September 2026' });
    expect(list[1]).toMatchObject({ hasSettlement: true, status: 'draft' });
  });

  it('speaks plain language, never YYYY-MM', () => {
    expect(monthLabel('2026-08')).toBe('August 2026');
  });

  it('opens on the most recent month that HAS a settlement', async () => {
    const list = await listDispatchMonths(client);
    expect(defaultDispatchMonth(list, new Date('2026-09-03T12:00:00Z'))).toBe('2026-08');
  });

  it('falls back to the most recent COMPLETED month, never the current one', () => {
    const list = [
      { month: '2026-09', label: 'September 2026', hasSettlement: false, status: null, deliveredLoads: 2 },
      { month: '2026-08', label: 'August 2026', hasSettlement: false, status: null, deliveredLoads: 4 },
    ];
    expect(defaultDispatchMonth(list, new Date('2026-09-03T12:00:00Z'))).toBe('2026-08');
  });

  it('falls back to last month when there is nothing at all', () => {
    expect(defaultDispatchMonth([], new Date('2026-09-03T12:00:00Z'))).toBe('2026-08');
  });
});
