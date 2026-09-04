/**
 * MODULE 5, PASS 4 / PASS 3 — the settlement seam.
 *
 * An APPROVED late accessorial adjustment reaches a driver settlement and is
 * paid ONCE. The classification decision is the whole pass: an adjustment is a
 * SETTLE-ONCE item, so it keys on `settledSourcesEver` and never on
 * `settledSourcesThisPeriod`. Getting that backwards reproduces one of the two
 * recorded settlement defects — a period-scoped key would pay the same
 * adjustment again in the next period, an ever-scoped key on a RECURRING item
 * would silence it forever.
 *
 * These are FIXTURE tests by necessity: `gatherSettlementRun` reaches
 * `equipment_outstanding`, which the psql harness holds no EXECUTE on, so a
 * live gather cannot run here (recorded, not worked around). The live evidence
 * for this pass is the state machine exercised against the real
 * `ST-TEST-005-A1` row, reported separately.
 */
import { describe, it, expect } from 'vitest';
import { gatherSettlementRun, previewFromGathered } from '@/lib/settlementRun';
import { computeSettlement } from '@/lib/settlementEngine';
import { hasUnsettledWork } from '@/lib/settlementPopulation';

/* eslint-disable @typescript-eslint/no-explicit-any */

const PERIOD_ANCHOR = '2026-08-14';     // inside Wed 12 – Tue 18 Aug 2026
const THIS_PERIOD = '2026-08-12';
const PRIOR_PERIOD = '2026-08-05';
const IN_PERIOD = '2026-08-14T18:00:00Z';
const PRIOR_PERIOD_INSTANT = '2026-08-06T18:00:00Z';
const OP = '11111111-1111-4111-8111-111111111111';

function fakeClient(tables: Record<string, any[]>, failTable = '__none__') {
  const err = { code: '42501', message: `permission denied for table ${failTable}` };
  const builder = (t: string, rows: any[]) => {
    const failed = t === failTable;
    const chain: any = {
      select: () => chain,
      eq: () => chain, not: () => chain, is: () => chain,
      gte: () => chain, lte: () => chain, lt: () => chain,
      order: () => chain,
      maybeSingle: async () => (failed ? { data: null, error: err } : { data: rows[0] ?? null, error: null }),
      then: (res: any, rej: any) =>
        Promise.resolve(failed ? { data: null, error: err } : { data: rows, error: null }).then(res, rej),
    };
    return chain;
  };
  return {
    from: (t: string) => builder(t, tables[t] ?? []),
    // The equipment hold must be a real answer, never a default in either
    // direction; supplied explicitly here because the harness cannot read it.
    rpc: async () => ({ data: false, error: null }),
  };
}

const baseTables = (detentionPct = 100) => ({
  settlement_settings: [{
    minimum_net_pay_threshold: 100, hold_buffer: 500, equipment_value_per_driver: 1200,
    rm_deposit_target: 2000, rm_weekly_deduction: 200, work_week_start_dow: 3,
  }],
  pay_policies: [{
    id: 'p1', is_company_default: true, linehaul_pct: 72, fsc_pct: 72,
    detention_pct: detentionPct, lumper_reimbursement_pct: 100, other_accessorial_pct: 72,
    per_ton_pct: 72, loadout_pct: 72,
  }],
  pay_policy_assignments: [],
  settlement_line_items: [],
  settlements: [],
  fuel_transactions: [],
  cash_advances: [],
  rm_deposits: [],
  deductions: [],
  loads: [],
  operators: [{ id: OP, first_name: 'Only', last_name: 'Adjustment', is_departing: false }],
  accessorial_adjustments: [] as any[],
});

const adjustment = (over: Record<string, unknown> = {}) => ({
  id: 'adj-1',
  reference: 'ST26056-A1',
  load_id: 'load-9',
  charge_type: 'detention',
  description: 'Detention approved after the week closed',
  amount: 275,
  funding_source: null,
  actual_cost: null,
  approved_at: IN_PERIOD,
  status: 'approved',
  settlement_id: null,
  loads: { operator_id: OP, load_number: 'ST26056' },
  ...over,
});

const gatherOne = async (t: any, failTable?: string) => {
  const run = await gatherSettlementRun(fakeClient(t, failTable), PERIOD_ANCHOR);
  return run.operators.find(o => o.operatorId === OP) ?? null;
};

