import { describe, it, expect } from 'vitest';
import {
  computeSettlement, resolveEffectivePolicy,
  type SettlementComputeInput, type SettlementLoadInput,
} from '@/lib/settlementEngine';
import { workPeriodForDelivery, carrierDateOf, deliveredInPeriod } from '@/lib/settlementPeriod';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import type { PayPolicyRates } from '@/lib/payTreatment';
import type { LoadChargeRecord } from '@/lib/loadCharges';

const policy: PayPolicyRates = {
  id: 'p-default', name: 'Company default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72,
  charge_pay_classes: null,
  fuel_discount_passthrough: false,
};

const charge = (over: Partial<LoadChargeRecord>): LoadChargeRecord => ({
  id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'linehaul',
  description: null, amount: 0, source: null, funding_source: null,
  actual_cost: null, proof_document_id: null, ...over,
});

/** A standard load whose paperwork is complete, so it is never withheld. */
const load = (over: Partial<SettlementLoadInput> = {}): SettlementLoadInput => ({
  id: 'l1', loadNumber: 'ST-1000', loadType: 'standard',
  deliveredAt: '2026-09-03T15:00:00Z',
  charges: [charge({ amount: 1000 })],
  documents: [
    { document_type: 'rate_confirmation' }, { document_type: 'bol' },
    { document_type: 'pod' },
  ],
  exceptions: [],
  ...over,
});

const base = (over: Partial<SettlementComputeInput> = {}): SettlementComputeInput => ({
  operatorId: 'op-1',
  periodAnchorDate: '2026-09-03',
  settings: SETTLEMENT_SETTINGS_DEFAULTS,
  companyPolicy: policy,
  loads: [load()],
  ...over,
});

describe('period attribution — delivery date in carrier time', () => {
  it('11pm Tuesday Pacific is Wednesday Central and belongs to the NEXT week', () => {
    // 2026-09-08 23:00 Pacific = 2026-09-09 01:00 Central (Wednesday).
    const period = workPeriodForDelivery('2026-09-09T06:00:00Z', 3)!;
    expect(carrierDateOf('2026-09-09T06:00:00Z')).toBe('2026-09-09');
    expect(period.periodStart).toBe('2026-09-09');
    expect(period.periodEnd).toBe('2026-09-15');
  });

  it('a Tuesday delivery closes the week it ends', () => {
    const period = workPeriodForDelivery('2026-09-08T17:00:00Z', 3)!;
    expect(period.periodStart).toBe('2026-09-02');
    expect(period.periodEnd).toBe('2026-09-08');
  });

  it('payday is the Tuesday two weeks after the period ends', () => {
    expect(workPeriodForDelivery('2026-09-08T17:00:00Z', 3)!.payday).toBe('2026-09-22');
  });

  it('deliveredInPeriod reads the instant in the carrier zone', () => {
    const period = { periodStart: '2026-09-02', periodEnd: '2026-09-08' };
    expect(deliveredInPeriod('2026-09-09T02:00:00Z', period)).toBe(true);  // 9pm Tue Central
    expect(deliveredInPeriod('2026-09-09T06:00:00Z', period)).toBe(false); // 1am Wed Central
  });
});

describe('pay policy resolution — nearest wins', () => {
  const driver = { ...policy, id: 'p-driver', linehaul_pct: 75 };
  const loadLevel = { ...policy, id: 'p-load', linehaul_pct: 80 };

  it('load-specific beats driver-specific beats company default', () => {
    expect(resolveEffectivePolicy(policy, driver, loadLevel)!.id).toBe('p-load');
    expect(resolveEffectivePolicy(policy, driver, null)!.id).toBe('p-driver');
    expect(resolveEffectivePolicy(policy, null, null)!.id).toBe('p-default');
  });

  it('a load override changes only that load', () => {
    const result = computeSettlement(base({
      loads: [
        load({ id: 'a', loadNumber: 'ST-A' }),
        load({ id: 'b', loadNumber: 'ST-B', policyOverride: loadLevel }),
      ],
    }));
    expect(result.lines.map(l => l.amount)).toEqual([720, 800]);
  });
});

