/**
 * The §395.8 header block, in one place.
 *
 * Two renderers draw this block — the printable PDF (`renderRodsDay`) and the
 * native roadside page (`RoadsideDayRender`). They must agree field for field,
 * so the list lives here and neither one owns it.
 *
 * This module must stay dependency-neutral: it imports `rodsTypes` and nothing
 * else. `RoadsideDayRender` is on the /roadside boot path, and a reach from
 * here into `renderRodsDay` would drag pdf-lib into that bundle.
 */
import type { RodsDay } from './rodsTypes';

export interface RodsHeaderField {
  label: string;
  value: string;
  /** Column width used by the PDF layout; the native render uses it for flex basis. */
  width: number;
}

/**
 * The full name of a time standard — "Central Daylight Time", never the IANA
 * identifier and never a reconstructed parenthetical. §395.8 wants the time
 * standard of the home terminal named on the record.
 *
 * Resolved at NOON local on the log date, not midnight: on a spring-forward
 * day 00:00 is still standard time while nearly the whole day is daylight
 * time, so midnight would print the wrong standard on exactly the days it
 * matters most.
 *
 * It must never throw. Intl.DateTimeFormat raises RangeError on a null or
 * unknown zone, and this runs inside RoadsideDayRender — the one component
 * where an uncaught exception is a blank screen in front of an enforcement
 * officer, offline, with no way to recover. On any failure we hand back
 * whatever was stored and let the page render it.
 */
export function carrierTimeZoneLabel(
  ianaZone: string | null | undefined,
  logDate: string,
): string {
  if (!ianaZone) return '';
  try {
    const at = new Date(`${logDate}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      timeZoneName: 'long',
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value || ianaZone;
  } catch {
    return ianaZone;
  }
}

/** '13:30:00' -> '1:30 PM'. Returns the raw value if it is not a clock time. */
export function formatPeriodStart(raw: string | null | undefined): string {
  if (!raw) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  const h24 = Number(m[1]);
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/**
 * The timezone is read off the day row, never passed in. Pass B generates the
 * certified PDF on the device while offline, so any live operator or carrier
 * read at render time would fail exactly when it is needed.
 */
export function rodsHeaderFields(day: RodsDay, driverName: string): RodsHeaderField[] {
  const tz = carrierTimeZoneLabel(day.home_terminal_timezone, day.log_date);
  const periodStart = formatPeriodStart(day.period_start_time);
  return [
    {
      label: 'Date (mo/day/yr)',
      // Anchored at noon so a 'YYYY-MM-DD' never slips a day across timezones.
      value: new Date(`${day.log_date}T12:00:00`).toLocaleDateString('en-US'),
      width: 150,
    },
    { label: 'Truck / tractor no.', value: day.truck_number ?? '', width: 150 },
    { label: 'Trailer no.', value: day.trailer_numbers ?? '', width: 120 },
    {
      label: 'Total miles driving today',
      value: day.total_miles_driving_today?.toString() ?? '',
      width: 150,
    },
    {
      label: 'Total mileage today',
      value: day.total_mileage_today?.toString() ?? '',
      width: 150,
    },
    { label: 'Driver name (print)', value: driverName, width: 200 },
    { label: 'Co-driver name', value: day.co_driver_name ?? '', width: 150 },
    { label: 'Main office address', value: day.main_office_address ?? '', width: 240 },
    { label: 'Home terminal address', value: day.home_terminal_address ?? '', width: 240 },
    {
      label: '24-hour period begins',
      value: [periodStart, tz].filter(Boolean).join(' — '),
      width: 240,
    },
    { label: 'From', value: day.from_location ?? '', width: 180 },
    { label: 'To', value: day.to_location ?? '', width: 180 },
    { label: 'Shipping document no.', value: day.shipping_document_no ?? '', width: 180 },
  ];
}

/** The certification timestamp, with the home terminal's time standard named. */
export function rodsCertifiedAtLabel(day: RodsDay): string | null {
  if (!day.certified_at) return null;
  const tz = carrierTimeZoneLabel(day.home_terminal_timezone, day.log_date);
  const stamp = new Date(day.certified_at).toLocaleString();
  return tz ? `Certified ${stamp} — ${tz}` : `Certified ${stamp}`;
}

/**
 * The red banner lines above the header. A record that was reconstructed or
 * that supersedes an earlier certification has to say so on its face.
 */
export function rodsAnnotations(
  day: RodsDay,
  originalCertifiedAt: string | null = null,
): string[] {
  const out: string[] = [];
  if (day.is_reconstructed) out.push('RECONSTRUCTED — 49 CFR 395.34(a)(2)');
  if (day.supersedes_day_id) {
    out.push(
      originalCertifiedAt
        ? `AMENDED — original certified ${new Date(originalCertifiedAt).toLocaleString()}`
        : 'AMENDED',
    );
  }
  return out;
}

/** RECAP rows A–D, in form order. Whatever the driver typed — never computed. */
export function rodsRecapRows(day: RodsDay): Array<{ label: string; value: string }> {
  return [
    { label: 'A. Total hours on duty today (lines 3 + 4)', value: day.recap_on_duty_today ?? '' },
    { label: 'B. Total hours on duty last 7 days including today', value: day.recap_last_7_days ?? '' },
    { label: 'C. Total hours available tomorrow (70 hr / 8 day)', value: day.recap_available_tomorrow ?? '' },
    { label: 'D. Total hours on duty last 8 days including today', value: day.recap_last_8_days ?? '' },
  ];
}