import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { gatedIt, skipBanner } from '@/test/helpers/gate';
import {
  computeSettlement,
  CLAIM_HOLD_DRIVER_MESSAGE,
  type SettlementComputeInput,
  type SettlementLoadInput,
} from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
import type { PayPolicyRates } from '@/lib/payTreatment';

/**
 * THE CLAIM HOLD STOPS MONEY.
 *
 * Recorded as a LIVE GAP in docs/tms-build-status.md: the rule "HOLD — stop
 * settlement, engine auto-skips" was documented and implemented nowhere in the
 * settlement path, and ST-TEST-005 settled at 1350.00 while carrying an active
 * damaged-goods HOLD. These tests are the gap written down as behaviour.
 *
 * Exclusion is at the LOAD level, like the paperwork hold; the rest of the
 * week settles. There is NO deliberate release — a claim hold is cleared by
 * resolving the claim.
 */

const policy: PayPolicyRates = {
  id: 'p', name: 'Company default',
  linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
  stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72,
  other_accessorial_pct: 72, charge_pay_classes: null, fuel_discount_passthrough: false,
};

const load = (over: Partial<SettlementLoadInput> = {}): SettlementLoadInput => ({
  id: 'l1', loadNumber: 'ST-1000', loadType: 'standard', rateType: 'flat',
  deliveredAt: '2026-08-17T15:00:00Z',
  linehaulRate: 1000,
  charges: [],
  documents: [
    { document_type: 'rate_confirmation' }, { document_type: 'bol' },
    { document_type: 'pod' },
  ],
  exceptions: [],
  ...over,
});

const run = (loads: SettlementLoadInput[], over: Partial<SettlementComputeInput> = {}) =>
  computeSettlement({
    operatorId: 'op-1', periodAnchorDate: '2026-08-18',
    settings: SETTLEMENT_SETTINGS_DEFAULTS, companyPolicy: policy,
    loads, ...over,
  });

const hold = { flagLevel: 'hold', isActive: true, resolvedAt: null, claimType: 'damaged_goods' };

describe('a claim at HOLD excludes the load', () => {
  it('withholds it and names the claim as the reason', () => {
    const r = run([load({ claims: [hold] })]);
    expect(r.grossAmount).toBe(0);
    expect(r.withheldLoads).toHaveLength(1);
    expect(r.withheldLoads[0].reasons.map(x => x.code)).toEqual(['claim_hold']);
    expect(r.withheldLoads[0].reason).toContain(CLAIM_HOLD_DRIVER_MESSAGE);
  });

  it('the driver-facing wording is neutral — no dispute detail leaks', () => {
    const r = run([load({ claims: [hold] })]);
    const text = JSON.stringify(r.withheldLoads);
    expect(text).toContain('One of your loads is under review.');
    expect(text.toLowerCase()).not.toContain('damaged');
  });

  it('WATCH does not exclude', () => {
    const r = run([load({ claims: [{ ...hold, flagLevel: 'watch' }] })]);
    expect(r.withheldLoads).toHaveLength(0);
    expect(r.grossAmount).toBe(720);
  });

  it('an inactive or resolved HOLD does not exclude', () => {
    expect(run([load({ claims: [{ ...hold, isActive: false }] })]).grossAmount).toBe(720);
    expect(
      run([load({ claims: [{ ...hold, resolvedAt: '2026-08-20T00:00:00Z' }] })]).grossAmount,
    ).toBe(720);
  });

  it('the rest of the week settles around the held load', () => {
    const r = run([
      load({ id: 'a', loadNumber: 'ST-A' }),
      load({ id: 'b', loadNumber: 'ST-B', claims: [hold] }),
    ]);
    expect(r.grossAmount).toBe(720);
    expect(r.withheldLoads.map(w => w.loadNumber)).toEqual(['ST-B']);
    expect(r.consideredLoadIds).toEqual(['a', 'b']);
  });

  it('a paperwork release does NOT release a claim hold', () => {
    const r = run([load({ documents: [], paperworkReleased: true, claims: [hold] })]);
    expect(r.grossAmount).toBe(0);
    expect(r.withheldLoads[0].reasons.map(x => x.code)).toEqual(['claim_hold']);
  });

  it('paperwork AND claim report BOTH reasons, not one', () => {
    const r = run([load({ documents: [{ document_type: 'rate_confirmation' }], claims: [hold] })]);
    const w = r.withheldLoads[0];
    expect(w.reasons.map(x => x.code)).toEqual(['paperwork', 'claim_hold']);
    expect(w.reason).toContain('paperwork outstanding');
    expect(w.reason).toContain(CLAIM_HOLD_DRIVER_MESSAGE);
    expect(w.outstanding.length).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ */
/* The reported gap, with the real load                                */
/* ------------------------------------------------------------------ */

const HAS_DB = Boolean(process.env.PGHOST);

if (!HAS_DB) {
  skipBanner('settlementClaimHold.test.ts LIVE CHECK DID NOT RUN', [
    'No PGHOST, so the real ST-TEST-005 claim row could not be read.',
    'The pure tests above still cover the rule.',
  ]);
}

const itLive = gatedIt({
  enabled: HAS_DB,
  reason: 'no PGHOST, so the real ST-TEST-005 claim row could not be read',
  details: ['Only this file settles the reported gap against the real load.'],
});

function psql(sql: string): string[] {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map(l => l.trim()).filter(Boolean);
}

describe('ST-TEST-005 — the reported gap', () => {
  itLive('does NOT settle while its damaged-goods HOLD is active', () => {
    const [row] = psql(`
      select l.linehaul_rate || '|' || coalesce(l.rate_type::text,'') || '|' || to_char(l.delivered_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
        from loads l where l.load_number = 'ST-TEST-005'
    `);
    expect(row, 'ST-TEST-005 must exist').toBeTruthy();
    const [linehaulRate, rateType, deliveredAt] = row.split('|');

    const claims = psql(`
      select cf.flag_level || '|' || cf.is_active || '|' || coalesce(cf.resolved_at::text,'')
             || '|' || cf.claim_type
        from claim_flags cf join loads l on l.id = cf.load_id
       where l.load_number = 'ST-TEST-005'
    `).map(c => {
      const [flagLevel, isActive, resolvedAt, claimType] = c.split('|');
      return { flagLevel, isActive: isActive === 't' || isActive === 'true', resolvedAt: resolvedAt || null, claimType };
    });

    expect(claims.some(c => c.flagLevel === 'hold' && c.isActive)).toBe(true);

    const r = run([{
      id: 'st-test-005', loadNumber: 'ST-TEST-005', loadType: 'standard',
      rateType, linehaulRate: Number(linehaulRate),
      deliveredAt,
      charges: [], documents: [], exceptions: [],
      // Even with the paperwork hold deliberately released, the claim stands.
      paperworkReleased: true,
      claims,
    }]);

    // Before this change the same load settled at 1350.00 (1875 × 72%).
    expect(r.grossAmount).toBe(0);
    expect(r.withheldLoads.map(w => w.loadNumber)).toEqual(['ST-TEST-005']);
    expect(r.withheldLoads[0].reasons.map(x => x.code)).toContain('claim_hold');
  });
});
