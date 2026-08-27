/**
 * Module 5 Pass 3 — detention terms must reach the load on BOTH reference
 * routes, and each route gets its own test.
 *
 * This project has shipped a parser check reachable from only one of the two
 * routes more than once, and a green create-path test said nothing about the
 * revision path. A detention negotiation CONCLUDES in a revised rate
 * confirmation, so the revision route is the one that carries the terms that
 * end up argued over.
 */
import { describe, expect, it } from 'vitest';
import { applyParsedToForm, type Confidence, type ParsedRateConfirmation } from '@/lib/rateConfirmation';
import { applyRevision, buildRevisionDiff, initialDecisions } from '@/lib/revisedRateCon';
import { loadFormDefaults, type LoadFormValues } from '@/pages/dispatch/loadFormSchema';

const f = <T,>(value: T | null, confidence: Confidence = 'high') => ({ value, confidence });

function parsedDoc(detention?: Partial<Record<string, unknown>>): ParsedRateConfirmation {
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
    special_instructions: f<string>(null),
    detention_terms: {
      free_time_minutes: f<number>(null), rate_per_hour: f<number>(null), daily_cap: f<number>(null),
      clock_start: f(null), notification_required: f<boolean>(null), terms_note: f<string>(null),
      ...(detention ?? {}),
    },
  } as unknown as ParsedRateConfirmation;
}

const FULL_TERMS = {
  free_time_minutes: f(120),
  rate_per_hour: f(50),
  daily_cap: f(500),
  clock_start: f('arrival'),
  notification_required: f(true),
  terms_note: f('Detention: 2 hours free, then $50.00/hr, capped at $500.00 per day. Notify broker before detention begins.'),
};

function applyToForm(p: ParsedRateConfirmation) {
  const values: Record<string, unknown> = {};
  applyParsedToForm(p, (name, value) => { values[name] = value; });
  return values;
}

describe('CREATE route — parse populates the six detention columns', () => {
  it('writes every stated term onto the form', () => {
    const values = applyToForm(parsedDoc(FULL_TERMS));
    expect(values.detention_free_time_minutes).toBe('120');
    expect(values.detention_rate_per_hour).toBe('50');
    expect(values.detention_daily_cap).toBe('500');
    expect(values.detention_clock_start).toBe('arrival');
    expect(values.detention_notification_required).toBe('true');
    expect(values.detention_terms_note).toContain('2 hours free');
  });

  it('writes nothing at all when the document is silent', () => {
    const values = applyToForm(parsedDoc());
    ['detention_free_time_minutes', 'detention_rate_per_hour', 'detention_daily_cap',
      'detention_clock_start', 'detention_notification_required', 'detention_terms_note',
    ].forEach(key => expect(values[key]).toBeUndefined());
  });

  it('a stated "notification not required" writes false, not an empty field', () => {
    const values = applyToForm(parsedDoc({ notification_required: f(false) }));
    expect(values.detention_notification_required).toBe('false');
  });
});

function baseLoad(over: Partial<LoadFormValues> = {}): LoadFormValues {
  return { ...loadFormDefaults(), load_number: 'ST-1042', broker_reference_number: 'BL-100', stops: [], charges: [], ...over };
}

describe('REVISION route — detention terms diff individually', () => {
  it('emits all six as separately acceptable entries', () => {
    const diff = buildRevisionDiff(baseLoad(), parsedDoc(FULL_TERMS));
    const ids = diff.nonFinancial.map(d => d.path);
    ['detention_free_time_minutes', 'detention_rate_per_hour', 'detention_daily_cap',
      'detention_clock_start', 'detention_notification_required', 'detention_terms_note',
    ].forEach(path => expect(ids).toContain(path));
  });

  it('each term is rejectable on its own — a rejected free-time window stays put', () => {
    const current = baseLoad({
      detention_free_time_minutes: '120', detention_rate_per_hour: '50',
    } as Partial<LoadFormValues>);
    const revised = parsedDoc({ free_time_minutes: f(60), rate_per_hour: f(75) });
    const diff = buildRevisionDiff(current, revised);
    const rateRow = diff.nonFinancial.find(d => d.path === 'detention_rate_per_hour')!;
    // Rows are pre-checked by default; the dispatcher UNCHECKS the ones they
    // do not agree to, and rejecting the shorter free-time window must not be
    // undone by accepting the higher hourly rate printed beside it.
    const decisions = initialDecisions(diff);
    const freeTimeRow = diff.nonFinancial.find(d => d.path === 'detention_free_time_minutes')!;
    decisions.accepted[rateRow.id] = true;
    decisions.accepted[freeTimeRow.id] = false;
    const { values } = applyRevision(current, diff, decisions);
    expect(values.detention_rate_per_hour).toBe('75');
    expect(values.detention_free_time_minutes).toBe('120');
  });

  it('a revised document silent on detention produces no detention rows', () => {
    const current = baseLoad({ detention_free_time_minutes: '120' } as Partial<LoadFormValues>);
    const diff = buildRevisionDiff(current, parsedDoc());
    expect(diff.nonFinancial.filter(d => d.path.startsWith('detention_'))).toHaveLength(0);
  });

  it('reads the notification row in words, not as a bare boolean', () => {
    const diff = buildRevisionDiff(baseLoad(), parsedDoc({ notification_required: f(true) }));
    const row = diff.nonFinancial.find(d => d.path === 'detention_notification_required')!;
    expect(row.revised).toBe('Required');
    expect(row.value).toBe('true');
  });
});
