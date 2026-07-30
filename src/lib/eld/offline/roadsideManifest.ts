/**
 * The roadside 8-day window.
 *
 * The date is computed in the driver's cached home-terminal timezone, never
 * the device timezone and never from a network call — a phone that has crossed
 * a timezone line must still show the same eight days the carrier's records
 * show. Safe to import from /roadside: no Supabase, no fetch.
 */

export const ROADSIDE_WINDOW_DAYS = 8;

/** 'YYYY-MM-DD' for `date` as it reads in `timeZone`. */
export function isoDateInTimezone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const y = get('year'); const m = get('month'); const d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through to device-local */
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today plus the previous seven, newest first, in the given timezone. */
export function windowDatesInTimezone(timeZone: string, now: Date = new Date()): string[] {
  const today = isoDateInTimezone(now, timeZone);
  const anchor = new Date(`${today}T12:00:00`);
  const out: string[] = [];
  for (let i = 0; i < ROADSIDE_WINDOW_DAYS; i += 1) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/** True when the manifest was built for a different local day than `now`. */
export function manifestIsStale(windowEnd: string, timeZone: string, now: Date = new Date()): boolean {
  return isoDateInTimezone(now, timeZone) !== windowEnd;
}

export function formatRoadsideDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function formatRoadsideDateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}