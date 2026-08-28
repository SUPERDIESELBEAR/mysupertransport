import { describe, expect, it } from 'vitest';
import { estimateDriverLoadPay } from '@/lib/driverLoadPay';
import type { PayPolicyRates } from '@/lib/payTreatment';
import type { LoadChargeRecord } from '@/lib/loadCharges';

const policy: PayPolicyRates = {
  id: 'p1', name: 'Company Default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, charge_pay_classes: null,
};

const charge = (over: Partial<LoadChargeRecord>): LoadChargeRecord => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  load_id: 'l1', load_stop_id: null, charge_type: 'linehaul',
  description: null, amount: 0, source: 'rate_con',
  funding_source: null, actual_cost: null, proof_document_id: null,
  ...over,
});

describe('estimateDriverLoadPay', () => {
  it('pays revenue charges at their policy percentage', () => {
    const r = estimateDriverLoadPay([
      charge({ charge_type: 'linehaul', amount: 2000 }),
      charge({ charge_type: 'fsc', amount: 200 }),
      charge({ charge_type: 'detention', amount: 150 }),
    ], policy);
    // 1440 + 144 + 150
    expect(r.amount).toBe(1734);
    expect(r.incomplete).toBe(false);
  });

  it('reimburses a driver-funded charge at actual cost, not at a percentage', () => {
    const r = estimateDriverLoadPay([
      charge({ charge_type: 'reimbursement', amount: 100, funding_source: 'driver', actual_cost: 85 }),
    ], policy);
    expect(r.amount).toBe(85);
  });

  it('pays the driver nothing for a company-funded reimbursement', () => {
    const r = estimateDriverLoadPay([
      charge({ charge_type: 'reimbursement', amount: 100, funding_source: 'company', actual_cost: 100 }),
    ], policy);
    expect(r.amount).toBe(0);
    expect(r.incomplete).toBe(false);
  });

  it('flags an unconfirmed driver reimbursement instead of guessing it', () => {
    const r = estimateDriverLoadPay([
      charge({ charge_type: 'linehaul', amount: 1000 }),
      charge({ charge_type: 'reimbursement', amount: 60, funding_source: 'driver', actual_cost: null }),
    ], policy);
    expect(r.amount).toBe(720);
    expect(r.incomplete).toBe(true);
  });

  it('shows no figure at all when no policy is readable', () => {
    const r = estimateDriverLoadPay([charge({ charge_type: 'linehaul', amount: 1000 })], null);
    expect(r.amount).toBeNull();
  });

  it('honours a policy that reclassifies lumper as a reimbursement', () => {
    const reclassified: PayPolicyRates = {
      ...policy, charge_pay_classes: { lumper: 'reimbursement' },
    };
    const r = estimateDriverLoadPay([
      charge({ charge_type: 'lumper', amount: 90, funding_source: 'driver', actual_cost: 75 }),
    ], reclassified);
    expect(r.amount).toBe(75);
  });
});
