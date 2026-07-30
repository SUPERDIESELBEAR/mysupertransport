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

export function rodsHeaderFields(day: RodsDay, driverName: string): RodsHeaderField[] {
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
    { label: 'Driver name (print)', value: driverName, width: 200 },
    { label: 'Co-driver name', value: day.co_driver_name ?? '', width: 150 },
    { label: 'Home terminal address', value: day.home_terminal_address ?? '', width: 240 },
    { label: 'From', value: day.from_location ?? '', width: 180 },
    { label: 'To', value: day.to_location ?? '', width: 180 },
    { label: 'Shipping document no.', value: day.shipping_document_no ?? '', width: 180 },
  ];
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