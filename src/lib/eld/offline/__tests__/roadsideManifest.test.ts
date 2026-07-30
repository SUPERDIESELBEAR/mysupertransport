import { describe, expect, it } from 'vitest';
import { isoDateInTimezone, manifestIsStale, windowDatesInTimezone } from '../roadsideManifest';

describe('roadside window', () => {
  it('uses the home terminal timezone, not the device timezone', () => {
    // 05:30 UTC on the 5th is still the 4th in Chicago.
    const at = new Date('2026-03-05T05:30:00Z');
    expect(isoDateInTimezone(at, 'America/Chicago')).toBe('2026-03-04');
    expect(isoDateInTimezone(at, 'UTC')).toBe('2026-03-05');
  });

  it('returns today plus the previous seven, newest first', () => {
    const dates = windowDatesInTimezone('America/Chicago', new Date('2026-03-05T18:00:00Z'));
    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe('2026-03-05');
    expect(dates[7]).toBe('2026-02-26');
  });

  it('flags a manifest built for a previous local day as stale', () => {
    const now = new Date('2026-03-05T18:00:00Z');
    expect(manifestIsStale('2026-03-05', 'America/Chicago', now)).toBe(false);
    expect(manifestIsStale('2026-03-04', 'America/Chicago', now)).toBe(true);
  });
});