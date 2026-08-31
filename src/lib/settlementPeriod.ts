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
import { isoToNaive } from '@/lib/carrierTimezone';

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
