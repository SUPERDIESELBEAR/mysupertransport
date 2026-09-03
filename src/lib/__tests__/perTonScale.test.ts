import { describe, it, expect } from 'vitest';
import { computeSettlement } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import { calcTotalLoadValue } from '@/lib/loadRateMath';
import { isAwaitingScaleTicket } from '@/lib/perTonScale';
import type { PayPolicyRates } from '@/lib/payTreatment';

const policy: PayPolicyRates = {
  id: 'p', name: 'Company default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null, fuel_discount_passthrough: false,
};

const perTonLoad = (over: Record<string, unknown> = {}) => ({
  id: 'l1', loadNumber: 'ST-TEST-003', loadType: 'per_ton', rateType: 'per_ton',
  deliveredAt: '2026-08-18T21:10:00Z',
  ratePerTon: 18.5, estimatedTons: 24, confirmedTons: 24.62,
  charges: [],
  documents: [{ document_type: 'pod' }, { document_type: 'scale_ticket' }],
  exceptions: [],
  ...over,
});

const run = (load: Record<string, unknown>) => computeSettlement({
  operatorId: 'op-1', periodAnchorDate: '2026-08-18',
  settings: SETTLEMENT_SETTINGS_DEFAULTS, companyPolicy: policy,
  loads: [load as never],
});

describe('per-ton pays on the scale ticket', () => {
  it('settles from confirmed tons, not estimated', () => {
    const r = run(perTonLoad());
    // 18.50 × 24.62 = 455.47 × 72% = 327.94. Estimated (444.00) would give 319.68.
    expect(r.grossAmount).toBe(327.94);
    expect(r.pendingScaleTicketLoads).toHaveLength(0);
  });

  it('ST-TEST-003 totals 455.47 in the client total and settles off the same base', () => {
    // THE REPORTED DIVERGENCE: the SQL previously multiplied estimated tons and
    // would have rewritten this load's stored 455.47 down to 444.00.
    expect(calcTotalLoadValue({
      loadType: 'per_ton', rateType: 'per_ton', ratePerTon: 18.5,
      estimatedTons: 24, confirmedTons: 24.62,
    })).toBe(455.47);
    expect(run(perTonLoad()).lines[0].amount).toBe(327.94);
  });

  it('falls back to estimated tons for the load TOTAL while unscaled', () => {
    expect(calcTotalLoadValue({
      loadType: 'per_ton', rateType: 'per_ton', ratePerTon: 18.5, estimatedTons: 24,
    })).toBe(444);
  });

  it('pays NO linehaul without a ticket, and names the load as pending', () => {
    const r = run(perTonLoad({ confirmedTons: null, paperworkReleased: true, documents: [] }));
    expect(r.grossAmount).toBe(0);
    expect(r.pendingScaleTicketLoads.map(l => l.loadNumber)).toEqual(['ST-TEST-003']);
  });

  it('still pays accessorials on an unscaled load', () => {
    const r = run(perTonLoad({
      confirmedTons: null,
      charges: [{
        id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'detention',
        description: null, amount: 150, source: 'manual', funding_source: null,
        actual_cost: null, proof_document_id: null,
      }],
    }));
    expect(r.grossAmount).toBe(150);
  });

  it('surfaces the gap only on a delivered per-ton load with no confirmed tons', () => {
    expect(isAwaitingScaleTicket({ rate_type: 'per_ton', confirmed_tons: null, delivered_at: '2026-08-18T21:10:00Z' })).toBe(true);
    expect(isAwaitingScaleTicket({ rate_type: 'per_ton', confirmed_tons: 24.62, delivered_at: '2026-08-18T21:10:00Z' })).toBe(false);
    expect(isAwaitingScaleTicket({ rate_type: 'per_ton', confirmed_tons: null, delivered_at: null })).toBe(false);
    expect(isAwaitingScaleTicket({ rate_type: 'flat', confirmed_tons: null, delivered_at: '2026-08-18T21:10:00Z' })).toBe(false);
  });
});
