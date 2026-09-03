/**
 * PERIOD ATTRIBUTION — a load belongs to the period in which it DELIVERED,
 * read in the CARRIER timezone.
 *
 * Recorded in docs/tms-build-status.md, "Settlement rules — the authoritative
 * record", section 2. A load delivering 11pm Tuesday Pacific is Wednesday
 * Central and belongs to the FOLLOWING work week. `new Date(v)` is never used
 * to answer that question here: the instant is converted through
 * `isoToNaive`, which reads the carrier zone.
 *
 * The work week starts on `work_week_start_dow` (Postgres numbering, 3 =
 * Wednesday) and runs seven days, ending 23:59 on the seventh. Payday is the
 * Tuesday two weeks after the week ends — end + 14 days.
 */
import { isoToNaive, naiveToIso } from '@/lib/carrierTimezone';

export interface WorkPeriod {
  /** "YYYY-MM-DD", the first day of the work week, carrier zone. */
  periodStart: string;
  /** "YYYY-MM-DD", the seventh day of the work week, carrier zone. */
  periodEnd: string;
  /** "YYYY-MM-DD", periodEnd + 14 days. */
  payday: string;
}

/** The calendar date an instant falls on, read in the carrier timezone. */
export function carrierDateOf(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const value = iso instanceof Date ? iso.toISOString() : iso;
  return isoToNaive(value).slice(0, 10);
}

/**
 * The 'YYYY-MM' an instant falls in, read in the CARRIER timezone.
 *
 * The dispatch company settlement runs on a calendar month (section 4), and a
 * load delivering 7pm on the 31st Pacific is the 1st in Central and belongs to
 * the FOLLOWING month. This resolves through `carrierDateOf` for exactly the
 * reason the weekly attribution does, and never through `new Date(v)` read in
 * whatever zone the machine happens to be set to.
 */
export function monthOf(iso: string | Date | null | undefined): string {
  return carrierDateOf(iso).slice(0, 7);
}

/** True when the instant falls inside the given 'YYYY-MM' calendar month, carrier zone. */
export function inCalendarMonth(
  iso: string | Date | null | undefined,
  month: string,
): boolean {
  const m = monthOf(iso);
  return m !== '' && m === month;
}

function utcOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function strOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY = 86_400_000;

/** The work period a carrier-zone calendar date belongs to. */
export function workPeriodForDate(dateStr: string, workWeekStartDow: number): WorkPeriod {
  const startMs = utcOf(dateStr);
  const dow = new Date(startMs).getUTCDay();
  const back = ((dow - workWeekStartDow) % 7 + 7) % 7;
  const periodStartMs = startMs - back * DAY;
  const periodEndMs = periodStartMs + 6 * DAY;
  return {
    periodStart: strOf(periodStartMs),
    periodEnd: strOf(periodEndMs),
    payday: strOf(periodEndMs + 14 * DAY),
  };
}

/** The work period a delivery instant belongs to, read in the carrier zone. */
export function workPeriodForDelivery(
  deliveredAtIso: string | Date | null | undefined,
  workWeekStartDow: number,
): WorkPeriod | null {
  const date = carrierDateOf(deliveredAtIso);
  if (!date) return null;
  return workPeriodForDate(date, workWeekStartDow);
}

/** True when the delivery instant falls inside this period, carrier zone. */
export function deliveredInPeriod(
  deliveredAtIso: string | Date | null | undefined,
  period: Pick<WorkPeriod, 'periodStart' | 'periodEnd'>,
): boolean {
  const date = carrierDateOf(deliveredAtIso);
  if (!date) return false;
  return date >= period.periodStart && date <= period.periodEnd;
}

/**
 * CARRIER-ZONE MONTH ARITHMETIC.
 *
 * Added beside `monthOf` and `inCalendarMonth` for the same reason they live
 * here: UTC runs ahead of Central, so for roughly five hours at the start of
 * each month "this month" read in UTC is a month that has not started yet in
 * Pleasant Hill. On 1 September at 02:00 UTC it is still 31 August there. A
 * consumer computing that locally is exactly the defect this file exists to
 * prevent.
 */

/** The 'YYYY-MM' it is RIGHT NOW in the carrier timezone. */
export function currentCarrierMonth(now: Date = new Date()): string {
  return monthOf(now);
}

/** 'YYYY-MM' shifted by whole months. `shiftMonth('2026-01', -1)` → '2025-12'. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The instant a carrier-zone month BEGINS, as an ISO string.
 *
 * For query boundaries against instant columns (`delivered_at`). Midnight on
 * the first, carrier zone — not midnight UTC, which is the previous evening
 * there and would drag in loads from the prior month.
 */
export function carrierMonthStartIso(month: string): string {
  return naiveToIso(`${month}-01T00:00`);
}

/** N whole months back from the current carrier month, as 'YYYY-MM'. */
export function carrierMonthsAgo(n: number, now: Date = new Date()): string {
  return shiftMonth(currentCarrierMonth(now), -n);
}
