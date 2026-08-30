/**
 * §2 ladder math. The two clocks are the whole point of these tests: the rungs
 * count calendar days from `discovered_at` in the terminal timezone, the
 * extension window counts 5 days from `created_at` (the driver's notification).
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateEvent,
  repairDayInZone,
  extensionWindowOpen,
  driverQuietHoursOk,
  LADDER_RUNGS,
  type LadderEvent,
} from '../../../../supabase/functions/_shared/eld/escalationLadder';
import { elapsedRepairDay } from '../constants';

const TZ = 'America/Chicago';

function ev(over: Partial<LadderEvent> = {}): LadderEvent {
  return {
    id: 'e1',
    discovered_at: '2026-08-01T14:00:00Z',
    created_at: '2026-08-01T14:00:00Z',
    status: 'open',
    carrier_acknowledged_at: null,
    extension_granted_at: null,
    escalations_suppressed_until: null,
    escalations_suppressed_reason: null,
    ...over,
  };
}

const at = (iso: string) => new Date(iso);
const kinds = (e: LadderEvent, iso: string) =>
  evaluateEvent(e, at(iso), TZ).actions.map((a) => a.kind).sort();

describe('repair clock', () => {
  it('counts the discovery date as day 1 in the terminal timezone', () => {
    expect(repairDayInZone('2026-08-01T14:00:00Z', at('2026-08-01T20:00:00Z'), TZ)).toBe(1);
    expect(repairDayInZone('2026-08-01T14:00:00Z', at('2026-08-03T13:00:00Z'), TZ)).toBe(3);
    expect(repairDayInZone('2026-08-01T14:00:00Z', at('2026-08-08T13:00:00Z'), TZ)).toBe(8);
  });

  it('rolls at local midnight, not UTC midnight', () => {
    // 2026-08-02T04:00Z is still Aug 1 at 23:00 in Chicago.
    expect(repairDayInZone('2026-08-01T14:00:00Z', at('2026-08-02T04:00:00Z'), TZ)).toBe(1);
    expect(repairDayInZone('2026-08-01T14:00:00Z', at('2026-08-02T06:00:00Z'), TZ)).toBe(2);
  });

  it('agrees with the display helper for a same-zone, non-backdated event', () => {
    const discovered = '2026-08-01T14:00:00Z';
    const now = at('2026-08-04T14:00:00Z');
    expect(repairDayInZone(discovered, now, TZ)).toBe(elapsedRepairDay(discovered, now));
  });
});

describe('rungs', () => {
  it('fires on each rung and nothing between', () => {
    const e = ev({ carrier_acknowledged_at: '2026-08-01T15:00:00Z' });
    const fired: number[] = [];
    for (let d = 1; d <= 8; d += 1) {
      const iso = `2026-08-0${d}T18:00:00Z`;
      if (kinds(e, iso).includes('escalation_day')) fired.push(d);
    }
    expect(fired).toEqual([...LADDER_RUNGS]);
  });

  it('fires day 9, then weekly, then goes quiet past the cap', () => {
    const e = ev({ carrier_acknowledged_at: '2026-08-01T15:00:00Z' });
    const fires = (iso: string) =>
      evaluateEvent(e, at(iso), TZ).actions.some((x) => x.kind === 'escalation_day');
    // Discovered Aug 1 = day 1, so Aug N is day N.
    expect(fires('2026-08-09T18:00:00Z')).toBe(true);  // day 9
    expect(fires('2026-08-16T18:00:00Z')).toBe(true);  // day 16
    expect(fires('2026-08-23T18:00:00Z')).toBe(true);  // day 23
    for (const iso of ['2026-08-10T18:00:00Z', '2026-08-15T18:00:00Z', '2026-08-22T18:00:00Z']) {
      expect(fires(iso)).toBe(false);
    }
    // Past the cap the event stays open but stops mailing.
    for (const iso of ['2026-08-30T18:00:00Z', '2026-09-13T18:00:00Z']) {
      expect(fires(iso)).toBe(false);
    }
  });


  it('a backdated report fires only the current rung, listing the skipped ones', () => {
    // Discovered Aug 1, reported Aug 3 (48h backdate) — first evaluation is day 3.
    const e = ev({
      discovered_at: '2026-08-01T14:00:00Z',
      created_at: '2026-08-03T14:00:00Z',
      carrier_acknowledged_at: '2026-08-03T15:00:00Z',
    });
    const res = evaluateEvent(e, at('2026-08-03T18:00:00Z'), TZ);
    const rungs = res.actions.filter((a) => a.kind === 'escalation_day');
    expect(rungs).toHaveLength(1);
    expect(rungs[0].dayNumber).toBe(3);
    // Day 3 is the current rung; nothing below it exists to skip.
    expect(rungs[0].skippedRungs).toBeUndefined();
    expect(res.actions.filter((a) => a.kind === 'extension_prompt')).toHaveLength(1);
    // One rung + one prompt, never five simultaneous sends.
    expect(res.actions).toHaveLength(2);
  });

  it('reports rungs that elapsed before the driver reported it', () => {
    const e = ev({
      discovered_at: '2026-07-29T14:00:00Z', // day 1
      created_at: '2026-08-02T14:00:00Z',    // first evaluated on day 5
      carrier_acknowledged_at: '2026-08-02T15:00:00Z',
    });
    const rung = evaluateEvent(e, at('2026-08-02T18:00:00Z'), TZ)
      .actions.find((a) => a.kind === 'escalation_day');
    expect(rung?.dayNumber).toBe(5);
    expect(rung?.skippedRungs).toEqual([3]);
  });
});

describe('extension window keys on created_at, not discovered_at', () => {
  it('stays open five days after notification even when discovery was backdated', () => {
    const created = '2026-08-03T14:00:00Z';
    expect(extensionWindowOpen(created, at('2026-08-08T13:00:00Z'))).toBe(true);
    expect(extensionWindowOpen(created, at('2026-08-08T15:00:00Z'))).toBe(false);
  });

  it('offers the prompt from day 3 while the window is open', () => {
    const e = ev({ carrier_acknowledged_at: '2026-08-01T15:00:00Z' });
    expect(kinds(e, '2026-08-02T18:00:00Z')).not.toContain('extension_prompt');
    expect(kinds(e, '2026-08-03T18:00:00Z')).toContain('extension_prompt');
    // Window measured from created_at (Aug 1) closes Aug 6.
    expect(kinds(e, '2026-08-07T18:00:00Z')).not.toContain('extension_prompt');
  });

  it('drops the prompt the moment an extension is granted', () => {
    const e = ev({
      carrier_acknowledged_at: '2026-08-01T15:00:00Z',
      extension_granted_at: '2026-08-03T10:00:00Z',
    });
    expect(kinds(e, '2026-08-03T18:00:00Z')).not.toContain('extension_prompt');
  });
});

describe('ack_overdue cadence and stops', () => {
  const base = ev();

  it('fires at 24h, again at 72h, then stops', () => {
    expect(kinds(base, '2026-08-02T04:00:00Z')).not.toContain('ack_overdue'); // 14h
    expect(kinds(base, '2026-08-02T15:00:00Z')).toContain('ack_overdue');     // 25h
    expect(kinds(base, '2026-08-03T15:00:00Z')).not.toContain('ack_overdue'); // 49h
    expect(kinds(base, '2026-08-04T15:00:00Z')).toContain('ack_overdue');     // 73h
    expect(kinds(base, '2026-08-05T15:00:00Z')).not.toContain('ack_overdue'); // 97h — silent
    expect(kinds(base, '2026-08-12T15:00:00Z')).not.toContain('ack_overdue');
  });

  it('stops on acknowledgment', () => {
    const e = ev({ carrier_acknowledged_at: '2026-08-02T09:00:00Z' });
    expect(kinds(e, '2026-08-02T15:00:00Z')).not.toContain('ack_overdue');
  });

  it('stops on resolve', () => {
    const e = ev({ status: 'resolved' });
    expect(evaluateEvent(e, at('2026-08-02T15:00:00Z'), TZ).actions).toHaveLength(0);
  });

  it('stops on a granted extension', () => {
    const e = ev({ extension_granted_at: '2026-08-02T09:00:00Z' });
    expect(kinds(e, '2026-08-02T15:00:00Z')).not.toContain('ack_overdue');
  });

  it('fires through a pause — a pause must not hide an unseen notice', () => {
    const e = ev({ escalations_suppressed_until: '2026-08-30', escalations_suppressed_reason: 'parts on order' });
    const k = kinds(e, '2026-08-02T15:00:00Z');
    expect(k).toContain('ack_overdue');
    expect(k).not.toContain('escalation_day');
  });

  it('carries no day_number, which is what the NULLS NOT DISTINCT key covers', () => {
    const a = evaluateEvent(base, at('2026-08-02T15:00:00Z'), TZ)
      .actions.find((x) => x.kind === 'ack_overdue');
    expect(a?.dayNumber).toBeNull();
  });
});

describe('pause lifecycle', () => {
  it('suppresses rungs while paused and announces the lapse alone', () => {
    const e = ev({
      carrier_acknowledged_at: '2026-08-01T15:00:00Z',
      escalations_suppressed_until: '2026-08-04',
    });
    expect(kinds(e, '2026-08-03T18:00:00Z')).toEqual([]);
    // Day 5 is a rung, but the lapse run must carry the lapse and nothing else.
    expect(kinds(e, '2026-08-05T18:00:00Z')).toEqual(['pause_lapsed']);
  });

  it('resumes the ladder the day after the lapse, and never re-announces it', () => {
    const e = ev({
      carrier_acknowledged_at: '2026-08-01T15:00:00Z',
      escalations_suppressed_until: '2026-08-04',
    });
    // Aug 6 is day 6 — a rung. The lapse belongs to Aug 5 only.
    const next = kinds(e, '2026-08-06T18:00:00Z');
    expect(next).toContain('escalation_day');
    expect(next).not.toContain('pause_lapsed');
  });

  it('never emits a past-deadline rung alongside the lapse on a long pause', () => {
    const e = ev({
      carrier_acknowledged_at: '2026-08-01T15:00:00Z',
      escalations_suppressed_until: '2026-08-08',
    });
    expect(kinds(e, '2026-08-09T18:00:00Z')).toEqual(['pause_lapsed']);
  });

  it('treats a manual lift (expiry set to yesterday) exactly like an automatic lapse', () => {
    // The console's lift button ENDS the pause rather than clearing it, so the
    // lift leaves the same one-day trace: lapse alone on the next run, rungs
    // after that. Clearing the column would skip the lapse and let a rung fire
    // in the same run as the resume.
    const e = ev({
      carrier_acknowledged_at: '2026-08-01T15:00:00Z',
      escalations_suppressed_until: '2026-08-04', // lifted on Aug 5
    });
    expect(kinds(e, '2026-08-05T18:00:00Z')).toEqual(['pause_lapsed']);
    expect(kinds(e, '2026-08-06T18:00:00Z')).toEqual(['escalation_day']);
  });

  it('a cleared pause would resume and escalate in the same run — the case the lift avoids', () => {
    const cleared = ev({
      carrier_acknowledged_at: '2026-08-01T15:00:00Z',
      escalations_suppressed_until: null,
    });
    // (the filing prompt is also still open on Aug 5 — the point is the rung)
    expect(kinds(cleared, '2026-08-05T18:00:00Z')).toContain('escalation_day');
    expect(kinds(cleared, '2026-08-05T18:00:00Z')).not.toContain('pause_lapsed');
  });
});

describe('a recorded extension stops the ladder', () => {
  const granted = (over = {}) => ev({
    carrier_acknowledged_at: '2026-08-01T15:00:00Z',
    extension_granted_at: '2026-08-05T10:00:00Z',
    extension_expires_on: '2026-08-20',
    ...over,
  });

  it('suppresses the day-9+ past-deadline repeats', () => {
    expect(kinds(granted(), '2026-08-09T18:00:00Z')).toEqual([]);
    expect(kinds(granted(), '2026-08-15T18:00:00Z')).toEqual([]);
  });

  it('suppresses the remaining rungs inside the original window too', () => {
    expect(kinds(granted(), '2026-08-06T18:00:00Z')).toEqual([]);
  });

  it('holds indefinitely when no extended date was recorded', () => {
    expect(kinds(granted({ extension_expires_on: null }), '2026-09-01T18:00:00Z')).toEqual([]);
  });

  it('resumes once the extended date passes', () => {
    // Day 23 — the next past-deadline send day after the extension lapses.
    expect(kinds(granted(), '2026-08-23T18:00:00Z')).toEqual(['escalation_day']);
  });


  it('leaves ack_overdue alone — a granted extension already ends it', () => {
    const unacked = granted({ carrier_acknowledged_at: null });
    expect(kinds(unacked, '2026-08-02T15:00:00Z')).not.toContain('ack_overdue');
  });
});

describe('driver quiet hours', () => {
  it('allows 07:00–20:59 local and holds the rest', () => {
    expect(driverQuietHoursOk(at('2026-08-03T13:00:00Z'), TZ)).toBe(true);  // 08:00 CT
    expect(driverQuietHoursOk(at('2026-08-03T10:00:00Z'), TZ)).toBe(false); // 05:00 CT
    expect(driverQuietHoursOk(at('2026-08-04T03:00:00Z'), TZ)).toBe(false); // 22:00 CT
  });
});
