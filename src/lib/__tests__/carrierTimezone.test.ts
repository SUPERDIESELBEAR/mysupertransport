import { describe, expect, it, afterAll } from 'vitest';
import { CARRIER_TIMEZONE, carrierZoneAbbrev, isoToNaive, naiveToIso } from '@/lib/carrierTimezone';
import { buildLoadSavePayload } from '@/lib/loadSavePayload';
import type { LoadFormValues } from '@/pages/dispatch/loadFormSchema';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe('carrier timezone constant', () => {
  it('is Central', () => {
    expect(CARRIER_TIMEZONE).toBe('America/Chicago');
  });
});

describe('naiveToIso', () => {
  it('resolves a summer wall clock at CDT (UTC−5)', () => {
    expect(naiveToIso('2026-06-20T08:00')).toBe('2026-06-20T13:00:00.000Z');
  });

  it('resolves a winter wall clock at CST (UTC−6)', () => {
    expect(naiveToIso('2026-01-20T08:00')).toBe('2026-01-20T14:00:00.000Z');
  });

  it('round-trips both', () => {
    expect(isoToNaive(naiveToIso('2026-06-20T08:00'))).toBe('2026-06-20T08:00');
    expect(isoToNaive(naiveToIso('2026-01-20T08:00'))).toBe('2026-01-20T08:00');
  });

  it('resolves the spring-forward gap hour forward, as documented', () => {
    // 2026-03-08 02:30 does not exist in Central. Documented behaviour: the
    // equivalent instant one hour later, so the round-trip reads 03:30.
    const iso = naiveToIso('2026-03-08T02:30');
    expect(iso).toBe('2026-03-08T08:30:00.000Z');
    expect(isoToNaive(iso)).toBe('2026-03-08T03:30');
  });
});

describe('isoToNaive / abbreviation', () => {
  it('reads a stored instant as carrier wall clock', () => {
    expect(isoToNaive('2025-06-20T11:00:00+00:00')).toBe('2025-06-20T06:00');
  });

  it('labels the zone for the date, not a fixed string', () => {
    expect(carrierZoneAbbrev('2026-06-20T13:00:00Z')).toBe('CDT');
    expect(carrierZoneAbbrev('2026-01-20T14:00:00Z')).toBe('CST');
  });
});

/**
 * The actual regression this pass prevents: before pinning, a dispatcher on a
 * machine that was not Central wrote and read times that meant something else.
 */
describe('process timezone independence', () => {
  const cases = ['America/Chicago', 'Asia/Karachi', 'America/Phoenix', 'UTC'];

  it('produces identical instants and identical rendered wall clocks in every process TZ', () => {
    for (const tz of cases) {
      process.env.TZ = tz;
      expect(naiveToIso('2026-06-20T08:00')).toBe('2026-06-20T13:00:00.000Z');
      expect(naiveToIso('2026-01-20T08:00')).toBe('2026-01-20T14:00:00.000Z');
      expect(isoToNaive('2025-06-20T11:00:00+00:00')).toBe('2025-06-20T06:00');
      expect(carrierZoneAbbrev('2026-06-20T13:00:00Z')).toBe('CDT');
    }
    process.env.TZ = ORIGINAL_TZ;
  });
});

describe('save path', () => {
  const values = (start: string, end: string) => ({
    load_number: 'ST26999',
    load_type: 'standard',
    rate_type: 'flat',
    equipment_type: 'dry_van',
    handling_type: 'live_load_unload',
    broker_id: 'b1',
    fsc_bundled_into_linehaul: false,
    is_team_load: false,
    is_hazmat: false,
    permit_required: false,
    stops: [
      { stop_type: 'pickup', city: 'Tulsa', state: 'OK', appointment_start: start, appointment_end: end },
    ],
    charges: [],
    references: [],
  } as unknown as LoadFormValues);

  it('stores the same instant whatever the process TZ is', () => {
    const seen = new Set<string>();
    for (const tz of ['America/Chicago', 'Asia/Karachi', 'America/Phoenix']) {
      process.env.TZ = tz;
      const payload = buildLoadSavePayload(values('2026-06-20T08:00', '2026-06-20T10:00'), { isEdit: false });
      seen.add(String(payload.stops[0].appointment_start));
      expect(payload.stops[0].appointment_end).toBe('2026-06-20T15:00:00.000Z');
    }
    process.env.TZ = ORIGINAL_TZ;
    expect([...seen]).toEqual(['2026-06-20T13:00:00.000Z']);
  });
});
