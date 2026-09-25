import { describe, expect, it } from 'vitest';
import { isOnChain } from '@/lib/dispatchBoard';
import { DEFAULT_DOCUMENT_REQUIREMENTS, evaluateLoadPaperwork, type DocumentRequirementSettings } from '@/lib/loadPaperwork';

/** Pass 5: the board and the settlement engine read the carrier's P79 settings. */
const delivered = { id: 'l1', load_number: 'X', status: 'delivered', load_type: 'standard', operator_id: 'o1', created_at: '2026-09-01T00:00:00Z', stops: [] } as never;
const withLumperOff = (): DocumentRequirementSettings => ({
  ...DEFAULT_DOCUMENT_REQUIREMENTS,
  rows: DEFAULT_DOCUMENT_REQUIREMENTS.rows.map(r =>
    r.document_type === 'lumper_receipt' ? { ...r, required_before_invoicing: 'no' } : r),
});

describe('board chain membership follows the settings', () => {
  it('a billed lumper without a receipt keeps a delivered load on the chain', () => {
    expect(isOnChain(delivered, [{ document_type: 'pod' }], [], DEFAULT_DOCUMENT_REQUIREMENTS, ['lumper']).onChain).toBe(true);
  });
  it('with the lumper receipt set to No, the same load leaves the chain', () => {
    expect(isOnChain(delivered, [{ document_type: 'pod' }], [], withLumperOff(), ['lumper']).onChain).toBe(false);
  });
  it('turning off "either one" requires both BOL and POD', () => {
    const both = { ...DEFAULT_DOCUMENT_REQUIREMENTS, bolOrPodEither: false };
    expect(isOnChain(delivered, [{ document_type: 'pod' }], [], both, []).onChain).toBe(true);
  });
});

describe('the settlement paperwork hold follows the settings', () => {
  it('matches the pure rule the engine calls', () => {
    const r = evaluateLoadPaperwork('standard', [{ document_type: 'pod' }], [], withLumperOff(), { lumperBilled: true });
    expect(r.complete).toBe(true);
  });
});

import { computeSettlement } from '@/lib/settlementEngine';
import { SETTLEMENT_SETTINGS_DEFAULTS } from '@/lib/settlementConfig';
describe('computeSettlement documentSettings', () => {
  const base = (documentSettings: DocumentRequirementSettings | null) => computeSettlement({
    operatorId: 'o1', periodAnchorDate: '2026-09-03', settings: SETTLEMENT_SETTINGS_DEFAULTS as never,
    companyPolicy: { linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100, stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72, other_accessorial_pct: 72 } as never,
    driverPolicy: null, documentSettings,
    loads: [{ id: 'l1', loadNumber: 'ST-1', loadType: 'standard', deliveredAt: '2026-09-03T15:00:00Z',
      charges: [{ id: 'c1', charge_type: 'lumper', amount: 200, description: '', funding_source: 'driver', actual_cost: null } as never],
      documents: [{ document_type: 'pod' }], exceptions: [], rateType: 'flat', linehaulRate: 1000 } as never],
  } as never);
  it('withholds a lumper load without a receipt under the defaults', () => {
    expect(base(null).withheldLoads).toHaveLength(1);
  });
  it('pays it when the carrier sets the lumper receipt to No', () => {
    expect(base(withLumperOff()).withheldLoads).toHaveLength(0);
  });
});
