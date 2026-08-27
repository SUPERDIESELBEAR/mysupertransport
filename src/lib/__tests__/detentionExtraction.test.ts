/**
 * Module 5 Pass 3 — detention terms come off the document, or they do not exist.
 *
 * The rule this file exists to protect is the NEGATIVE one: a rate confirmation
 * silent on detention yields six nulls. Two hours free is an industry
 * convention, not an agreement, and a fabricated 120 renders on Load Detail
 * exactly like a term the broker signed. So the silent-document case is written
 * first and asserted hardest.
 *
 * The model is stubbed. What is under test is the normalization contract —
 * which values survive, which are dropped, and which stay tri-state — plus the
 * prompt rules themselves, because the prompt is the only place the
 * "never default" instruction lives.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRateConfirmationCore } from '../../../supabase/functions/_shared/rateConCore';

const CORE_SRC = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/rateConCore.ts'), 'utf8',
);

/** Enough of a load that the empty-extraction guard does not fire. */
const MINIMAL_LOAD = {
  broker: { company_name: { value: 'Test Broker', confidence: 'high' } },
  load: { broker_load_number: { value: 'BL-1', confidence: 'high' } },
  rate: { total: { value: 1000, confidence: 'high' } },
};

function stubModel(payload: Record<string, unknown>) {
  const res = {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    text: async () => '',
  };
  vi.stubGlobal('fetch', vi.fn(async () => res as unknown as Response));
}

async function parseWith(detention: Record<string, unknown> | undefined) {
  stubModel({ ...MINIMAL_LOAD, ...(detention ? { detention_terms: detention } : {}) });
  const outcome = await parseRateConfirmationCore(
    { file_base64: 'AAAA', mime_type: 'application/pdf' } as never, 'key',
  );
  expect(outcome.status).toBe(200);
  const body = outcome.body as Record<string, any>;
  return (body.parsed ?? body).detention_terms as Record<string, { value: unknown }>;
}

const high = (value: unknown) => ({ value, confidence: 'high' });

afterEach(() => vi.unstubAllGlobals());

describe('detention terms extraction', () => {
  it('a document silent on detention yields all six nulls — no conventional defaults', async () => {
    const dt = await parseWith(undefined);
    expect(dt.free_time_minutes.value).toBeNull();
    expect(dt.rate_per_hour.value).toBeNull();
    expect(dt.daily_cap.value).toBeNull();
    expect(dt.clock_start.value).toBeNull();
    expect(dt.notification_required.value).toBeNull();
    expect(dt.terms_note.value).toBeNull();
  });

  it('"Detention $50/hr after 2 hours" states free time and rate, and nothing else', async () => {
    const dt = await parseWith({
      free_time_minutes: high(120),
      rate_per_hour: high(50),
      terms_note: high('Detention $50/hr after 2 hours.'),
    });
    expect(dt.free_time_minutes.value).toBe(120);
    expect(dt.rate_per_hour.value).toBe(50);
    // The document names no trigger and says nothing about notifying anyone.
    expect(dt.clock_start.value).toBeNull();
    expect(dt.notification_required.value).toBeNull();
    expect(dt.daily_cap.value).toBeNull();
  });

  it('"3 hours free" arrives as 180 minutes', async () => {
    const dt = await parseWith({ free_time_minutes: high(180) });
    expect(dt.free_time_minutes.value).toBe(180);
  });

  it('"Detention begins upon driver arrival" sets clock_start to arrival', async () => {
    const dt = await parseWith({ clock_start: high('arrival') });
    expect(dt.clock_start.value).toBe('arrival');
  });

  it('an unrecognised clock trigger is dropped rather than coerced', async () => {
    const dt = await parseWith({ clock_start: high('when the driver calls') });
    expect(dt.clock_start.value).toBeNull();
  });

  it('a daily cap is captured when printed and null when not', async () => {
    expect((await parseWith({ daily_cap: high(500) })).daily_cap.value).toBe(500);
    expect((await parseWith({ free_time_minutes: high(120) })).daily_cap.value).toBeNull();
  });

  it('notification required is true when stated, false only when denied, else null', async () => {
    expect((await parseWith({ notification_required: high(true) })).notification_required.value)
      .toBe(true);
    expect((await parseWith({ notification_required: high(false) })).notification_required.value)
      .toBe(false);
    // Nothing stated is null, never false — the Load Detail prompt reads that gap.
    expect((await parseWith({ free_time_minutes: high(120) })).notification_required.value)
      .toBeNull();
  });

  it('terms_note carries the clause verbatim, and null when no faithful copy exists', async () => {
    const clause = 'Detention: 2 hours free, then $50.00 per hour, max $500.00 per day.';
    expect((await parseWith({ terms_note: high(clause) })).terms_note.value).toBe(clause);
    expect((await parseWith({ terms_note: { value: null, confidence: 'low' } })).terms_note.value)
      .toBeNull();
  });
});

describe('detention prompt rules', () => {
  it('the prompt forbids conventional defaults and pins minutes', () => {
    expect(CORE_SRC).toMatch(/ONLY WHAT IS PRINTED/);
    expect(CORE_SRC).toMatch(/industry convention, NOT a term/);
    expect(CORE_SRC).toMatch(/free_time_minutes is ALWAYS minutes/);
    expect(CORE_SRC).toMatch(/Never default to "appointment"/);
    expect(CORE_SRC).toMatch(/Never collapse "not stated" into false/);
  });

  it('detention text is still carried by special_instructions and the verbatim blocks', () => {
    expect(CORE_SRC).toMatch(/the detention text stays in those fields too/);
  });
});
