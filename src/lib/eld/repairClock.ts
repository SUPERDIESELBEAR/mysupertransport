/**
 * The two clocks, client-side — byte-for-byte the same math the escalation job
 * runs in `supabase/functions/_shared/eld/escalationLadder.ts`.
 *
 *  - REPAIR clock: calendar days from `discovered_at` in the home terminal
 *    timezone, discovery date = day 1, so day 8 is `repair_deadline`.
 *  - EXTENSION clock: 5 days (120h) from `created_at`, the driver's
 *    notification, per 49 CFR 395.34(d)(2).
 *
 * They are the same number on every event reported at discovery, and differ by
 * up to two days on a backdated report. The console renders both, always, with
 * their anchors — never one merged number.
 *
 * A parity test asserts this module and the job agree; the console must never
 * be able to name a different day than the job that sent the email.
 */
export const EXTENSION_WINDOW_DAYS = 5;

/** `YYYY-MM-DD` for an instant as seen in `timeZone`. */
export function zonedDateKey(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function dateKeyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days between two `YYYY-MM-DD` keys. */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtcMs(toKey) - dateKeyToUtcMs(fromKey)) / 86400000);
}

/** 1-based day of the repair window, counted in the home terminal timezone. */
export function repairDayInZone(
  discoveredAt: string,
  now: Date = new Date(),
  timeZone = 'America/Chicago',
): number {
  return Math.max(
    1,
    calendarDaysBetween(zonedDateKey(discoveredAt, timeZone), zonedDateKey(now, timeZone)) + 1,
  );
}

/** The 395.34(d)(2) filing deadline: notification + 5 days. */
export function extensionDeadline(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + EXTENSION_WINDOW_DAYS * 86400000);
}

export function extensionWindowOpen(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() <= extensionDeadline(createdAt).getTime();
}

/** Whole days remaining to file, floored at 0. */
export function extensionDaysLeft(createdAt: string, now: Date = new Date()): number {
  const ms = extensionDeadline(createdAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/**
 * Calendar days between discovery and the driver's report. Non-zero only on a
 * backdated report, and the reason the two clocks can disagree.
 */
export function backdateDays(
  discoveredAt: string,
  createdAt: string,
  timeZone = 'America/Chicago',
): number {
  return Math.max(
    0,
    calendarDaysBetween(zonedDateKey(discoveredAt, timeZone), zonedDateKey(createdAt, timeZone)),
  );
}

export function formatDateKey(key: string | Date, timeZone = 'America/Chicago'): string {
  const d = typeof key === 'string'
    ? new Date(key.length === 10 ? `${key}T12:00:00` : key)
    : key;
  return d.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
}