describe('charge arithmetic', () => {
  it('linehaul settles at 72% and detention at 100%', () => {
    const result = computeSettlement(base({
      loads: [load({
        charges: [
          charge({ id: 'c1', charge_type: 'linehaul', amount: 2000 }),
          charge({ id: 'c2', charge_type: 'detention', amount: 150 }),
          charge({ id: 'c3', charge_type: 'fuel_surcharge', amount: 300 }),
        ],
      })],
    }));
    expect(result.grossAmount).toBe(1440 + 150 + 216);
    expect(result.netAmount).toBe(1806);
    expect(result.lines[0].lineType).toBe('load_pay');
    expect(result.lines[1].lineType).toBe('accessorial');
  });

  it('a reimbursement pays the ACTUAL cost, only when the driver funded it', () => {
    const reimbursementPolicy: PayPolicyRates = {
      ...policy, charge_pay_classes: { lumper: 'reimbursement' },
    };
    const result = computeSettlement(base({
      companyPolicy: reimbursementPolicy,
      loads: [load({
        charges: [
          charge({ id: 'c1', charge_type: 'lumper', amount: 200, actual_cost: 175, funding_source: 'driver' }),
          charge({ id: 'c2', charge_type: 'lumper', amount: 200, actual_cost: 200, funding_source: 'company' }),
        ],
      })],
    }));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].lineType).toBe('reimbursement');
    expect(result.lines[0].amount).toBe(175);
  });

  it('lumper stays revenue at 100% under the default policy', () => {
    const result = computeSettlement(base({
      loads: [load({ charges: [charge({ charge_type: 'lumper', amount: 200 })] })],
    }));
    expect(result.lines[0].amount).toBe(200);
    expect(result.lines[0].lineType).toBe('accessorial');
  });
});

describe('the per-load paperwork hold', () => {
  const incomplete = load({
    documents: [{ document_type: 'rate_confirmation' }],
  });

  it('withholds the load and states why, without holding the settlement', () => {
    const result = computeSettlement(base({ loads: [load({ id: 'ok' }), incomplete] }));
    expect(result.withheldLoads).toHaveLength(1);
    expect(result.withheldLoads[0].outstanding.length).toBeGreaterThan(0);
    expect(result.withheldLoads[0].reason).toContain('paperwork outstanding');
    expect(result.status).toBe('paid');
    expect(result.grossAmount).toBe(720); // only the complete load paid
  });

  it('a deliberate release lets the load through and says so on the line', () => {
    const result = computeSettlement(base({
      loads: [{ ...incomplete, paperworkReleased: true, paperworkReleaseReason: 'POD emailed by broker' }],
    }));
    expect(result.withheldLoads).toHaveLength(0);
    expect(result.grossAmount).toBe(720);
    expect(result.lines[0].description).toContain('released: POD emailed by broker');
  });
});

describe('fuel and the discount', () => {
  it('deducts the gross and hides the discount when pass-through is off', () => {
    const result = computeSettlement(base({
      fuel: [{ id: 'f1', grossAmount: 500, discountAmount: 40 }],
    }));
    expect(result.deductionsAmount).toBe(500);
    expect(result.lines.filter(l => l.lineType === 'fuel')).toHaveLength(1);
  });

  it('credits the discount as its own line when pass-through is on', () => {
    const result = computeSettlement(base({
      companyPolicy: { ...policy, fuel_discount_passthrough: true },
      fuel: [{ id: 'f1', grossAmount: 500, discountAmount: 40 }],
    }));
    const fuelLines = result.lines.filter(l => l.lineType === 'fuel');
    expect(fuelLines.map(l => l.amount)).toEqual([-500, 40]);
    expect(result.netAmount).toBe(720 - 500 + 40);
  });
});

