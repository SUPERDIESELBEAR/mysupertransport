/**
 * Arithmetic on the face of the form only.
 *
 * This checks that a day's duty-status segments add up to 24 hours and that the
 * required 395.8 header fields are present. It performs NO hours-of-service
 * calculation of any kind — no 11/14/70-hour limits, no available-hours math,
 * no violation detection. RECAP entries are whatever the driver typed and are
 * never computed or validated.
 */
import { MINUTES_PER_DAY, formatClock, formatMinutes } from './rodsGridGeometry';
import type { RodsDay, RodsEvent } from './rodsTypes';

export interface ValidationCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface RodsValidation {
  checks: ValidationCheck[];
  canCertify: boolean;
  totalMinutes: number;
  totals: { off: number; sleeper: number; driving: number; onDuty: number };
}

export function statusTotals(events: RodsEvent[]) {
  const totals = { off: 0, sleeper: 0, driving: 0, onDuty: 0 };
  for (const e of events) {
    const mins = Math.max(0, e.end_minute - e.start_minute);
    if (e.duty_status === 1) totals.off += mins;
    else if (e.duty_status === 2) totals.sleeper += mins;
    else if (e.duty_status === 3) totals.driving += mins;
    else totals.onDuty += mins;
  }
  return totals;
}

const REQUIRED_HEADER: Array<[keyof RodsDay, string]> = [
  ['truck_number', 'Truck / tractor number'],
  ['home_terminal_address', 'Home terminal address'],
  ['from_location', 'From'],
  ['to_location', 'To'],
];

export function validateRodsDay(
  day: RodsDay,
  events: RodsEvent[],
  legalName: string,
): RodsValidation {
  const sorted = [...events].sort((a, b) => a.start_minute - b.start_minute);
  const totals = statusTotals(sorted);
  const totalMinutes = totals.off + totals.sleeper + totals.driving + totals.onDuty;

  const checks: ValidationCheck[] = [];

  checks.push({
    id: 'has_segments',
    label: 'At least one duty-status entry',
    ok: sorted.length > 0,
  });

  // Gaps and overlaps
  let gap: string | undefined;
  let overlap: string | undefined;
  let cursor = 0;
  for (const e of sorted) {
    if (e.start_minute > cursor && !gap) {
      gap = `Nothing recorded between ${formatClock(cursor)} and ${formatClock(e.start_minute)}`;
    }
    if (e.start_minute < cursor && !overlap) {
      overlap = `Two entries overlap at ${formatClock(e.start_minute)}`;
    }
    cursor = Math.max(cursor, e.end_minute);
  }
  if (sorted.length > 0 && cursor < MINUTES_PER_DAY && !gap) {
    gap = `Nothing recorded after ${formatClock(cursor)}`;
  }

  checks.push({
    id: 'no_gaps',
    label: 'The whole 24 hours is accounted for',
    ok: sorted.length > 0 && !gap,
    detail: gap,
  });
  checks.push({
    id: 'no_overlaps',
    label: 'No two entries overlap',
    ok: !overlap,
    detail: overlap,
  });
  checks.push({
    id: 'sums_to_1440',
    label: 'Entries add up to exactly 24:00',
    ok: totalMinutes === MINUTES_PER_DAY,
    detail: `Currently ${formatMinutes(totalMinutes)} of 24:00`,
  });

  const missingPlace = sorted.find((e) => !e.city?.trim() || !e.state?.trim());
  checks.push({
    id: 'place_on_every_change',
    label: 'City and state on every change of duty status',
    ok: !missingPlace,
    detail: missingPlace ? `Missing on the entry starting ${formatClock(missingPlace.start_minute)}` : undefined,
  });

  const missingHeader = REQUIRED_HEADER.filter(([k]) => {
    const v = day[k];
    return v === null || v === undefined || String(v).trim() === '';
  }).map(([, label]) => label);
  checks.push({
    id: 'header_complete',
    label: 'Required log header fields filled in',
    ok: missingHeader.length === 0,
    detail: missingHeader.length ? `Missing: ${missingHeader.join(', ')}` : undefined,
  });

  checks.push({
    id: 'legal_name',
    label: 'Typed legal name',
    ok: legalName.trim().length >= 3,
  });

  return {
    checks,
    canCertify: checks.every((c) => c.ok),
    totalMinutes,
    totals,
  };
}

/** Segments shorter than 15 minutes are noted separately in REMARKS. */
export const SHORT_PERIOD_MINUTES = 15;

export function isShortPeriod(startMinute: number, endMinute: number): boolean {
  return endMinute - startMinute < SHORT_PERIOD_MINUTES;
}