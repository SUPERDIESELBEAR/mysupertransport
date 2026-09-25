import { describe, it, expect } from 'vitest';
import cases from '@/test/fixtures/readiness-parity-cases.json';
import {
  DEFAULT_DOCUMENT_REQUIREMENTS, evaluateInvoiceReadiness, evaluateLoadPaperwork,
  type DocumentRequirementSettings,
} from '@/lib/loadPaperwork';
import { chargeContextFrom } from '@/lib/documentRequirements';

/**
 * P79 parity. The SAME case table is run through invoice_readiness_missing in
 * the database (pass-4 report, step 3); both must give these exact answers.
 */
type Case = (typeof cases)[number];

const BROKERS: Record<string, object | null> = {
  full: { address_line1: '1 Main', city: 'Town', state: 'MO', zip: '64080', factoring_status: 'approved' },
  no_address: { address_line1: '', city: 'Town', state: 'MO', zip: '64080', factoring_status: 'approved' },
  not_approved: { address_line1: '1 Main', city: 'Town', state: 'MO', zip: '64080', factoring_status: 'not_approved' },
  unknown: { address_line1: '1 Main', city: 'Town', state: 'MO', zip: '64080', factoring_status: 'unknown' },
  none: null,
};

export function settingsFor(c: Case): DocumentRequirementSettings {
  const overrides = c.rows as Record<string, string>;
  return {
    bolOrPodEither: c.either,
    rows: DEFAULT_DOCUMENT_REQUIREMENTS.rows.map(r => ({
      ...r, required_before_invoicing: overrides[r.document_type] ?? r.required_before_invoicing,
    })),
  };
}

const docsFor = (c: Case) => c.docs.map(d => ({ document_type: d.type, photo_label: (d as { label?: string }).label ?? null }));
const excsFor = (c: Case) => c.excs.map(e => ({ document_type: e.type, status: e.status, photo_label: (e as { label?: string }).label ?? null }));

describe('invoice readiness — settings-driven parity table', () => {
  it('has at least 20 cases', () => { expect(cases.length).toBeGreaterThanOrEqual(20); });

  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const missing = evaluateInvoiceReadiness({
      loadType: c.load_type,
      documents: docsFor(c),
      exceptions: excsFor(c),
      settings: settingsFor(c),
      charges: chargeContextFrom(c.charges),
      broker: BROKERS[c.broker] as never,
      hasDefaultFactor: true,
    });
    expect(missing).toEqual(c.expected);

    // The driver-facing rule agrees on every driver-uploaded item it owns.
    const driver = evaluateLoadPaperwork(c.load_type, docsFor(c), excsFor(c), settingsFor(c), chargeContextFrom(c.charges));
    const officeOnly = ['Rate confirmation', 'Broker billing address', 'Broker is marked not approved by the factor'];
    expect(driver.outstandingRequired.map(r => r.label).map(l =>
      l === 'Bill of lading (collected at pickup)' ? 'Bill of lading' : l === 'Proof of delivery' ? 'Proof of delivery' : l,
    )).toEqual(c.expected.filter(l => !officeOnly.includes(l)));
  });
});
