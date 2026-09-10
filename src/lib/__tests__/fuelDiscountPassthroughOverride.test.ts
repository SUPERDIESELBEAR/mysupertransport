import { describe, it, expect } from 'vitest';
import {
  computeSettlement,
  type SettlementComputeInput, type SettlementLoadInput,
} from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import type { PayPolicyRates } from '@/lib/payTreatment';

/**
 * THE PER-DRIVER FUEL DISCOUNT PASS-THROUGH SETTING.
 *
 * FIXTURE EVIDENCE. No settlement has ever run against fuel — the 69 committed
 * transactions carrying $533.63 of discount across 39 rows are all undeducted —
 * so the credit line cannot be observed in a real settlement. These fixtures
 * model it.
 */

const policy = (passthrough: boolean): PayPolicyRates => ({
  id: 'p-default', name: 'Company default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null,
  fuel_discount_passthrough: passthrough,
});

const load: SettlementLoadInput = {
  id: 'l1', loadNumber: 'ST-1000', loadType: 'standard',
  deliveredAt: '2026-09-03T15:00:00Z',
  charges: [{
    id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'linehaul',
    description: null, amount: 1000, source: null, funding_source: null,
    actual_cost: null, proof_document_id: null,
  }],
  documents: [
    { document_type: 'rate_confirmation' }, { document_type: 'bol' },
    { document_type: 'pod' },
  ],
  exceptions: [],
};

/** Ali Mohamed's live fuel: 3 purchases, $1,960.56 gross, -$10.16 of discount. */
const ALI_GROSS = 1960.56;
const ALI_DISCOUNT = 10.16;

const run = (
  companyPassthrough: boolean,
  override: boolean | null,
  fuel = [{ id: 'f1', grossAmount: ALI_GROSS, discountAmount: ALI_DISCOUNT }],
): ReturnType<typeof computeSettlement> => {
  const input: SettlementComputeInput = {
    operatorId: 'op-ali',
    periodAnchorDate: '2026-09-03',
    settings: SETTLEMENT_SETTINGS_DEFAULTS,
    companyPolicy: policy(companyPassthrough),
    loads: [load],
    fuel,
    equipmentOutstanding: false,
    fuelDiscountPassthroughOverride: override,
  };
  return computeSettlement(input);
};

const creditLines = (r: ReturnType<typeof computeSettlement>) =>
  r.lines.filter(l => l.lineType === 'fuel' && l.amount > 0);

describe('NULL inherits the company policy', () => {
  it('company OFF and no override — no credit line', () => {
    expect(creditLines(run(false, null))).toHaveLength(0);
  });

  it('company ON and no override — the discount is credited', () => {
    const lines = creditLines(run(true, null));
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(ALI_DISCOUNT);
    expect(lines[0].description).toBe('Fuel discount passed through');
  });
});

describe('an explicit setting beats the company policy in both directions', () => {
  it('TRUE credits the discount even when the company policy is false', () => {
    const lines = creditLines(run(false, true));
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(ALI_DISCOUNT);
  });

  it('FALSE suppresses it even when the company policy is true', () => {
    expect(creditLines(run(true, false))).toHaveLength(0);
  });
});

describe('the setting adds or removes a CREDIT LINE and never touches the deduction', () => {
  it('the fuel deduction is the identical gross in all three states', () => {
    const states = [run(false, null), run(false, true), run(true, false), run(true, null)];
    for (const r of states) {
      const deducted = r.lines
        .filter(l => l.lineType === 'fuel' && l.amount < 0)
        .reduce((t, l) => t + l.amount, 0);
      expect(Math.abs(Number(deducted.toFixed(2)))).toBe(ALI_GROSS);
      expect(r.deductionsAmount).toBe(ALI_GROSS);
    }
  });

  it("Ali's three states differ only by the $10.16 credit", () => {
    const inherit = run(false, null);   // company default is false today
    const on = run(false, true);
    const off = run(false, false);
    expect(inherit.netAmount).toBe(off.netAmount);
    expect(Number((on.netAmount - off.netAmount).toFixed(2))).toBe(ALI_DISCOUNT);
    expect(off.netAmount).toBe(Number((720 - ALI_GROSS).toFixed(2)));
    expect(on.netAmount).toBe(Number((720 - ALI_GROSS + ALI_DISCOUNT).toFixed(2)));
  });
});

describe('the retained Pratt settlement is unchanged by this pass', () => {
  it('carries no fuel, so no state of the setting moves $327.94', () => {
    const prattLoad: SettlementLoadInput = {
      id: 'c222d62f-3b9d-41a1-8979-be760e43e11b',
      loadNumber: 'ST-TEST-003',
      loadType: 'per_ton',
      rateType: 'per_ton',
      deliveredAt: '2026-08-18T21:10:00+00:00',
      ratePerTon: 18.5,
      confirmedTons: 24.62,
      estimatedTons: 24,
      loadedMiles: 187,
      fscAmount: null,
      fscBundledIntoLinehaul: null,
      charges: [],
      documents: [{ document_type: 'pod' }, { document_type: 'scale_ticket' }],
      exceptions: [],
      paperworkReleased: true,
    };
    for (const override of [null, true, false] as (boolean | null)[]) {
      const r = computeSettlement({
        operatorId: 'f2051752-5311-4c1f-b88c-79773e7ed9e5',
        periodAnchorDate: '2026-08-12',
        settings: SETTLEMENT_SETTINGS_DEFAULTS,
        companyPolicy: policy(true),
        loads: [prattLoad],
        equipmentOutstanding: false,
        fuelDiscountPassthroughOverride: override,
      });
      expect(r.lines).toHaveLength(1);
      expect(r.netAmount).toBe(327.94);
      expect(r.deductionsAmount).toBe(0);
    }
  });
});
