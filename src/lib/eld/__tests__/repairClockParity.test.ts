/**
 * The console and the escalation job must never name a different day for the
 * same event. `src/lib/eld/repairClock.ts` is the client copy of the job's
 * math; these tests hold the two in lockstep, and record why the old
 * `elapsedRepairDay` was replaced.
 */
import { describe, it, expect } from 'vitest';
import {
  repairDayInZone as jobRepairDay,
  calendarDaysBetween as jobDaysBetween,
  zonedDateKey as jobDateKey,
} from '../../../../supabase/functions/_shared/eld/escalationLadder';
import {
  repairDayInZone,
  calendarDaysBetween,
  zonedDateKey,
  extensionDaysLeft,
  extensionDeadline,
  backdateDays,
} from '../repairClock';
import { elapsedRepairDay } from '../constants';

const TZ = 'America/Chicago';

describe('client repair clock is the job repair clock', () => {
  const cases: Array<[string, string]> = [
    ['2026-08-01T14:00:00Z', '2026-08-01T20:00:00Z'],
    ['2026-08-01T14:00:00Z', '2026-08-02T04:00:00Z'], // still Aug 1 in Chicago
    ['2026-08-01T14:00:00Z', '2026-08-02T06:00:00Z'],
    ['2026-08-01T14:00:00Z', '2026-08-09T13:00:00Z'],
    // Backdated 48h: discovery Jul 30, report Aug 1.
    ['2026-07-30T23:30:00Z', '2026-08-01T14:00:00Z'],
    // DST boundary — US fall back, Nov 1 2026.
    ['2026-10-30T18:00:00Z', '2026-11-02T18:00:00Z'],
    // DST boundary — spring forward, Mar 8 2026.
    ['2026-03-06T18:00:00Z', '2026-03-09T18:00:00Z'],
  ];

  it.each(cases)('agrees for discovered %s at %s', (discovered, now) => {
    expect(repairDayInZone(discovered, new Date(now), TZ))
      .toBe(jobRepairDay(discovered, new Date(now), TZ));
  });

  it('agrees on the primitives', () => {
    expect(zonedDateKey('2026-08-02T04:00:00Z', TZ)).toBe(jobDateKey('2026-08-02T04:00:00Z', TZ));
    expect(calendarDaysBetween('2026-03-06', '2026-03-09'))
      .toBe(jobDaysBetween('2026-03-06', '2026-03-09'));
  });

  it('crosses local midnight, not the 24h anniversary — the deprecated helper does not', () => {
    // Discovered 23:00 CT Aug 1. At 07:00 CT Aug 2 the repair clock is day 2;
    // elapsed-ms math still reads day 1, eight hours behind the job.
    const discovered = '2026-08-02T04:00:00Z';
    const now = new Date('2026-08-02T12:00:00Z');
    expect(repairDayInZone(discovered, now, TZ)).toBe(2);
    expect(elapsedRepairDay(discovered, now)).toBe(1);
  });
});

describe('extension clock keys on the report, not the discovery', () => {
  it('deadline is notification + 5 days', () => {
    expect(extensionDeadline('2026-08-01T14:00:00Z').toISOString())
      .toBe('2026-08-06T14:00:00.000Z');
  });

  it('counts days left and floors at zero', () => {
    expect(extensionDaysLeft('2026-08-01T14:00:00Z', new Date('2026-08-02T14:00:00Z'))).toBe(4);
    expect(extensionDaysLeft('2026-08-01T14:00:00Z', new Date('2026-08-09T14:00:00Z'))).toBe(0);
  });

  it('reports the backdate gap that makes the two clocks differ', () => {
    expect(backdateDays('2026-07-30T23:30:00Z', '2026-08-01T14:00:00Z', TZ)).toBe(2);
    expect(backdateDays('2026-08-01T14:00:00Z', '2026-08-01T14:00:00Z', TZ)).toBe(0);
  });
});