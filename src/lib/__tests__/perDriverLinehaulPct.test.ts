/**
 * PER-DRIVER PAY, PASS 3 — the driver's OWN linehaul percentage, and nothing else.
 *
 * P38: a settlement pays a driver's LINEHAUL from HIS percentage; every other
 * rate keeps following the company pay policy. The whole risk of this pass is a
 * per-driver override that leaks sideways — detention paid at his linehaul share,
 * or a per-ton load silently re-rated — so every test below pins one column and
 * asserts the others did NOT move.
 *
 * P41: the percentage is resolved against the PERIOD being settled, never
 * against today, so recomputing a past week pays what that week was owed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PayPolicyRates } from '@/lib/payTreatment';
import {
  linehaulPctByOperator, resolveLinehaulPct, policyWithOperatorLinehaul,
} from '@/lib/operatorLinehaulPct';
import { computeSettlement, type SettlementLoadInput } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';

const policy: PayPolicyRates = {
  id: 'p1', name: 'company default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null, fuel_discount_passthrough: false,
};

describe('resolveLinehaulPct — his rate, else the company rate', () => {
  it('prefers the driver version when one is in force', () => {
    expect(resolveLinehaulPct(82, policy)).toBe(82);
  });

  it('falls back to the company version when he has none', () => {
    expect(resolveLinehaulPct(null, policy)).toBe(72);
    expect(resolveLinehaulPct(undefined, policy)).toBe(72);
  });

  it('never invents a rate when there is no company policy either', () => {
    expect(resolveLinehaulPct(null, null)).toBeNull();
  });

  it('treats a non-finite override as absent rather than as zero pay', () => {
    expect(resolveLinehaulPct(Number.NaN, policy)).toBe(72);
  });

  it('honours a deliberate 0%', () => {
    expect(resolveLinehaulPct(0, policy)).toBe(0);
  });
});

describe('policyWithOperatorLinehaul — ONE column, not the policy', () => {
  it('replaces linehaul_pct and leaves every other rate alone', () => {
    const p = policyWithOperatorLinehaul(policy, 82)!;
    expect(p.linehaul_pct).toBe(82);
    expect(p.detention_pct).toBe(100);
    expect(p.lumper_reimbursement_pct).toBe(100);
    expect(p.fsc_pct).toBe(72);
    expect(p.per_ton_pct).toBe(72);
    expect(p.tonu_pct).toBe(72);
  });

  it('returns the policy untouched when he has no version', () => {
    expect(policyWithOperatorLinehaul(policy, null)).toBe(policy);
  });
});

describe('linehaulPctByOperator — the version in force, later start wins', () => {
  it('keeps the later effective_from when a driver has more than one row', () => {
    const map = linehaulPctByOperator([
      { operator_id: 'a', pct: 72, effective_from: '2000-01-01', effective_to: '2026-09-15' },
      { operator_id: 'a', pct: 82, effective_from: '2026-09-16', effective_to: null },
      { operator_id: 'b', pct: 70, effective_from: '2026-01-01', effective_to: null },
    ]);
    expect(map).toEqual({ a: 82, b: 70 });
  });

  it('reads a numeric(5,2) arriving as a string', () => {
    const map = linehaulPctByOperator([
      { operator_id: 'a', pct: '82.00' as unknown as number, effective_from: '2026-09-16', effective_to: null },
    ]);
    expect(map.a).toBe(82);
  });
});

const load = (over: Partial<SettlementLoadInput> = {}): SettlementLoadInput => ({
  id: 'l1', loadNumber: 'ST-1', loadType: 'standard', rateType: 'flat',
  deliveredAt: '2026-08-18T21:10:00+00:00', linehaulRate: 1000,
  charges: [], documents: [], exceptions: [], paperworkReleased: true,
  ...over,
} as SettlementLoadInput);

const run = (operatorLinehaulPct: number | null, loads = [load()]) => computeSettlement({
  operatorId: 'op', periodAnchorDate: '2026-08-12',
  settings: SETTLEMENT_SETTINGS_DEFAULTS, companyPolicy: policy,
  operatorLinehaulPct, loads, equipmentOutstanding: false,
});

const lineFor = (r: ReturnType<typeof run>, match: RegExp) =>
  r.lines.find((l) => match.test(l.description ?? ''));

describe('the settlement engine pays linehaul from HIS percentage', () => {
  it('pays 82% of the line haul to a driver on his own version', () => {
    const at72 = run(null);
    const at82 = run(82);
    expect(lineFor(at72, /Linehaul/)?.amount).toBe(720);
    expect(lineFor(at82, /Linehaul/)?.amount).toBe(820);
  });

  it('does NOT move any other rate with him', () => {
    const charges = [{
      id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'detention',
      description: null, amount: 200, source: null, funding_source: null,
      actual_cost: null, proof_document_id: null,
    }];
    const at82 = run(82, [load({ charges: charges as never })]);
    // Detention is 100% of 200 whatever his linehaul share is.
    expect(lineFor(at82, /detention/i)?.amount).toBe(200);
  });

  it('leaves a per-ton load on the company per_ton rate', () => {
    // A per-ton load's revenue is not line haul; his linehaul version must not
    // reach it, or a hopper-bottom week would be paid on the wrong column.
    const perTon = load({
      rateType: 'per_ton', loadType: 'per_ton', linehaulRate: null,
      ratePerTon: 10, confirmedTons: 100,
    } as Partial<SettlementLoadInput>);
    const at82 = run(82, [perTon]);
    const at72 = run(null, [perTon]);
    expect(at82.grossAmount).toBe(at72.grossAmount);
  });
});

describe('the run resolves his version against the WEEK, not against today', () => {
  const src = readFileSync('src/lib/settlementRun.ts', 'utf8');

  it('reads operator_linehaul_pct_versions as of the period start', () => {
    expect(src).toContain('operatorLinehaulVersionsQuery(sb, period.periodStart)');
  });

  it('does not reach for today, and does not read the convenience mirror', () => {
    expect(src).not.toContain('operatorLinehaulVersionsQuery(sb, todayAsOf()');
    expect(src).not.toMatch(/select\([^)]*pay_percentage/);
  });

  it('hands the resolved percentage to the engine', () => {
    expect(src).toContain('operatorLinehaulPct: operatorLinehaulPcts[operatorId] ?? null');
  });
});
