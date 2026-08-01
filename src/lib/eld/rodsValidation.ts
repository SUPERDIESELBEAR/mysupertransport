/**
 * Arithmetic on the face of the form only.
 *
 * This checks that a day's duty-status segments add up to 24 hours and that the
 * required 395.8 header fields are present. It performs NO hours-of-service
 * calculation of any kind — no 11/14/70-hour limits, no available-hours math,
 * no violation detection. RECAP entries are whatever the driver typed and are
 * never computed or validated.
 */
import { MINUTES_PER_DAY, dutyStatusLabel, formatClock, formatMinutes } from './rodsGridGeometry';
import { isCompleteEvent, type RodsDay, type RodsEvent } from './rodsTypes';

/**
 * Three states, not a boolean.
 *
 * 'pending' means "cannot be judged yet" — the coverage checks are meaningless
 * while a segment is still missing its end time, and showing them as failures
 * would tell the driver to fix something that isn't wrong yet.
 */
export type ValidationState = 'pass' | 'fail' | 'pending';

export interface ValidationCheck {
  id: string;
  label: string;
  state: ValidationState;
  detail?: string;
}

export interface GapRange {
  start_minute: number;
  end_minute: number;
}

export interface RodsValidation {
  checks: ValidationCheck[];
  canCertify: boolean;
  totalMinutes: number;
  totals: { off: number; sleeper: number; driving: number; onDuty: number };
  /** Uncovered stretches of the day. Only computed once every segment is complete. */
  gaps: GapRange[];
  /** Local ids / ids of segments that are still missing a field. */
  incompleteIds: string[];
}

/** Totals ignore incomplete segments — a segment with no end time has no duration. */
export function statusTotals(events: RodsEvent[]) {
  const totals = { off: 0, sleeper: 0, driving: 0, onDuty: 0 };
  for (const e of events) {
    if (e.end_minute === null || e.duty_status === null) continue;
    const mins = Math.max(0, e.end_minute - e.start_minute);
    if (e.duty_status === 1) totals.off += mins;
    else if (e.duty_status === 2) totals.sleeper += mins;
    else if (e.duty_status === 3) totals.driving += mins;
    else totals.onDuty += mins;
  }
  return totals;
}

/**
 * Mirrors the 12-field header guard inside certify_rods_day EXACTLY. The server
 * is the enforcement point; this list exists so the driver sees what is missing
 * before tapping Certify instead of hitting an opaque database error. If the two
 * drift, a driver gets a rejection with nothing highlighted — keep them in sync.
 *
 * total_mileage_today is deliberately absent: an unavailable odometer reading
 * must never make a log uncertifiable.
 *
 * This checklist is keyed-log only. An uploaded ELD document (record_source =
 * 'eld_document') is certified on the driver's own device, is filed
 * already-certified by create_eld_document_day, and has no keyed face — so
 * running this against one reports failures the record does not have. Since
 * 2026-08-01 certify_rods_day refuses anything that is not keyed (P0019) and
 * record_source is immutable after insert (P0045); the segment and header
 * guards are therefore unconditional for everything that reaches them.
 * Pinned by fixtures 17–19 in
 * src/lib/eld/offline/__tests__/parityFixtures.test.ts.
 *
 * The four carrier/terminal fields are snapshotted at draft creation from the
 * cached carrier, so in practice they are only ever missing on rows created
 * before that snapshot existed.
 */
const REQUIRED_HEADER: Array<[keyof RodsDay, string]> = [
  ['carrier_name', 'Carrier name'],
  ['carrier_usdot', 'Carrier USDOT number'],
  ['carrier_mc', 'Carrier MC number'],
  ['main_office_address', 'Main office address'],
  ['truck_number', 'Truck / tractor number'],
  ['home_terminal_address', 'Home terminal address'],
  ['home_terminal_timezone', 'Home terminal time standard'],
  ['from_location', 'From'],
  ['to_location', 'To'],
  ['co_driver_name', 'Co-driver name (enter "None" if you drove alone)'],
  ['shipping_document_no', 'Shipping document no. (or shipper and commodity)'],
  ['total_miles_driving_today', 'Total miles driving today'],
];

/**
 * Uncovered stretches of the 24-hour period, given complete segments.
 *
 * These are surfaced, never filled. Closing a gap on the driver's behalf would
 * put a duty status and a location on the record that the driver never entered.
 */
export function findGaps(events: Array<{ start_minute: number; end_minute: number | null }>): GapRange[] {
  const sorted = [...events]
    .filter((e): e is { start_minute: number; end_minute: number } => e.end_minute !== null)
    .sort((a, b) => a.start_minute - b.start_minute);
  const gaps: GapRange[] = [];
  let cursor = 0;
  for (const e of sorted) {
    if (e.start_minute > cursor) gaps.push({ start_minute: cursor, end_minute: e.start_minute });
    cursor = Math.max(cursor, e.end_minute);
  }
  if (cursor < MINUTES_PER_DAY) gaps.push({ start_minute: cursor, end_minute: MINUTES_PER_DAY });
  return gaps;
}

