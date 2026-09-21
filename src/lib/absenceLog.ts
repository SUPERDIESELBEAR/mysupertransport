/**
 * ABSENCE LOG — pure helpers.
 *
 * "Absence" is the all-encompassing word for a day the driver was not on the
 * road: truck down, home time, vacation, medical, waiting on a load. It is a
 * DISPATCH RECORD, kept per calendar day on `dispatch_daily_log`, and it
 * replaces the single overwritten Notes field that kept no history at all.
 *
 * Deliberately separate from `operators.is_parked` (a current administrative
 * state, see src/lib/parking.ts) and from `lease_terminations` (the legal end
 * of the ICA). One is "where is he today", the other is "what happened in
 * August" — different questions, different writers.
 */

export const ABSENCE_REASONS = [
  'truck_down',
  'home_time',
  'vacation',
  'medical',
  'personal',
  'waiting_on_load',
  'no_driver',
  'other',
] as const;

export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

const REASON_LABELS: Record<AbsenceReason, string> = {
  truck_down: 'Truck Down',
  home_time: 'Home Time',
  vacation: 'Vacation',
  medical: 'Medical',
  personal: 'Personal',
  waiting_on_load: 'Waiting on Load',
  no_driver: 'No Driver',
  other: 'Other',
};

export function absenceReasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'No reason recorded';
  return REASON_LABELS[reason as AbsenceReason] ?? reason;
}

export function isAbsenceReason(value: unknown): value is AbsenceReason {
  return typeof value === 'string' && (ABSENCE_REASONS as readonly string[]).includes(value);
}

/** `other` must carry a note — otherwise the entry says nothing at all. */
export function canSaveAbsence(reason: string | null, note: string): boolean {
  if (reason === null || reason === '') return true; // no reason chosen is allowed (e.g. dispatched)
  if (!isAbsenceReason(reason)) return false;
  if (reason === 'other') return note.trim().length > 0;
  return true;
}

export type AbsenceDayStatus = 'dispatched' | 'home' | 'truck_down' | 'not_dispatched';

/** One row of `dispatch_daily_log`, as the Absence Log reads it. */
export interface AbsenceDay {
  log_date: string;            // YYYY-MM-DD
  status: AbsenceDayStatus;
  absence_reason: string | null;
  notes: string | null;
  notes_by_name?: string | null;
  notes_at?: string | null;
}

/** A run of consecutive days sharing one status + reason + note. */
export interface AbsenceStretch {
  start: string;
  end: string;
  days: number;
  status: AbsenceDayStatus;
  reason: string | null;
  note: string | null;
  enteredByName: string | null;
  enteredAt: string | null;
  /** True when the whole stretch sits after today — a scheduled absence. */
  planned: boolean;
}

/** Today as YYYY-MM-DD in local calendar terms (not UTC-shifted). */
export function todayIso(now = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Furthest date a planned absence may be booked: one year from today. */
export function maxPlannedDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setFullYear(d.getFullYear() + 1);
  return todayIso(d);
}

/** "YYYY-MM-DD" -> day number, with no timezone in play. */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
}

const norm = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * Collapse consecutive days that share status, reason and note into one
 * stretch. A calendar gap, a change of status, a change of reason, or a
 * different note all start a new stretch. Returned newest-first.
 */
export function groupAbsenceStretches(days: AbsenceDay[], today = todayIso()): AbsenceStretch[] {
  const sorted = [...days].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const out: AbsenceStretch[] = [];

  for (const day of sorted) {
    const reason = norm(day.absence_reason);
    const note = norm(day.notes);
    const last = out[out.length - 1];
    const contiguous =
      last !== undefined &&
      dayNumber(day.log_date) === dayNumber(last.end) + 1 &&
      last.status === day.status &&
      last.reason === reason &&
      last.note === note;

    if (contiguous) {
      last.end = day.log_date;
      last.days += 1;
      continue;
    }

    out.push({
      planned: day.log_date > today,
      start: day.log_date,
      end: day.log_date,
      days: 1,
      status: day.status,
      reason,
      note,
      enteredByName: norm(day.notes_by_name),
      enteredAt: norm(day.notes_at),
    });
  }

  return out.reverse();
}

export interface AbsenceTotals {
  offRoadDays: number;
  dispatchedDays: number;
  /** Off-road days that sit after today — scheduled, not yet taken. */
  plannedDays: number;
  /** Day counts keyed by reason, plus `unspecified` for off-road days with no reason. */
  byReason: Record<string, number>;
}

/**
 * Totals for the summary line above the log. Days after today are PLANNED:
 * counted separately so a booked vacation never inflates the off-road total.
 */
export function summarizeAbsence(days: AbsenceDay[], today = todayIso()): AbsenceTotals {
  const totals: AbsenceTotals = { offRoadDays: 0, dispatchedDays: 0, plannedDays: 0, byReason: {} };
  for (const day of days) {
    if (day.log_date > today) {
      if (day.status !== 'dispatched') totals.plannedDays += 1;
      continue;
    }
    if (day.status === 'dispatched') {
      totals.dispatchedDays += 1;
      continue;
    }
    totals.offRoadDays += 1;
    const key = norm(day.absence_reason) ?? 'unspecified';
    totals.byReason[key] = (totals.byReason[key] ?? 0) + 1;
  }
  return totals;
}

/** "11 truck down · 8 home time · 4 other", biggest first. */
export function formatReasonBreakdown(totals: AbsenceTotals): string {
  return Object.entries(totals.byReason)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, n]) =>
      `${n} ${reason === 'unspecified' ? 'no reason given' : absenceReasonLabel(reason).toLowerCase()}`)
    .join(' · ');
}

export type AbsenceRangePreset = 'this_month' | 'this_quarter' | 'this_year' | 'all' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Resolve a preset to an inclusive from/to pair. `all` starts at 2020-01-01. */
export function resolveRange(preset: AbsenceRangePreset, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const to = iso(y, m, today.getDate());
  switch (preset) {
    case 'this_month':
      return { from: iso(y, m, 1), to };
    case 'this_quarter': {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, qStart, 1), to };
    }
    case 'this_year':
      return { from: iso(y, 1, 1), to };
    case 'all':
    default:
      return { from: '2020-01-01', to };
  }
}

/** "Sep 14 – Sep 18, 2026", or a single date when the stretch is one day. */
export function formatStretchDates(start: string, end: string): string {
  const fmt = (dateIso: string, withYear: boolean) => {
    const d = new Date(`${dateIso}T12:00:00`);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  };
  if (start === end) return fmt(start, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}
