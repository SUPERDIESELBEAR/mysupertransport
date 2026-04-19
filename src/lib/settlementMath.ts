/**
 * Settlement Forecast math
 *
 * Payroll structure (US Central):
 *  - Work week:  Wednesday 12:00 AM → following Tuesday 11:59 PM
 *  - Payday:     Tuesday, exactly 14 days after the work-week's Tuesday end
 *
 * Example: Work week Apr 1 (Wed) – Apr 7 (Tue)  →  Payday Apr 21 (Tue)
 *
 * All dates are handled as plain "YYYY-MM-DD" strings + noon parsing to avoid
 * any timezone shifting (project convention — see mem://arch/date-parsing/local-midnight).
 */

export const PAY_PERCENTAGE_DEFAULT = 72;

/** Parse a "YYYY-MM-DD" string as a local-noon Date (avoids TZ shift). */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

/** Format a Date as "YYYY-MM-DD". */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add `days` to a Date and return a new Date. */
function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export interface WorkWeek {
  /** "YYYY-MM-DD" of the Wednesday that starts the work week */
  weekStart: string;
  /** "YYYY-MM-DD" of the Tuesday that ends the work week */
  weekEnd: string;
  /** "YYYY-MM-DD" of the Tuesday payday (weekEnd + 14 days) */
  payday: string;
}

/**
 * Given any date string ("YYYY-MM-DD"), return the work week (Wed–Tue) it
 * belongs to and the matching payday (Tue, 14 days after weekEnd).
 */
export function getWorkWeekFor(dateStr: string): WorkWeek {
  const date = parseLocalDate(dateStr);
  // JS: Sunday=0, Monday=1, Tuesday=2, Wednesday=3, ..., Saturday=6
  const dow = date.getDay();
  // Days back to most recent Wednesday (inclusive of "today is Wed" → 0)
  const daysBackToWed = (dow - 3 + 7) % 7;
  const weekStartDate = addDays(date, -daysBackToWed);
  const weekEndDate = addDays(weekStartDate, 6); // Wed + 6 = Tue
  const paydayDate = addDays(weekEndDate, 14);
  return {
    weekStart: toDateStr(weekStartDate),
    weekEnd: toDateStr(weekEndDate),
    payday: toDateStr(paydayDate),
  };
}

/**
 * Return the next N upcoming paydays (Tuesdays) starting from today's
 * current work-week payday. Always includes the current pay period as #1.
 */
export function getUpcomingPaydays(count = 3, fromDate: Date = new Date()): WorkWeek[] {
  const today = toDateStr(fromDate);
  const current = getWorkWeekFor(today);
  const result: WorkWeek[] = [current];
  for (let i = 1; i < count; i++) {
    // Next work week starts 7 days after the current weekStart
    const nextStart = addDays(parseLocalDate(result[i - 1].weekStart), 7);
    result.push(getWorkWeekFor(toDateStr(nextStart)));
  }
  return result;
}

/** Format a date string as "Tue Apr 21". */
export function formatShortDay(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format a date string as "Apr 21, 2026". */
export function formatLongDay(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a date string as "Apr 21" (no year). */
export function formatMonthDay(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a number as "$1,234.56". */
export function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Split a total amount into N installments, distributing pennies to the first
 * installment so the sum is exact.
 *
 * Example: $1000 / 3  →  [333.34, 333.33, 333.33]
 */
export function splitInstallments(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = i < remainder ? base + 1 : base;
    result.push(c / 100);
  }
  return result;
}

/**
 * Compute the list of paydays (Tuesdays) for an installment series, starting
 * at `firstPayday` and stepping +7 days for each subsequent installment.
 */
export function buildInstallmentPaydays(firstPayday: string, count: number): string[] {
  const result: string[] = [];
  let d = parseLocalDate(firstPayday);
  for (let i = 0; i < count; i++) {
    result.push(toDateStr(d));
    d = addDays(d, 7);
  }
  return result;
}
