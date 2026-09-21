import { describe, it, expect } from 'vitest';
import {
  canSaveAbsence,
  formatReasonBreakdown,
  formatStretchDates,
  groupAbsenceStretches,
  resolveRange,
  summarizeAbsence,
  type AbsenceDay,
} from '@/lib/absenceLog';

const day = (
  log_date: string,
  status: AbsenceDay['status'],
  absence_reason: string | null = null,
  notes: string | null = null,
): AbsenceDay => ({ log_date, status, absence_reason, notes });

describe('groupAbsenceStretches', () => {
  it('collapses consecutive days that share status, reason and note', () => {
    const out = groupAbsenceStretches([
      day('2026-09-01', 'truck_down', 'truck_down', 'clutch'),
      day('2026-09-02', 'truck_down', 'truck_down', 'clutch'),
      day('2026-09-03', 'truck_down', 'truck_down', 'clutch'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: '2026-09-01', end: '2026-09-03', days: 3 });
  });

  it('starts a new stretch across a calendar gap', () => {
    const out = groupAbsenceStretches([
      day('2026-09-01', 'home', 'home_time'),
      day('2026-09-03', 'home', 'home_time'),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map(s => s.start)).toEqual(['2026-09-03', '2026-09-01']); // newest first
  });

  it('starts a new stretch when the reason changes mid-run', () => {
    const out = groupAbsenceStretches([
      day('2026-09-01', 'truck_down', 'truck_down'),
      day('2026-09-02', 'truck_down', 'waiting_on_load'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('starts a new stretch when the status changes', () => {
    const out = groupAbsenceStretches([
      day('2026-09-01', 'home', 'home_time'),
      day('2026-09-02', 'truck_down', 'home_time'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('spans a month boundary without splitting', () => {
    const out = groupAbsenceStretches([
      day('2026-08-31', 'home', 'vacation'),
      day('2026-09-01', 'home', 'vacation'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: '2026-08-31', end: '2026-09-01', days: 2 });
  });

  it('spans a leap-day boundary', () => {
    const out = groupAbsenceStretches([
      day('2028-02-28', 'home', 'medical'),
      day('2028-02-29', 'home', 'medical'),
      day('2028-03-01', 'home', 'medical'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].days).toBe(3);
  });

  it('handles a single day and unsorted input', () => {
    const out = groupAbsenceStretches([
      day('2026-09-05', 'home', 'personal'),
      day('2026-09-04', 'home', 'personal'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: '2026-09-04', end: '2026-09-05', days: 2 });
  });

  it('treats an empty note and a null note as the same thing', () => {
    const out = groupAbsenceStretches([
      day('2026-09-01', 'home', 'home_time', ''),
      day('2026-09-02', 'home', 'home_time', null),
    ]);
    expect(out).toHaveLength(1);
  });

  it('returns nothing for no days', () => {
    expect(groupAbsenceStretches([])).toEqual([]);
  });
});

describe('summarizeAbsence', () => {
  it('counts off-road days by reason and keeps dispatched days apart', () => {
    const totals = summarizeAbsence([
      day('2026-09-01', 'dispatched'),
      day('2026-09-02', 'truck_down', 'truck_down'),
      day('2026-09-03', 'truck_down', 'truck_down'),
      day('2026-09-04', 'home', null),
    ]);
    expect(totals.dispatchedDays).toBe(1);
    expect(totals.offRoadDays).toBe(3);
    expect(totals.byReason).toEqual({ truck_down: 2, unspecified: 1 });
  });

  it('reads back biggest reason first', () => {
    const totals = summarizeAbsence([
      day('2026-09-01', 'home', 'home_time'),
      day('2026-09-02', 'truck_down', 'truck_down'),
      day('2026-09-03', 'truck_down', 'truck_down'),
    ]);
    expect(formatReasonBreakdown(totals)).toBe('2 truck down · 1 home time');
  });
});

describe('canSaveAbsence', () => {
  it('requires a note for Other', () => {
    expect(canSaveAbsence('other', '   ')).toBe(false);
    expect(canSaveAbsence('other', 'family emergency')).toBe(true);
  });
  it('accepts a known reason without a note, and no reason at all', () => {
    expect(canSaveAbsence('truck_down', '')).toBe(true);
    expect(canSaveAbsence(null, '')).toBe(true);
  });
  it('refuses an unknown reason', () => {
    expect(canSaveAbsence('sabbatical', 'x')).toBe(false);
  });
});

describe('resolveRange', () => {
  const today = new Date(2026, 8, 21); // 21 Sep 2026

  it('month, quarter and year all end today', () => {
    expect(resolveRange('this_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-21' });
    expect(resolveRange('this_quarter', today)).toEqual({ from: '2026-07-01', to: '2026-09-21' });
    expect(resolveRange('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-09-21' });
    expect(resolveRange('all', today).from).toBe('2020-01-01');
  });
});

describe('formatStretchDates', () => {
  it('shows one date for a single day and a span otherwise', () => {
    expect(formatStretchDates('2026-09-04', '2026-09-04')).toBe('Sep 4, 2026');
    expect(formatStretchDates('2026-09-04', '2026-09-08')).toBe('Sep 4 – Sep 8, 2026');
    expect(formatStretchDates('2025-12-30', '2026-01-02')).toBe('Dec 30, 2025 – Jan 2, 2026');
  });
});
