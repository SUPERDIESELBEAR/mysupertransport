import { describe, it, expect } from 'vitest';
import { applyParsedToForm, type ParsedRateConfirmation } from '@/lib/rateConfirmation';
import { buildParseFingerprint, determinismNote } from '@/lib/parseFingerprint';
import { deriveUseWindowFromStops, describeDayCount } from '@/lib/loadoutUseWindow';

/**
 * STANDING RULE under test: two readers of the same parsed field share one gate,
 * and a diagnostic never prints a value without reporting whether it survived.
 *
 * Rolling River's appointment dates came back at `low` confidence. The form
 * writer's gate dropped them; the fingerprint read the same fields raw and
 * printed both windows. Both readers were behaving as written, and between them
 * they reported dates as read while the fields sat empty. The gate is now
 * reported, not just applied.
 */

const field = <T,>(value: T, confidence: 'high' | 'medium' | 'low' = 'high') =>
  ({ value, confidence } as never);

function parsed(confidence: 'high' | 'medium' | 'low'): ParsedRateConfirmation {
  return {
    broker: {},
    rate: {},
    stops: [
      {
        sequence: 1,
        stop_type: 'pickup',
        appointment_start: field('2026-08-17T08:00', confidence),
        appointment_end: field('2026-08-17T16:00', confidence),
        references: [],
      },
      {
        sequence: 2,
        stop_type: 'delivery',
        appointment_start: field('2026-08-24T08:00', confidence),
        appointment_end: field('2026-08-24T16:00', confidence),
        references: [],
      },
    ],
  } as unknown as ParsedRateConfirmation;
}

const apply = (p: ParsedRateConfirmation) => {
  const written: Record<string, unknown> = {};
  const result = applyParsedToForm(p, (name, value) => { written[name] = value; });
  return { written, result };
};

describe('one gate, reported', () => {
  it('fills appointments the gate accepts', () => {
    const { written, result } = apply(parsed('high'));
    expect(written['stops']).toBeTruthy();
    expect(result.discarded).toHaveLength(0);
  });

  it('records every low-confidence value it refused instead of dropping it silently', () => {
    const { result } = apply(parsed('low'));
    const fields = result.discarded.map(d => d.field);
    expect(fields).toContain('stops.0.appointment_start');
    expect(fields).toContain('stops.1.appointment_end');
    expect(result.discarded.every(d => d.confidence === 'low')).toBe(true);
  });

  it('never prints an appointment without the confidence the form gate reads', () => {
    const p = parsed('low');
    const { result } = apply(p);
    const fp = buildParseFingerprint({
      layer: null,
      checks: [],
      parsed: p,
      discarded: result.discarded,
    });
    fp.appointments.forEach(a => {
      if (a.start) expect(a.startConfidence).toBe('low');
      if (a.end) expect(a.endConfidence).toBe('low');
    });
    // The value shown is accompanied by the reason it did not land.
    expect(fp.discarded.length).toBeGreaterThan(0);
  });

  it('reports an unacknowledged seed as unverified, not as working', () => {
    const base = { layer: null, checks: [], parsed: parsed('high') };
    const withRun = (run: Record<string, unknown>) => buildParseFingerprint({
      ...base,
      parsed: { ...base.parsed, run } as unknown as ParsedRateConfirmation,
    });

    const echoed = withRun({ model: 'x', temperature: 0, seed: 7, seed_echoed: true });
    expect(echoed.model).toBe('x');
    expect(determinismNote(echoed)).toMatch(/acknowledged by provider/);

    const ignored = withRun({ model: 'x', temperature: 0, seed: 7, seed_echoed: false });
    expect(determinismNote(ignored)).toMatch(/unverified/);

    const silent = buildParseFingerprint(base);
    expect(silent.seedEchoed).toBeNull();
    expect(determinismNote(silent)).toMatch(/not reported/);
  });
});

describe('derived trailer use window', () => {
  it('takes the window from the first and last stop dates', () => {
    const w = deriveUseWindowFromStops([
      { appointment_start: '2026-08-17T08:00', appointment_end: '2026-08-17T16:00' },
      { appointment_start: '2026-08-24T08:00', appointment_end: '2026-08-24T16:00' },
    ]);
    expect(w).toEqual({ start: '2026-08-17', end: '2026-08-24', days: 8 });
  });

  it('guesses nothing when the stops carry no dates', () => {
    expect(deriveUseWindowFromStops([{ appointment_start: '' }, {}])).toBeNull();
  });

  it('shows a stated count and the dates when they disagree, letting neither win', () => {
    const r = describeDayCount({ statedDays: 10, start: '2026-08-17', end: '2026-08-24' });
    expect(r.disagrees).toBe(true);
    expect(r.text).toContain('10 days stated');
    expect(r.text).toContain('8 days');
  });
});
