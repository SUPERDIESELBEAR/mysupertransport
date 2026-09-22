/**
 * PER-DRIVER PAY, PASS 4 — a settlement line SAYS what rate produced it.
 *
 * Three facts per line: the percentage, whether it came from the driver's own
 * dated version or from the company pay policy, and the id of that version. The
 * risk this file pins is a line that claims the wrong ORIGIN — detention or a
 * per-ton load labelled `driver_version` because his linehaul happened to be his
 * own that week — and a line no percentage priced (fuel, a deduction, the
 * Repair & Maintenance Deposit, a bonus paid at 100%) carrying a figure it never
 * used.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PayPolicyRates } from '@/lib/payTreatment';
import { computeSettlement, type SettlementLoadInput } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';

const policy: PayPolicyRates = {
  id: 'policy-v1', name: 'company default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null, fuel_discount_passthrough: false,
};

const detention = [{
  id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'detention',
  description: null, amount: 200, source: null, funding_source: null,
  actual_cost: null, proof_document_id: null,
}];

const load = (over: Partial<SettlementLoadInput> = {}): SettlementLoadInput => ({
  id: 'l1', loadNumber: 'ST-1', loadType: 'standard', rateType: 'flat',
  deliveredAt: '2026-08-18T21:10:00+00:00', linehaulRate: 1000,
  charges: detention as never, documents: [], exceptions: [], paperworkReleased: true,
  ...over,
} as SettlementLoadInput);

const run = (
  operatorLinehaulPct: number | null,
  operatorLinehaulVersionId: string | null,
  loads = [load()],
) => computeSettlement({
  operatorId: 'op', periodAnchorDate: '2026-08-12',
  settings: SETTLEMENT_SETTINGS_DEFAULTS, companyPolicy: policy,
  operatorLinehaulPct, operatorLinehaulVersionId, loads,
  equipmentOutstanding: false,
  fuel: [{ id: 'f1', amount: 150, discount: 0 } as never],
});

const lineFor = (r: ReturnType<typeof run>, match: RegExp) =>
  r.lines.find((l) => match.test(l.description ?? ''));

describe('a driver following the company rate', () => {
  const r = run(null, null);

  it('records the company percentage and the policy version on his linehaul', () => {
    const l = lineFor(r, /Linehaul/)!;
    expect(l.amount).toBe(720);
    expect(l.resolvedPct).toBe(72);
    expect(l.pctSource).toBe('company_policy');
    expect(l.pctVersionId).toBe('policy-v1');
  });

  it('records the company percentage on an accessorial too', () => {
    const l = lineFor(r, /detention/i)!;
    expect(l.resolvedPct).toBe(100);
    expect(l.pctSource).toBe('company_policy');
    expect(l.pctVersionId).toBe('policy-v1');
  });
});

describe('a driver the owner set on his own rate', () => {
  const r = run(82, 'driver-version-1');

  it('records HIS percentage and HIS version on the linehaul line', () => {
    const l = lineFor(r, /Linehaul/)!;
    expect(l.amount).toBe(820);
    expect(l.resolvedPct).toBe(82);
    expect(l.pctSource).toBe('driver_version');
    expect(l.pctVersionId).toBe('driver-version-1');
  });

  it('still records the COMPANY policy on detention — the override is one column', () => {
    const l = lineFor(r, /detention/i)!;
    expect(l.amount).toBe(200);
    expect(l.resolvedPct).toBe(100);
    expect(l.pctSource).toBe('company_policy');
    expect(l.pctVersionId).toBe('policy-v1');
  });

  it('leaves a per-ton load on the company column and says so', () => {
    const perTon = run(82, 'driver-version-1', [load({
      rateType: 'per_ton', loadType: 'per_ton', linehaulRate: null,
      ratePerTon: 10, confirmedTons: 100, charges: [],
    } as Partial<SettlementLoadInput>)]);
    const l = lineFor(perTon, /Linehaul \(per ton/)!;
    expect(l.resolvedPct).toBe(72);
    expect(l.pctSource).toBe('company_policy');
    expect(l.pctVersionId).toBe('policy-v1');
  });
});

describe('lines no percentage priced carry no rate record', () => {
  it('leaves fuel, the deposit and carry-forward with a null record', () => {
    const r = run(82, 'driver-version-1');
    for (const l of r.lines) {
      if (l.lineType === 'load_pay' || l.lineType === 'accessorial' || l.lineType === 'adjustment') continue;
      expect(l.resolvedPct ?? null).toBeNull();
      expect(l.pctSource ?? null).toBeNull();
      expect(l.pctVersionId ?? null).toBeNull();
    }
  });

  it('never writes a percentage without an origin, or an origin without a percentage', () => {
    const r = run(82, 'driver-version-1');
    for (const l of r.lines) {
      expect((l.resolvedPct ?? null) === null).toBe((l.pctSource ?? null) === null);
    }
  });
});

describe('the persisted shape', () => {
  const sql = readFileSync(
    'drizzle/migrations/0041_linehaul_follows_company_and_line_rate_record.sql', 'utf8',
  );

  it('the database refuses a half-record', () => {
    expect(sql).toContain('pct_source');
    expect(sql).toContain('resolved_pct');
    expect(sql).toContain('driver_version');
    expect(sql).toContain('company_policy');
  });

  it('does not backfill lines written before this pass', () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.settlement_line_items/i);
  });
});
