/**
 * THE APP'S DATE FORMAT, IN ONE PLACE.
 *
 * The convention is MM/DD/YYYY. It was previously only a convention — every
 * module wrote its own formatter, and a screen that forgot to call one printed
 * the raw ISO column instead. That is exactly how the Cost per Gallon summary
 * line came to read `2026-08-03 to 2026-09-01`.
 *
 * NO TIME ZONE MATH HERE. These are DATE columns, `YYYY-MM-DD` — a calendar
 * day, not an instant. Passing one through `new Date()` shifts it a day for
 * anyone west of UTC, so this reads the digits and reorders them.
 */
export function formatDateMDY(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso ?? '');
}