function describeIncomplete(e: RodsEvent): string {
  const missing: string[] = [];
  if (e.end_minute === null) missing.push('an end time');
  if (e.duty_status === null) missing.push('a duty status');
  if (!e.city?.trim()) missing.push('a city');
  if (!e.state?.trim()) missing.push('a state');
  return `The ${formatClock(e.start_minute)} entry needs ${missing.join(', ')}.`;
}

export function validateRodsDay(
  day: RodsDay,
  events: RodsEvent[],
  legalName: string,
): RodsValidation {
  const sorted = [...events].sort((a, b) => a.start_minute - b.start_minute);
  const totals = statusTotals(sorted);
  const totalMinutes = totals.off + totals.sleeper + totals.driving + totals.onDuty;

  const checks: ValidationCheck[] = [];

  const incomplete = sorted.filter((e) => !isCompleteEvent(e));
  const allComplete = sorted.length > 0 && incomplete.length === 0;

  checks.push({
    id: 'has_segments',
    label: 'At least one duty-status entry',
    state: sorted.length > 0 ? 'pass' : 'fail',
  });

  checks.push({
    id: 'all_segments_complete',
    label: 'Every entry has an end time, duty status, city and state',
    state: sorted.length === 0 ? 'pending' : (allComplete ? 'pass' : 'fail'),
    detail: incomplete.length
      ? incomplete.slice(0, 4).map(describeIncomplete).join(' ')
        + (incomplete.length > 4 ? ` (+${incomplete.length - 4} more)` : '')
      : undefined,
  });

  // Overlaps are always meaningful: two entries claiming the same minute is
  // wrong whether or not the rest of the day is finished.
  let overlap: string | undefined;
  let cursor = 0;
  for (const e of sorted) {
    if (e.end_minute === null) continue;
    if (e.start_minute < cursor && !overlap) {
      overlap = `Two entries overlap at ${formatClock(e.start_minute)}.`;
    }
    cursor = Math.max(cursor, e.end_minute);
  }
  checks.push({
    id: 'no_overlaps',
    label: 'No two entries overlap',
    state: overlap ? 'fail' : 'pass',
    detail: overlap,
  });

  // Coverage is unjudgeable while a segment is unfinished — 'pending', not
  // 'fail'. Gaps are reported, never closed automatically.
  const gaps = allComplete ? findGaps(sorted) : [];
  checks.push({
    id: 'no_gaps',
    label: 'The whole 24 hours is accounted for',
    state: !allComplete ? 'pending' : (gaps.length === 0 ? 'pass' : 'fail'),
    detail: gaps.length
      ? gaps.slice(0, 3)
        .map((g) => `Nothing recorded between ${formatClock(g.start_minute)} and ${formatClock(g.end_minute)}.`)
        .join(' ')
      : undefined,
  });
  checks.push({
    id: 'sums_to_1440',
    label: 'Entries add up to exactly 24:00',
    state: !allComplete ? 'pending' : (totalMinutes === MINUTES_PER_DAY ? 'pass' : 'fail'),
    detail: allComplete && totalMinutes !== MINUTES_PER_DAY
      ? `Currently ${formatMinutes(totalMinutes)} of 24:00.`
      : undefined,
  });

  const missingHeader = REQUIRED_HEADER.filter(([k]) => {
    const v = day[k];
    return v === null || v === undefined || String(v).trim() === '';
  }).map(([, label]) => label);
  checks.push({
    id: 'header_complete',
    label: 'Required log header fields filled in',
    state: missingHeader.length === 0 ? 'pass' : 'fail',
    detail: missingHeader.length ? `Missing: ${missingHeader.join(', ')}` : undefined,
  });

  checks.push({
    id: 'legal_name',
    label: 'Typed legal name',
    state: legalName.trim().length >= 3 && !isPlaceholderLegalName(legalName)
      ? 'pass'
      : 'fail',
    detail: isPlaceholderLegalName(legalName)
      ? `"${legalName.trim()}" is not a name. A record of duty status must be certified in the driver's own legal name.`
      : undefined,
  });

  return {
    checks,
    // 'pending' blocks certification exactly like 'fail' does. It only changes
    // what the driver is told, never what they are allowed to sign.
    canCertify: checks.every((c) => c.state === 'pass'),
    totalMinutes,
    totals,
    gaps,
    incompleteIds: incomplete.map((e) => e.id),
  };
}

/** Segments shorter than 15 minutes are noted separately in REMARKS. */
export const SHORT_PERIOD_MINUTES = 15;

export function isShortPeriod(startMinute: number, endMinute: number | null): boolean | null {
  if (endMinute === null) return null;
  return endMinute - startMinute < SHORT_PERIOD_MINUTES;
}

export { dutyStatusLabel };