describe('the Repair & Maintenance Deposit', () => {
  it('takes the weekly figure while below target', () => {
    const result = computeSettlement(base({
      rmDeposit: { id: 'rm1', currentBalance: 400 },
    }));
    const line = result.lines.find(l => l.lineType === 'rm_deposit')!;
    expect(line.amount).toBe(-200);
    expect(line.description).toContain('Repair & Maintenance Deposit');
  });

  it('takes only the shortfall on the final week and stops at target', () => {
    expect(
      computeSettlement(base({ rmDeposit: { id: 'rm1', currentBalance: 1950 } }))
        .lines.find(l => l.lineType === 'rm_deposit')!.amount,
    ).toBe(-50);
    expect(
      computeSettlement(base({ rmDeposit: { id: 'rm1', currentBalance: 2000 } }))
        .lines.find(l => l.lineType === 'rm_deposit'),
    ).toBeUndefined();
  });
});

describe('status', () => {
  it('pays when the net clears the minimum', () => {
    expect(computeSettlement(base()).status).toBe('paid');
  });

  it('marks below_threshold under the minimum and rolls the net forward', () => {
    const result = computeSettlement(base({
      loads: [load({ charges: [charge({ amount: 100 })] })], // 72
    }));
    expect(result.status).toBe('below_threshold');
    expect(result.carryForwardOut).toBe(72);
  });

  it('computes a NEGATIVE settlement rather than skipping the driver', () => {
    const result = computeSettlement(base({
      loads: [],
      deductions: [{ id: 'd1', label: 'Insurance', amount: 300 }],
    }));
    expect(result.netAmount).toBe(-300);
    expect(result.status).toBe('below_threshold');
    expect(result.carryForwardOut).toBe(-300);
  });

  it('carries a prior debt in as a visible line', () => {
    const result = computeSettlement(base({ carryForwardIn: -220 }));
    const line = result.lines.find(l => l.lineType === 'carry_forward')!;
    expect(line.amount).toBe(-220);
    expect(result.netAmount).toBe(500);
  });

  it('holds a DEPARTING driver whose coverage is under the buffer', () => {
    const result = computeSettlement(base({
      isDeparting: true,
      equipmentOutstanding: true, // 1200 exposure vs 720 net
    }));
    expect(result.status).toBe('held');
    expect(result.holdReason).toContain('equipment');
  });

  it('does not hold a departing driver whose coverage clears the buffer', () => {
    const result = computeSettlement(base({
      isDeparting: true,
      equipmentOutstanding: true,
      rmDeposit: { id: 'rm1', currentBalance: 2000 },
    }));
    expect(result.status).toBe('paid'); // 720 + 2000 − 1200 = 1520 ≥ 500
  });

  it('held wins when the settlement is ALSO under the minimum', () => {
    // Both predicates are true: net 72 is under the 100 minimum, and the
    // driver is departing with equipment out. `held` is recorded, because
    // below_threshold would roll the amount forward and DEFER the hold on
    // exactly the driver you do not want money deferred on.
    const result = computeSettlement(base({
      loads: [load({ charges: [charge({ amount: 100 })] })], // net 72
      isDeparting: true,
      equipmentOutstanding: true,
    }));
    expect(result.netAmount).toBe(72);
    expect(result.status).toBe('held');
    expect(result.carryForwardOut).toBe(0);
  });

  it('never holds a driver who is not departing, equipment out or not', () => {
    expect(computeSettlement(base({ equipmentOutstanding: true })).status).toBe('paid');
  });
});

describe('lines reconcile to the net', () => {
  it('the net is the sum of the lines and nothing else', () => {
    const result = computeSettlement(base({
      loads: [load({
        charges: [
          charge({ id: 'c1', charge_type: 'linehaul', amount: 2400 }),
          charge({ id: 'c2', charge_type: 'detention', amount: 90 }),
        ],
      })],
      fuel: [{ id: 'f1', grossAmount: 612.34 }],
      advances: [{ id: 'a1', repaymentAmount: 100 }],
      deductions: [{ id: 'd1', label: 'Trailer rent', amount: 175, installmentNote: 'payment 2 of 6' }],
      rmDeposit: { id: 'rm1', currentBalance: 0 },
      carryForwardIn: -50,
    }));
    const sum = Math.round(result.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    expect(result.netAmount).toBe(sum);
    expect(result.lines.find(l => l.sourceTable === 'deductions')!.description)
      .toBe('Trailer rent — payment 2 of 6');
  });
});
