/**
 * ONE percentage map, and the two columns that were read by nothing.
 *
 * Until 2026-09-03 the classification-to-column map existed THREE times:
 * `payTreatment.ts`, `settlementEngine.ts` and `driverLoadPay.ts`. All three
 * agreed key for key, which is the danger rather than the comfort — the map
 * behind the figure a driver is SHOWN and the map behind what he is PAID were
 * separate objects that happened to match.
 *
 * `per_ton_pct` and `loadout_pct` are NOT NULL DEFAULT 72.00 on `pay_policies`
 * and were read by nothing; per-ton freight and loadouts were both paid at
 * `linehaul_pct`. All three columns are 72.00 today, so wiring them must move
 * NO figure. These tests prove both halves: nothing moves at 72, and the wiring
 * is nonetheless real.
 */
import { describe, it, expect } from 'vitest';
import { pctForClassification, payTreatment, type PayPolicyRates } from '@/lib/payTreatment';
import { estimateDriverLoadPay } from '@/lib/driverLoadPay';
import { computeSettlement, type SettlementLoadInput, type SettlementComputeInput } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import type { LoadChargeRecord } from '@/lib/loadCharges';

/**
 * The live company default, read from `pay_policies` on 2026-09-03
 * (id 98041ec0-a786-4f72-b359-46fb8e12c17e). Copied field for field, including
 * the two columns this pass wires.
 */
const LIVE_COMPANY_POLICY: PayPolicyRates = {
  id: '98041ec0-a786-4f72-b359-46fb8e12c17e',
  name: 'SUPERTRANSPORT Standard',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, per_ton_pct: 72, loadout_pct: 72,
  charge_pay_classes: {
    linehaul: 'revenue', fsc: 'revenue', detention: 'revenue', stopoff: 'revenue',
    lumper: 'revenue', layover: 'revenue', tonu: 'revenue', other: 'revenue',
    reimbursement: 'reimbursement',
  },
  fuel_discount_passthrough: false,
};

const charge = (over: Partial<LoadChargeRecord>): LoadChargeRecord => ({
  id: over.id ?? 'c1', load_id: 'l1', load_stop_id: null, charge_type: 'linehaul',
  description: null, amount: 0, source: null, funding_source: null,
  actual_cost: null, proof_document_id: null, ...over,
});

/* ------------------------------------------------------------------ */
/* The shared resolver                                                 */
/* ------------------------------------------------------------------ */

