import { describe, expect, it } from 'vitest';
import {
  applyRevision, buildRevisionDiff, documentReferences, initialDecisions,
} from '@/lib/revisedRateCon';
import { payTreatment, type PayPolicyRates } from '@/lib/payTreatment';
import { loadFormDefaults, emptyStop, type LoadFormValues } from '@/pages/dispatch/loadFormSchema';
import type { Confidence, ParsedRateConfirmation, ParsedStop } from '@/lib/rateConfirmation';

const f = <T,>(value: T | null, confidence: Confidence = 'high') => ({ value, confidence });

function parsedStop(over: Record<string, unknown> = {}): ParsedStop {
  return {
    sequence: 1,
    stop_type: 'pickup',
    facility_name: f<string>(null),
    address_line1: f('100 Dock Rd'),
    address_line2: f<string>(null),
    city: f('Pleasant Hill'),
    state: f('MO'),
    zip: f('64080'),
    contact_name: f<string>(null),
    contact_phone: f<string>(null),
    appointment_start: f<string>(null),
    appointment_end: f<string>(null),
    notes: f<string>(null),
    references: [],
    ...over,
  } as unknown as ParsedStop;
}

function parsedDoc(over: Partial<ParsedRateConfirmation> = {}): ParsedRateConfirmation {
  return {
    broker: {
      company_name: f('AAA Freight'), mc_number: f('788425'),
      contact_name: f<string>(null), contact_phone: f<string>(null), contact_email: f<string>(null),
    },
    load: {
      broker_load_number: f('BL-100'), bol_number: f<string>(null), po_number: f<string>(null),
      equipment_type: f(null), handling_type: f(null), commodity: f<string>(null),
      weight_lbs: f<number>(null), loaded_miles: f<number>(null),
      is_hazmat: f<boolean>(null), is_team_load: f<boolean>(null),
    },
    reefer: {
      temp_f: f<number>(null), temp_min_f: f<number>(null), temp_max_f: f<number>(null),
      precool_required: f<boolean>(null), continuous_run: f<boolean>(null), notes: f<string>(null),
    },
    rate: { linehaul: f<number>(null), fsc_amount: f<number>(null), total: f<number>(null), line_items: [] },
    stops: [],
    references: [],
    special_instructions: f<string>(null),
    loadout_signals: {
      no_bol_mentioned: false, photo_pod_required: false, multi_day_use_period: false,
      trailer_relocation_language: false, no_commodity: false, trailer_number: f<string>(null),
      trailer_owner: f<string>(null), use_period_days: f<number>(null), relocation_fee: f<number>(null),
    },
    ...over,
  } as unknown as ParsedRateConfirmation;
}

function baseLoad(over: Partial<LoadFormValues> = {}): LoadFormValues {
  return {
    ...loadFormDefaults(),
    load_number: 'ST26034',
    broker_reference_number: 'BL-100',
    linehaul_rate: '1800',
    stops: [
      { ...emptyStop('pickup'), id: 'stop-a', address_line1: '100 Dock Rd', zip: '64080', city: 'Pleasant Hill', state: 'MO' },
      { ...emptyStop('delivery'), id: 'stop-b', address_line1: '900 Depot St', zip: '73301', city: 'Austin', state: 'TX' },
    ],
    charges: [],
    ...over,
  };
}

