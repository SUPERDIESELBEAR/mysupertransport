import { describe, expect, it } from 'vitest';
import {
  applyRevision, buildRevisionDiff, buildRevisionReason, checkDocumentIdentity,
  financialRowReady, initialDecisions, matchParsedStops,
} from '@/lib/revisedRateCon';
import { loadFormDefaults, emptyStop, type LoadFormValues, type StopFormValues } from '@/pages/dispatch/loadFormSchema';
import type { Confidence, ParsedRateConfirmation, ParsedStop } from '@/lib/rateConfirmation';

const f = <T,>(value: T | null, confidence: Confidence = 'high') => ({ value, confidence });

function parsedStop(over: Partial<Record<keyof ParsedStop, unknown>> = {}): ParsedStop {
  return {
    sequence: 1,
    stop_type: 'pickup',
    facility_name: f<string>(null),
    address_line1: f<string>(null),
    address_line2: f<string>(null),
    city: f<string>(null),
    state: f<string>(null),
    zip: f<string>(null),
    contact_name: f<string>(null),
    contact_phone: f<string>(null),
    appointment_start: f<string>(null),
    appointment_end: f<string>(null),
    notes: f<string>(null),
    references: [],
    ...over,
  } as ParsedStop;
}

function parsedDoc(over: Partial<ParsedRateConfirmation> = {}): ParsedRateConfirmation {
  return {
    broker: {
      company_name: f('AAA Freight'),
      mc_number: f('788425'),
      contact_name: f<string>(null),
      contact_phone: f<string>(null),
      contact_email: f<string>(null),
    },
    load: {
      broker_load_number: f('BL-100'),
      bol_number: f<string>(null),
      po_number: f<string>(null),
      equipment_type: f(null),
      handling_type: f(null),
      commodity: f<string>(null),
      weight_lbs: f<number>(null),
      loaded_miles: f<number>(null),
      is_hazmat: f<boolean>(null),
      is_team_load: f<boolean>(null),
    },
    reefer: {
      temp_f: f<number>(null), temp_min_f: f<number>(null), temp_max_f: f<number>(null),
      precool_required: f<boolean>(null), continuous_run: f<boolean>(null), notes: f<string>(null),
    },
    rate: {
      linehaul: f<number>(null), fsc_amount: f<number>(null), total: f<number>(null),
      line_items: [],
    },
    stops: [],
    special_instructions: f<string>(null),
    loadout_signals: {
      no_bol_mentioned: false, photo_pod_required: false, multi_day_use_period: false,
      trailer_relocation_language: false, no_commodity: false, trailer_number: f<string>(null),
      trailer_owner: f<string>(null), use_period_days: f<number>(null), relocation_fee: f<number>(null),
    },
    ...over,
  } as ParsedRateConfirmation;
}

function stop(over: Partial<StopFormValues>): StopFormValues {
  return { ...emptyStop('pickup'), ...over };
}

function baseLoad(over: Partial<LoadFormValues> = {}): LoadFormValues {
  return {
    ...loadFormDefaults(),
    load_number: 'ST-1042',
    broker_reference_number: 'BL-100',
    linehaul_rate: '1800',
    fsc_bundled_into_linehaul: true,
    stops: [
      stop({
        id: 'stop-a', stop_type: 'pickup', address_line1: '100 Dock Rd', zip: '64080',
        city: 'Pleasant Hill', state: 'MO',
      }),
      stop({
        id: 'stop-b', stop_type: 'delivery', address_line1: '900 Depot St', zip: '73301',
        city: 'Austin', state: 'TX',
      }),
    ],
    charges: [],
    ...over,
  };
}

describe('revised rate confirmation — document identity', () => {
  it('refuses a document from a different broker', () => {
    const check = checkDocumentIdentity(
      parsedDoc({ broker: { ...parsedDoc().broker, mc_number: f('999999') } }),
      { loadBrokerMc: '788425', loadBrokerName: 'AAA Freight', loadReference: 'BL-100' },
    );
    expect(check.brokerMismatch).toBe(true);
  });

  it('flags — but does not refuse — a changed broker reference number', () => {
    const check = checkDocumentIdentity(
      parsedDoc({ load: { ...parsedDoc().load, broker_load_number: f('BL-100-R1') } }),
      { loadBrokerMc: '788425', loadBrokerName: 'AAA Freight', loadReference: 'BL-100' },
    );
    expect(check.brokerMismatch).toBe(false);
    expect(check.referenceMismatch).toBe(true);
  });

  it('does not flag a reference the load never had on file', () => {
    const check = checkDocumentIdentity(parsedDoc(), {
      loadBrokerMc: '788425', loadBrokerName: 'AAA Freight', loadReference: null,
    });
    expect(check.referenceMismatch).toBe(false);
  });
});

