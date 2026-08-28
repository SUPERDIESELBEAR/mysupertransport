import { describe, expect, it, afterAll } from 'vitest';
import {
  nextStop, formatCarrierWindow, isEldInstallOutstanding, stillNeededItems, isLive,
} from '@/lib/operatorHome';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

const stop = (seq: number, departed: string | null, type = 'pickup') => ({
  stop_sequence: seq, stop_type: type, facility_name: null, city: 'Tulsa', state: 'OK',
  appointment_start: null, appointment_end: null, actual_departure_at: departed,
});

describe('nextStop', () => {
  it('is the first stop not yet departed, in sequence order', () => {
    const stops = [stop(2, null, 'delivery'), stop(1, '2026-06-20T13:00:00Z')];
    expect(nextStop(stops)?.stop_sequence).toBe(2);
  });

  it('falls back to the last stop once everything is departed', () => {
    const stops = [stop(1, '2026-06-20T13:00:00Z'), stop(2, '2026-06-21T13:00:00Z', 'delivery')];
    expect(nextStop(stops)?.stop_sequence).toBe(2);
  });

  it('is null with no stops', () => {
    expect(nextStop([])).toBeNull();
  });
});

describe('formatCarrierWindow', () => {
  it('reads a window in carrier time whatever the viewer machine is set to', () => {
    const seen = new Set<string>();
    for (const tz of ['America/Chicago', 'Asia/Karachi', 'UTC']) {
      process.env.TZ = tz;
      seen.add(formatCarrierWindow('2026-06-20T13:00:00Z', '2026-06-20T15:00:00Z'));
    }
    process.env.TZ = ORIGINAL_TZ;
    expect(seen.size).toBe(1);
    const only = [...seen][0];
    expect(only).toContain('8:00 AM');
    expect(only).toContain('10:00 AM');
    expect(only).toContain('CDT');
  });

  it('says so plainly when there is no appointment', () => {
    expect(formatCarrierWindow(null, null)).toBe('No appointment set');
  });
});

describe('onboarding runs concurrently with driving', () => {
  const liveButUnfinished = {
    go_live_date: '2026-06-01',
    mvr_status: 'received', ch_status: 'received', mvr_ch_approval: 'approved',
    eld_installed: 'no', decal_applied: 'no',
  };

  it('a live driver still has outstanding items surfaced', () => {
    expect(isLive(liveButUnfinished)).toBe(true);
    expect(stillNeededItems(liveButUnfinished).length).toBeGreaterThan(0);
  });

  it('ELD install counts as outstanding until it is installed', () => {
    expect(isEldInstallOutstanding(liveButUnfinished)).toBe(true);
    expect(isEldInstallOutstanding({ ...liveButUnfinished, eld_installed: 'yes' })).toBe(false);
    expect(isEldInstallOutstanding({ ...liveButUnfinished, eld_exempt: true })).toBe(false);
  });
});