describe('stop notes never produce a change row', () => {
  it('ignores a reworded stop summary on an otherwise unchanged stop', () => {
    // The printed comment is identical on both documents; only the model's
    // summary of it moved. That is parser churn, not a broker change.
    const doc = parsedDoc({
      stops: [parsedStop({ notes: f('PU# IX00286060 — check in at guard shack') })],
    });
    const current = baseLoad();
    current.stops[0] = { ...current.stops[0], stop_notes: '(See Warehouse Comments)' };
    const diff = buildRevisionDiff(current, doc);
    expect(diff.nonFinancial.filter(n => n.path.endsWith('stop_notes'))).toHaveLength(0);
  });

  it('ignores an empty-to-content stop summary too', () => {
    const doc = parsedDoc({ stops: [parsedStop({ notes: f('PO# 001000562117') })] });
    const diff = buildRevisionDiff(baseLoad(), doc);
    expect(diff.nonFinancial.some(n => n.path.includes('stop_notes'))).toBe(false);
  });

  it('still compares the printed stop comment', () => {
    const doc = parsedDoc({
      stops: [parsedStop({ notes_verbatim: f('Comments: PU# IX00286060') })],
    });
    const diff = buildRevisionDiff(baseLoad(), doc);
    const row = diff.nonFinancial.find(n => n.path.endsWith('stop_notes_verbatim'));
    expect(row).toBeDefined();
    expect(row?.firstCapture).toBe(true);
  });
});

describe('firstCapture is structural, not a property of verbatim fields', () => {
  it('labels a non-verbatim field that was never stored', () => {
    // Commodity is an ordinary field. The load has none on file, so the document
    // supplying one is a first capture, not a revision of something.
    const doc = parsedDoc({ load: { ...parsedDoc().load, commodity: f('Frozen peas') } });
    const diff = buildRevisionDiff(baseLoad({ commodity: '' }), doc);
    const row = diff.nonFinancial.find(n => n.path === 'commodity')!;
    expect(row.firstCapture).toBe(true);
    expect(row.current).toBe('Not previously stored');
    expect(row.label).toContain('first capture');
    expect(initialDecisions(diff).accepted[row.id]).toBe(false);
  });

  it('labels a stop field the load never had', () => {
    const doc = parsedDoc({ stops: [parsedStop({ contact_name: f('Dana Reyes') })] });
    const diff = buildRevisionDiff(baseLoad(), doc);
    const row = diff.nonFinancial.find(n => n.path.endsWith('contact_name'))!;
    expect(row.firstCapture).toBe(true);
    expect(row.defaultAccept).toBe(false);
  });

  it('still reports a genuine replacement as a change', () => {
    const doc = parsedDoc({ load: { ...parsedDoc().load, commodity: f('Frozen peas') } });
    const diff = buildRevisionDiff(baseLoad({ commodity: 'Dry Goods' }), doc);
    const row = diff.nonFinancial.find(n => n.path === 'commodity')!;
    expect(row.firstCapture).toBe(false);
    expect(row.current).toBe('Dry Goods');
  });
});

describe('pay treatment comes from the pay class, not a formatted number', () => {
  const policy = {
    id: 'p1', name: 'Company default',
    linehaul_pct: 72, fsc_pct: 72, detention_pct: 100, layover_pct: 100,
    stopoff_pct: 72, lumper_reimbursement_pct: 100, tonu_pct: 72, other_accessorial_pct: 72,
  } satisfies PayPolicyRates;

  it('reads each class off the policy in force rather than a hardcoded table', () => {
    const custom = { ...policy, detention_pct: 85, other_accessorial_pct: 65 };
    expect(payTreatment('detention', custom).label).toBe('85% to driver');
    expect(payTreatment('other', custom).label).toBe('65% to driver');
    expect(payTreatment('linehaul', custom).label).toBe('72% to driver');
  });

  it('says nothing at all when no policy could be read', () => {
    const t = payTreatment('other', null);
    expect(t.kind).toBe('unknown');
    expect(t.label).toBeNull();
  });

  it('carries a treatment kind so a non-percentage class needs no display change', () => {
    const t = payTreatment('lumper', policy);
    expect(t.kind).toBe('at_cost');
    expect(t.label).toBe('reimbursed at cost');
    expect(payTreatment('detention', policy).kind).toBe('percentage');
  });

  it('does not pre-select "other" for a money row', () => {
    const doc = parsedDoc({
      rate: {
        ...parsedDoc().rate,
        line_items: [{ description: 'Wash out', amount: 30, category: 'other', stop_hint: null, confidence: 'high' }],
      },
    });
    const diff = buildRevisionDiff(baseLoad(), doc);
    const row = diff.financial.find(r => r.kind === 'charge')!;
    expect(initialDecisions(diff).classifications[row.id]).toBeUndefined();
  });
});