describe('revised rate confirmation — stop matching', () => {
  it('matches on street and ZIP even when the sequence changed', () => {
    const existing = baseLoad().stops;
    const matches = matchParsedStops(
      [
        { stop_type: 'delivery', address_line1: '900 Depot St', zip: '73301', city: 'Austin', state: 'TX' },
        { stop_type: 'pickup', address_line1: '100 Dock Rd', zip: '64080', city: 'Pleasant Hill', state: 'MO' },
      ],
      existing,
    );
    expect(matches[0]).toMatchObject({ existingIndex: 1, mode: 'address' });
    expect(matches[1]).toMatchObject({ existingIndex: 0, mode: 'address' });
  });

  it('falls back to position when only the street address was corrected', () => {
    const matches = matchParsedStops(
      [{ stop_type: 'pickup', address_line1: '150 Dock Road', zip: '64080', city: 'Pleasant Hill', state: 'MO' }],
      baseLoad().stops,
    );
    expect(matches[0].mode).toBe('position');
    expect(matches[0].existingIndex).toBe(0);
  });

  it('leaves a genuinely new stop unresolved rather than guessing', () => {
    const matches = matchParsedStops(
      [{ stop_type: 'delivery', address_line1: '77 Elm Ave', zip: '30301', city: 'Atlanta', state: 'GA' }],
      baseLoad().stops,
    );
    expect(matches[0]).toMatchObject({ existingIndex: null, mode: 'unresolved' });
  });
});

describe('revised rate confirmation — driver-recorded stop data', () => {
  const revised = parsedDoc({
    stops: [parsedStop({
      sequence: 1,
      stop_type: 'pickup',
      address_line1: f('250 Dock Rd'),
      city: f('Pleasant Hill'),
      state: f('MO'),
      zip: f('64080'),
    })],
  });

  it('defaults an address change to REJECT when the driver already checked in', () => {
    const current = baseLoad();
    current.stops[0] = { ...current.stops[0], has_driver_data: true };
    const diff = buildRevisionDiff(current, revised);
    const row = diff.nonFinancial.find(n => n.path === 'stops.0.address_line1');
    expect(row).toBeDefined();
    expect(row?.hasDriverData).toBe(true);
    expect(row?.defaultAccept).toBe(false);
    expect(initialDecisions(diff).accepted[row!.id]).toBe(false);
  });

  it('defaults the same address change to ACCEPT with no check-in data', () => {
    const current = baseLoad();
    current.stops[0] = { ...current.stops[0], has_driver_data: false };
    const diff = buildRevisionDiff(current, revised);
    const row = diff.nonFinancial.find(n => n.path === 'stops.0.address_line1');
    expect(row).toBeDefined();
    expect(row?.hasDriverData).toBe(false);
    expect(row?.defaultAccept).toBe(true);
    expect(initialDecisions(diff).accepted[row!.id]).toBe(true);
  });
});

