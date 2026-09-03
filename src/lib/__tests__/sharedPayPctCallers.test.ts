/**
 * (a) THE SPY LAYER — the consumers CALL the shared logic.
 *
 * Section 4.7 accepted two settlement systems on the condition that a test
 * asserts the consuming path calls the shared functions rather than
 * re-deriving them. The document records seven instances of correct code with
 * no caller on the path that mattered, so intent is not evidence: zero
 * invocations must FAIL.
 *
 * Layers (b) and (c) live in `src/test/shared-pay-percentage-source-guard.test.ts`
 * and `sharedPayPct.test.ts`.
 *
 * PASS 3 EXTENSION: the dispatch settlement consumer does not exist yet. These
 * assertions are written against the driver-side path and the month helpers.
 * When Pass 3 adds the dispatch computation function, the `pctForClassification`
 * block below gains a dispatch case, and the `inCalendarMonth` block moves from
 * asserting the helper's own carrier-zone plumbing to asserting the dispatch
 * consumer invokes it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PayPolicyRates } from '@/lib/payTreatment';
import type { LoadChargeRecord } from '@/lib/loadCharges';

vi.mock('@/lib/payTreatment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payTreatment')>();
  return { ...actual, pctForClassification: vi.fn(actual.pctForClassification) };
});

vi.mock('@/lib/carrierTimezone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/carrierTimezone')>();
  return { ...actual, isoToNaive: vi.fn(actual.isoToNaive) };
});

const { pctForClassification } = await import('@/lib/payTreatment');
const { isoToNaive } = await import('@/lib/carrierTimezone');
const { estimateDriverLoadPay } = await import('@/lib/driverLoadPay');
const { computeSettlement, type SettlementLoadInput } = await import('@/lib/settlementEngine');
const { SETTLEMENT_SETTINGS_DEFAULTS } = await import('@/lib/settlementConfig');
const { monthOf, inCalendarMonth } = await import('@/lib/settlementPeriod');

const spy = vi.mocked(pctForClassification);
const tzSpy = vi.mocked(isoToNaive);

const policy: PayPolicyRates = {
  id: 'p1', name: 'fixture',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: null, fuel_discount_passthrough: false,
};

const charge = (over: Partial<LoadChargeRecord>): LoadChargeRecord => ({
  id: 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'linehaul',
  description: null, amount: 0, source: null, funding_source: null,
  actual_cost: null, proof_document_id: null, ...over,
});

const run = (load: Partial<SettlementLoadInput>) => computeSettlement({
  operatorId: 'op', periodAnchorDate: '2026-08-12',
  settings: SETTLEMENT_SETTINGS_DEFAULTS, companyPolicy: policy,
  loads: [{
    id: 'l1', loadNumber: 'ST-1', loadType: 'standard', rateType: 'flat',
    deliveredAt: '2026-08-18T21:10:00+00:00', charges: [],
    documents: [], exceptions: [], paperworkReleased: true, ...load,
  } as SettlementLoadInput],
});

beforeEach(() => { spy.mockClear(); tzSpy.mockClear(); });

describe('the settlement engine calls the shared percentage resolver', () => {
  it('resolves a per-ton linehaul through pctForClassification("per_ton")', () => {
    run({ rateType: 'per_ton', loadType: 'per_ton', ratePerTon: 10, confirmedTons: 5 });
    expect(spy).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('per_ton', policy);
  });

  it('resolves a loadout through pctForClassification("loadout")', () => {
    run({ loadType: 'loadout', loadoutRelocationFee: 100 });
    expect(spy).toHaveBeenCalledWith('loadout', policy);
  });

  it('resolves a charge through pctForClassification with its classification', () => {
    run({ linehaulRate: 0, charges: [charge({ charge_type: 'detention', amount: 100 })] });
    expect(spy).toHaveBeenCalledWith('detention', policy);
  });
});

describe('the driver-facing estimate calls the same resolver', () => {
  it('does not re-derive the column for itself', () => {
    estimateDriverLoadPay([charge({ charge_type: 'stopoff', amount: 100 })], policy);
    expect(spy).toHaveBeenCalledWith('stopoff', policy);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('the month helpers resolve through the carrier timezone', () => {
  it('monthOf reads the instant through isoToNaive, never a local Date', () => {
    expect(monthOf('2026-09-01T04:30:00Z')).toBe('2026-08'); // 11:30pm Aug 31 Central
    expect(tzSpy).toHaveBeenCalledWith('2026-09-01T04:30:00Z');
  });

  it('inCalendarMonth goes through the same path', () => {
    tzSpy.mockClear();
    expect(inCalendarMonth('2026-09-01T04:30:00Z', '2026-08')).toBe(true);
    expect(inCalendarMonth('2026-09-01T04:30:00Z', '2026-09')).toBe(false);
    expect(tzSpy).toHaveBeenCalled();
  });

  it('an unreadable instant is in no month at all', () => {
    expect(monthOf(null)).toBe('');
    expect(inCalendarMonth(null, '2026-08')).toBe(false);
    expect(inCalendarMonth('nonsense', '2026-08')).toBe(false);
  });
});