describe('filing the document references as a baseline', () => {
  const doc = parsedDoc({
    references: [{ label: 'BOL', value: 'BG969676425' }, { label: 'PRO', value: 'BG969676425' }],
    stops: [parsedStop({ references: [{ label: 'PU#', value: 'IX00286060' }] })],
  } as unknown as Partial<ParsedRateConfirmation>);

  it('extracts every printed reference with its stop citation', () => {
    const refs = documentReferences(doc);
    expect(refs.map(r => r.value)).toContain('IX00286060');
    const pu = refs.find(r => r.value === 'IX00286060')!;
    expect(pu.citations).toEqual([{ stopSequence: 1, printedLabel: 'PU#' }]);
  });

  it('produces no reference rows at all when re-reviewed against the filed baseline', () => {
    const before = buildRevisionDiff(baseLoad(), doc);
    expect(before.referencesComparable).toBe(false);
    expect(before.nonFinancial.some(n => n.path === 'references')).toBe(true);

    const filed = baseLoad({ references: documentReferences(doc) });
    const after = buildRevisionDiff(filed, doc);
    expect(after.referencesComparable).toBe(true);
    expect(after.nonFinancial.filter(n => n.path === 'references')).toHaveLength(0);
  });
});

describe('a reference the revised document no longer prints', () => {
  const withRef = () => baseLoad({
    references: [{
      reference_class: 'bol', label: 'BOL', value: 'IX00286060',
      citations: [{ stopSequence: 1, printedLabel: 'BOL#' }],
    }],
  } as Partial<LoadFormValues>);

  // A number missing from a revision has two readings: the broker dropped it,
  // or the parser failed to read it this run. Only a person looking at the page
  // can tell them apart, and deleting a live BOL number is the worse mistake.
  it('is never pre-accepted', () => {
    const doc = parsedDoc({ references: [{ label: 'PRO', value: '778812' }] } as never);
    const diff = buildRevisionDiff(withRef(), doc);
    const row = diff.nonFinancial.find(n => n.id.startsWith('ref.remove.'));
    expect(row).toBeDefined();
    expect(row!.defaultAccept).toBe(false);
    expect(initialDecisions(diff).accepted[row!.id]).toBe(false);
  });

  // Dropping the row out of the form values deletes nothing: the save path
  // treats an absent reference as "not carried by this form". An accepted
  // removal has to be stated explicitly or the number stays on file and the
  // same row reappears on every later review.
  it('is reported as an explicit removal once accepted', async () => {
    const { applyRevision } = await import('@/lib/revisedRateCon');
    const doc = parsedDoc({ references: [{ label: 'PRO', value: '778812' }] } as never);
    const current = withRef();
    const diff = buildRevisionDiff(current, doc);
    const row = diff.nonFinancial.find(n => n.id.startsWith('ref.remove.'))!;
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;

    const result = applyRevision(current, diff, decisions);
    expect(result.values.references?.some(r => r.value === 'IX00286060')).toBe(false);
    expect(result.removedReferences).toEqual([
      { reference_class: 'bol', label: 'BOL', value: 'IX00286060', value_key: 'IX00286060' },
    ]);
  });

  it('reports nothing to remove when the row is left rejected', () => {
    const doc = parsedDoc({ references: [{ label: 'PRO', value: '778812' }] } as never);
    const current = withRef();
    const diff = buildRevisionDiff(current, doc);
    const result = applyRevision(current, diff, initialDecisions(diff));
    expect(result.removedReferences).toEqual([]);
    expect(result.values.references?.some(r => r.value === 'IX00286060')).toBe(true);
  });
});
