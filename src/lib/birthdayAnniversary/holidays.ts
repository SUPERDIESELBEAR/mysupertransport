/**
 * Small US federal-holiday helper used by the staff birthday/anniversary popup
 * to decide when a "real" event date lands on a non-business day and the popup
 * should surface earlier as an "Upcoming" heads-up.
 *
 * All dates are calendar dates (no timezone) — the caller anchors them in
 * US Central Time before comparing.
 */

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  // month is 0-indexed; weekday: 0=Sun ... 6=Sat
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

function observed(date: Date): Date {
  // Federal rule: Sat -> observed Friday; Sun -> observed Monday.
  const day = date.getDay();
  if (day === 6) return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  if (day === 0) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return date;
}

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function usFederalHolidaysFor(year: number): Set<string> {
  const out = new Set<string>();
  const add = (d: Date) => out.add(key(observed(d)));
  add(new Date(year, 0, 1));                              // New Year's Day
  add(nthWeekdayOfMonth(year, 0, 1, 3));                  // MLK Day (3rd Mon Jan)
  add(nthWeekdayOfMonth(year, 1, 1, 3));                  // Presidents' Day (3rd Mon Feb)
  add(lastWeekdayOfMonth(year, 4, 1));                    // Memorial Day (last Mon May)
  add(new Date(year, 5, 19));                             // Juneteenth
  add(new Date(year, 6, 4));                              // Independence Day
  add(nthWeekdayOfMonth(year, 8, 1, 1));                  // Labor Day (1st Mon Sep)
  add(nthWeekdayOfMonth(year, 9, 1, 2));                  // Columbus Day (2nd Mon Oct)
  add(new Date(year, 10, 11));                            // Veterans Day
  add(nthWeekdayOfMonth(year, 10, 4, 4));                 // Thanksgiving (4th Thu Nov)
  add(new Date(year, 11, 25));                            // Christmas
  return out;
}

const holidayCache = new Map<number, Set<string>>();
function getHolidays(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = usFederalHolidaysFor(year);
    holidayCache.set(year, set);
  }
  return set;
}

function isHoliday(d: Date): boolean {
  return getHolidays(d.getFullYear()).has(key(d));
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Given an actual event date, return the earliest business day on which the
 * staff popup should surface. Walks back day-by-day while the candidate is a
 * weekend or a US federal holiday. Same date returned when it's already a
 * business day.
 */
export function earlyWarnDateFor(actual: Date): Date {
  let d = new Date(actual.getFullYear(), actual.getMonth(), actual.getDate());
  while (isWeekend(d) || isHoliday(d)) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return d;
}

export function isSameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}