describe('an approved adjustment reaches the settlement', () => {
  it('brings the driver into the run on its own, with nothing else outstanding', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment()];
    const g = await gatherOne(t);
    expect(g).not.toBeNull();
    expect(g!.work.approvedAdjustmentCount).toBe(1);
    expect(hasUnsettledWork(g!.work)).toBe(true);
    expect(g!.reasons.join(' ')).toMatch(/approved late accessorial adjustment/i);
    // Nothing else put him there.
    expect(g!.input.loads).toEqual([]);
    expect(g!.input.deductions).toEqual([]);
  });

  it('pays it as an `adjustment` line keyed to the adjustments table', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment()];
    const preview = previewFromGathered(await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR));
    const line = preview.rows[0].computed.lines.find(l => l.lineType === 'adjustment')!;
    expect(line.sourceTable).toBe('accessorial_adjustments');
    expect(line.sourceId).toBe('adj-1');
    expect(line.description).toContain('ST26056-A1');
    expect(line.amount).toBe(275);      // detention_pct 100
    expect(preview.rows[0].computed.netAmount).toBe(275);
  });

  it('takes the percentage from the POLICY, never from a literal', async () => {
    const t: any = baseTables(50);
    t.accessorial_adjustments = [adjustment()];
    const preview = previewFromGathered(await gatherSettlementRun(fakeClient(t), PERIOD_ANCHOR));
    expect(preview.rows[0].computed.lines.find(l => l.lineType === 'adjustment')!.amount).toBe(137.5);
  });

  it('reimburses a driver-funded adjustment at cost, and pays a company-funded one nothing', () => {
    const policy: any = {
      id: 'p1', name: 'r', linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
      stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72, other_accessorial_pct: 72,
      charge_pay_classes: { lumper: 'reimbursement' },
    };
    const base: any = {
      operatorId: OP, periodAnchorDate: THIS_PERIOD,
      settings: { minimum_net_pay_threshold: 100, hold_buffer: 500, equipment_value_per_driver: 1200, rm_deposit_target: 2000, rm_weekly_deduction: 200, work_week_start_dow: 3 },
      companyPolicy: policy, loads: [], equipmentOutstanding: false,
    };
    const driverPaid = computeSettlement({
      ...base,
      adjustments: [{ id: 'a', reference: 'ST-1-A1', chargeType: 'lumper', amount: 300, fundingSource: 'driver', actualCost: 120 }],
    });
    expect(driverPaid.lines.map(l => [l.lineType, l.amount])).toEqual([['adjustment', 120]]);

    const companyPaid = computeSettlement({
      ...base,
      adjustments: [{ id: 'a', reference: 'ST-1-A1', chargeType: 'lumper', amount: 300, fundingSource: 'company', actualCost: 120 }],
    });
    expect(companyPaid.lines).toEqual([]);
  });
});

describe('it is paid ONCE — two independent locks', () => {
  it('is not paid again in a later period once a line item exists for it', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment()];
    // The row's own pointers were never stamped; the money's record was.
    t.settlement_line_items = [{
      source_table: 'accessorial_adjustments', source_id: 'adj-1',
      settlements: { period_start: PRIOR_PERIOD },
    }];
    expect(await gatherOne(t)).toBeNull();
  });

  it('uses settledSourcesEver, NOT the period-scoped set', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment()];
    // A line item from a DIFFERENT period. A recurring deduction would be due
    // again here; a settle-once adjustment is not.
    t.settlement_line_items = [{
      source_table: 'accessorial_adjustments', source_id: 'adj-1',
      settlements: { period_start: PRIOR_PERIOD },
    }];
    expect(await gatherOne(t)).toBeNull();

    // And the same key inside THIS period is equally disqualifying.
    t.settlement_line_items[0].settlements.period_start = THIS_PERIOD;
    expect(await gatherOne(t)).toBeNull();
  });

  it('skips a row already stamped with a settlement even when no line item survives', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment({ settlement_id: 'settlement-x', status: 'settled' })];
    t.settlement_line_items = [];
    expect(await gatherOne(t)).toBeNull();
  });
});

describe('period attribution is the period of APPROVAL', () => {
  it('pays an adjustment approved this week on a load delivered weeks ago', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment({ approved_at: IN_PERIOD })];
    const g = await gatherOne(t);
    expect(g!.input.adjustments!.map(a => a.reference)).toEqual(['ST26056-A1']);
  });

  it('does not pull in an adjustment approved in a closed period', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment({ approved_at: PRIOR_PERIOD_INSTANT })];
    expect(await gatherOne(t)).toBeNull();
  });
});

describe('only an APPROVED adjustment is ever paid', () => {
  for (const status of ['draft', 'pending_approval', 'rejected', 'void']) {
    it(`never pays a ${status} adjustment`, async () => {
      const t: any = baseTables();
      t.accessorial_adjustments = [adjustment({ status })];
      expect(await gatherOne(t)).toBeNull();
    });
  }
});

describe('a failed read aborts the run', () => {
  it('throws instead of quietly producing a settlement without the adjustment', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment()];
    await expect(gatherSettlementRun(fakeClient(t, 'accessorial_adjustments'), PERIOD_ANCHOR))
      .rejects.toThrow(/accessorial_adjustments[\s\S]*FAILED|FAILED[\s\S]*accessorial_adjustments/);
  });

  it('a driver whose ONLY item is the failed read is not silently dropped either', async () => {
    const t: any = baseTables();
    t.accessorial_adjustments = [adjustment()];
    await expect(gatherSettlementRun(fakeClient(t, 'accessorial_adjustments'), PERIOD_ANCHOR))
      .rejects.toThrow();
  });
});
