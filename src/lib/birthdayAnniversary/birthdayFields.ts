/** Shared month/day helpers for birthday entry (no year is ever stored). */

export const BIRTH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Feb allows 29 so a leap-day birthday can be entered. */
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInBirthMonth(month: number | null | undefined): number {
  if (!month || month < 1 || month > 12) return 31;
  return DAYS_IN_MONTH[month - 1];
}

/** "March 14" — or null when either half is missing/invalid. */
export function formatBirthday(
  month: number | null | undefined,
  day: number | null | undefined,
): string | null {
  if (!month || !day) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInBirthMonth(month)) return null;
  return `${BIRTH_MONTHS[month - 1]} ${day}`;
}