describe('revised rate confirmation — financial classification', () => {
  const withDetention = parsedDoc({
    rate: {
      ...parsedDoc().rate,
      linehaul: f(1950),
      line_items: [
        { description: 'Detention at consignee', amount: 150, category: 'detention', stop_hint: null, confidence: 'high' },
      ],
    },
  });

  it('never accepts a money change by default', () => {
    const diff = buildRevisionDiff(baseLoad(), withDetention);
    const decisions = initialDecisions(diff);
    expect(diff.financial.length).toBe(2);
    diff.financial.forEach(row => expect(decisions.accepted[row.id]).toBe(false));
  });

  it('routes a linehaul correction to the linehaul rate', () => {
    const current = baseLoad();
    const diff = buildRevisionDiff(current, withDetention);
    const row = diff.financial.find(r => r.kind === 'linehaul')!;
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;
    const { values, financialSummary } = applyRevision(current, diff, decisions);
    expect(values.linehaul_rate).toBe('1950');
    expect(values.charges).toHaveLength(0);
    expect(financialSummary.join(' ')).toContain('linehaul');
  });

  it('routes an accessorial to its own charge row, not the linehaul', () => {
    const current = baseLoad();
    const diff = buildRevisionDiff(current, withDetention);
    const row = diff.financial.find(r => r.kind === 'charge')!;
    expect(row.suggested).toBe('detention');
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;
    const { values } = applyRevision(current, diff, decisions);
    expect(values.linehaul_rate).toBe('1800');
    expect(values.charges).toEqual([
      expect.objectContaining({
        charge_type: 'detention', amount: '150', source: 'revised_rate_confirmation',
      }),
    ]);
  });

  it('honours a dispatcher who reclassifies the document category', () => {
    const current = baseLoad();
    const diff = buildRevisionDiff(current, withDetention);
    const row = diff.financial.find(r => r.kind === 'charge')!;
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;
    decisions.classifications[row.id] = 'lumper';
    const { values } = applyRevision(current, diff, decisions);
    expect(values.charges[0].charge_type).toBe('lumper');
  });

  it('blocks an accepted row that is classified as other with no description', () => {
    const diff = buildRevisionDiff(baseLoad(), withDetention);
    const row = diff.financial.find(r => r.kind === 'charge')!;
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;
    decisions.classifications[row.id] = 'other';
    expect(financialRowReady(row, decisions)).toBe(false);
    decisions.descriptions[row.id] = 'Pallet exchange';
    expect(financialRowReady(row, decisions)).toBe(true);
  });

  it('unbundles the fuel surcharge when the document itemises one', () => {
    const current = baseLoad();
    const doc = parsedDoc({ rate: { ...parsedDoc().rate, fsc_amount: f(220) } });
    const diff = buildRevisionDiff(current, doc);
    const row = diff.financial.find(r => r.kind === 'fsc')!;
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;
    const { values } = applyRevision(current, diff, decisions);
    expect(values.fsc_bundled_into_linehaul).toBe(false);
    expect(values.fsc_amount).toBe('220');
  });

  it('adjusts an existing charge in place instead of duplicating it', () => {
    const current = baseLoad({
      charges: [{ charge_type: 'detention', description: 'Detention', amount: '100', source: 'manual' }],
    });
    const diff = buildRevisionDiff(current, withDetention);
    const row = diff.financial.find(r => r.kind === 'charge')!;
    expect(row.current).toBe(100);
    expect(row.delta).toBe(50);
    const decisions = initialDecisions(diff);
    decisions.accepted[row.id] = true;
    const { values } = applyRevision(current, diff, decisions);
    expect(values.charges).toHaveLength(1);
    expect(values.charges[0].amount).toBe('150');
  });
});

describe('revised rate confirmation — rejection', () => {
  it('writes nothing for a rejected row', () => {
    const current = baseLoad();
    const doc = parsedDoc({
      load: { ...parsedDoc().load, commodity: f('Frozen peas') },
      rate: { ...parsedDoc().rate, linehaul: f(2500) },
    });
    const diff = buildRevisionDiff(current, doc);
    const decisions = initialDecisions(diff);
    Object.keys(decisions.accepted).forEach(k => { decisions.accepted[k] = false; });
    const { values, financialSummary } = applyRevision(current, diff, decisions);
    expect(values.linehaul_rate).toBe('1800');
    expect(values.commodity).toBe(current.commodity);
    expect(financialSummary).toHaveLength(0);
  });

  it('keeps the load number and the stop ids untouched', () => {
    const current = baseLoad();
    const doc = parsedDoc({
      stops: [parsedStop({ sequence: 1, address_line1: f('250 Dock Rd'), city: f('Pleasant Hill'), state: f('MO'), zip: f('64080') })],
    });
    const diff = buildRevisionDiff(current, doc);
    const { values } = applyRevision(current, diff, initialDecisions(diff));
    expect(values.load_number).toBe('ST-1042');
    expect(values.stops.map(s => s.id)).toEqual(['stop-a', 'stop-b']);
  });
});

describe('revised rate confirmation — change reason', () => {
  it('records the document, the money and any reference override', () => {
    const reason = buildRevisionReason({
      receivedAt: new Date(2026, 7, 21),
      financialSummary: ['linehaul +$150.00'],
      referenceOverride: { docReference: 'BL-100-R1', loadReference: 'BL-100' },
      addition: 'Broker emailed the revision.',
    });
    expect(reason).toContain('Revised rate confirmation received 8/21');
    expect(reason).toContain('linehaul +$150.00');
    expect(reason).toContain('BL-100-R1');
    expect(reason).toContain('Broker emailed the revision.');
  });
});