describe('pctForClassification — the one map', () => {
  it('resolves every charge classification from the policy in force', () => {
    const p = LIVE_COMPANY_POLICY;
    expect(pctForClassification('linehaul', p)).toBe(72);
    expect(pctForClassification('fsc', p)).toBe(72);
    expect(pctForClassification('detention', p)).toBe(100);
    expect(pctForClassification('layover', p)).toBe(100);
    expect(pctForClassification('lumper', p)).toBe(100);
    expect(pctForClassification('stopoff', p)).toBe(72);
    expect(pctForClassification('tonu', p)).toBe(72);
    expect(pctForClassification('other', p)).toBe(72);
    expect(pctForClassification('reimbursement', p)).toBe(72);
  });

  it('resolves the two header-rate keys from their OWN columns', () => {
    const p = { ...LIVE_COMPANY_POLICY, per_ton_pct: 60, loadout_pct: 50 };
    expect(pctForClassification('per_ton', p)).toBe(60);
    expect(pctForClassification('loadout', p)).toBe(50);
  });

  it('shows nothing rather than guessing when no policy is readable', () => {
    expect(pctForClassification('linehaul', null)).toBeNull();
    expect(payTreatment('linehaul', null)).toEqual({ kind: 'unknown', label: null });
  });

  it('returns NULL for an absent header column — never the linehaul share', () => {
    // Absence means a partial column selection, which is a query defect. It is
    // not repaired here with a plausible number: see the note on
    // `pctForClassification`.
    const partial = { ...LIVE_COMPANY_POLICY } as PayPolicyRates;
    delete (partial as unknown as Record<string, unknown>).per_ton_pct;
    delete (partial as unknown as Record<string, unknown>).loadout_pct;
    expect(pctForClassification('per_ton', partial)).toBeNull();
    expect(pctForClassification('loadout', partial)).toBeNull();
    expect(pctForClassification('linehaul', partial)).toBe(72);
  });

  it('a non-numeric header column is null too, not a stand-in', () => {
    const junk = { ...LIVE_COMPANY_POLICY, loadout_pct: null } as PayPolicyRates;
    expect(pctForClassification('loadout', junk)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The retained Pratt settlement — nothing moves                       */
/* ------------------------------------------------------------------ */

/**
 * Settlement f77911b0-50cd-4ae3-bff2-ebb0bc4331af, operator
 * f2051752-5311-4c1f-b88c-79773e7ed9e5, period 2026-08-12 → 2026-08-18, status
 * `paid` and immutable. Its inputs are copied from the live rows; it is
 * recomputed IN MEMORY and compared. Nothing here writes to it.
 *
 * One stored line: `Load ST-TEST-003 — Linehaul (per ton, from scale ticket)`
 * at 327.94. Net 327.94. 18.50 × 24.62 × 0.72 = 327.9384.
 *
 * This settlement is per-ton, so it is precisely the settlement this pass could
 * have moved.
 */
const PRATT_LOAD: SettlementLoadInput = {
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

const prattInput = (policy: PayPolicyRates): SettlementComputeInput => ({
  operatorId: 'f2051752-5311-4c1f-b88c-79773e7ed9e5',
  periodAnchorDate: '2026-08-12',
  settings: SETTLEMENT_SETTINGS_DEFAULTS,
  companyPolicy: policy,
  loads: [PRATT_LOAD],
  equipmentOutstanding: false,
});

describe('the retained Pratt settlement is unchanged by this pass', () => {
  it('recomputes to the same single line and the same net', () => {
    const r = computeSettlement(prattInput(LIVE_COMPANY_POLICY));
    expect(r.period.periodStart).toBe('2026-08-12');
    expect(r.period.periodEnd).toBe('2026-08-18');
    expect(r.lines).toEqual([{
      lineType: 'load_pay',
      amount: 327.94,
      description: 'Load ST-TEST-003 — Linehaul (per ton, from scale ticket)',
      sourceTable: 'loads',
      sourceId: 'c222d62f-3b9d-41a1-8979-be760e43e11b',
    }]);
    expect(r.grossAmount).toBe(327.94);
    expect(r.deductionsAmount).toBe(0);
    expect(r.netAmount).toBe(327.94);
  });

  it('is identical to what linehaul_pct produced before per_ton_pct was wired', () => {
    // Pre-wiring the per-ton linehaul was valued at `linehaul_pct`. Both are 72,
    // so the figure must not move. Modelled by moving the VALUE, not by relying
    // on a fallback — an absent column now yields null, by design.
    const preWiring = { ...LIVE_COMPANY_POLICY, per_ton_pct: LIVE_COMPANY_POLICY.linehaul_pct };
    expect(computeSettlement(prattInput(preWiring)).netAmount).toBe(327.94);
    expect(computeSettlement(prattInput(LIVE_COMPANY_POLICY)).netAmount).toBe(327.94);
  });
});

/* ------------------------------------------------------------------ */
/* The wiring is real                                                  */
/* ------------------------------------------------------------------ */

const loadout = (fee: number): SettlementLoadInput => ({
  id: 'lo-1', loadNumber: 'ST-LO-1', loadType: 'loadout',
  rateType: 'flat', deliveredAt: '2026-08-18T21:10:00+00:00',
  loadoutRelocationFee: fee, charges: [],
  documents: [], exceptions: [], paperworkReleased: true,
});

const perTon = (): SettlementLoadInput => ({ ...PRATT_LOAD, id: 'pt-1', loadNumber: 'ST-PT-1' });

const netOf = (load: SettlementLoadInput, policy: PayPolicyRates) =>
  computeSettlement({ ...prattInput(policy), loads: [load] }).netAmount;

describe('per_ton_pct and loadout_pct genuinely govern the money', () => {
  it('loadout_pct at 50 pays half the relocation fee', () => {
    expect(netOf(loadout(1000), LIVE_COMPANY_POLICY)).toBe(720);
    expect(netOf(loadout(1000), { ...LIVE_COMPANY_POLICY, loadout_pct: 50 })).toBe(500);
  });

  it('a loadout does NOT follow linehaul_pct once its own column is set', () => {
    const p = { ...LIVE_COMPANY_POLICY, loadout_pct: 50, linehaul_pct: 90 };
    expect(netOf(loadout(1000), p)).toBe(500);
  });

  it('per_ton_pct at 60 pays 60% of rate × confirmed tons', () => {
    // 18.50 × 24.62 = 455.47
    expect(netOf(perTon(), { ...LIVE_COMPANY_POLICY, per_ton_pct: 60 })).toBe(273.28);
  });

  it('a per-ton load does NOT follow linehaul_pct once its own column is set', () => {
    const p = { ...LIVE_COMPANY_POLICY, per_ton_pct: 60, linehaul_pct: 90 };
    expect(netOf(perTon(), p)).toBe(273.28);
  });

  it('a flat load still reads linehaul_pct, not per_ton_pct', () => {
    const flat: SettlementLoadInput = {
      ...loadout(0), id: 'f-1', loadNumber: 'ST-F-1', loadType: 'standard',
      rateType: 'flat', linehaulRate: 1000, loadoutRelocationFee: null,
    };
    expect(netOf(flat, { ...LIVE_COMPANY_POLICY, per_ton_pct: 10, loadout_pct: 10 })).toBe(720);
  });
});

/* ------------------------------------------------------------------ */
/* (c) BEHAVIOURAL COUPLING — the layer a hardcoded list fails          */
/* ------------------------------------------------------------------ */

describe('behavioural coupling — the figure follows the policy, both sides', () => {
  const detentionLoad = (): SettlementLoadInput => ({
    ...loadout(0), id: 'd-1', loadNumber: 'ST-D-1', loadType: 'standard',
    rateType: 'flat', linehaulRate: 0, loadoutRelocationFee: null,
    charges: [charge({ id: 'd-c', charge_type: 'detention', amount: 200 })],
  });

  it('settlement: detention_pct 100 → 72 changes the figure', () => {
    expect(netOf(detentionLoad(), LIVE_COMPANY_POLICY)).toBe(200);
    expect(netOf(detentionLoad(), { ...LIVE_COMPANY_POLICY, detention_pct: 72 })).toBe(144);
  });

  it('driver-facing estimate: detention_pct 100 → 72 changes the figure', () => {
    const charges = [charge({ id: 'd-c', charge_type: 'detention', amount: 200 })];
    expect(estimateDriverLoadPay(charges, LIVE_COMPANY_POLICY).amount).toBe(200);
    expect(estimateDriverLoadPay(charges, { ...LIVE_COMPANY_POLICY, detention_pct: 72 }).amount).toBe(144);
  });

  it('the two sides agree, because they resolve through the same map', () => {
    const charges = [
      charge({ id: 'a', charge_type: 'detention', amount: 200 }),
      charge({ id: 'b', charge_type: 'stopoff', amount: 50 }),
    ];
    const p = { ...LIVE_COMPANY_POLICY, detention_pct: 85, stopoff_pct: 65 };
    const shown = estimateDriverLoadPay(charges, p).amount;
    const settled = netOf({
      ...loadout(0), id: 'x', loadNumber: 'ST-X-1', loadType: 'standard',
      rateType: 'flat', linehaulRate: 0, loadoutRelocationFee: null, charges,
    }, p);
    expect(shown).toBe(settled);
  });
});
