/**
 * Field-level change record for an amended log.
 *
 * 49 CFR 395.30(c)(2) requires that an edit to a certified record of duty
 * status keep the original AND carry an annotation of what changed. Keeping the
 * superseded row on file only satisfies the first half: without a per-field
 * row, an auditor has to eyeball two logs side by side to find the edit. This
 * module produces the second half, and `record_rods_amendments` persists it.
 */
import { STATUS_SHORT } from './rodsGridGeometry';
import { formatMinutes } from './rodsGridGeometry';
import type { RodsDay, RodsEvent } from './rodsTypes';

export interface AmendmentChange {
  field_path: string;
  old_value: string | null;
  new_value: string | null;
}

type EventLike = Pick<
  RodsEvent,
  'start_minute' | 'end_minute' | 'duty_status' | 'city' | 'state' | 'remarks'
>;

/**
 * Header columns an amendment may legitimately change, with the label an
 * auditor reads. Certification, lock, totals and bookkeeping columns are
 * excluded: the server recomputes or owns them, so a diff of those describes
 * the act of certifying rather than the driver's correction.
 */
export const AMENDABLE_HEADER_FIELDS: Record<string, string> = {
  carrier_name: 'Carrier name',
  carrier_usdot: 'Carrier USDOT number',
  carrier_mc: 'Carrier MC number',
  main_office_address: 'Main office address',
  home_terminal_address: 'Home terminal address',
  home_terminal_timezone: 'Home terminal time zone',
  truck_number: 'Truck / tractor number',
  trailer_numbers: 'Trailer numbers',
  co_driver_name: 'Co-driver name',
  shipping_document_no: 'Shipping document number',
  from_location: 'From',
  to_location: 'To',
  total_miles_driving_today: 'Total miles driving today',
  total_mileage_today: 'Total mileage today',
  period_start_time: '24-hour period starting time',
  recap_on_duty_today: 'Recap — on duty today',
  recap_last_7_days: 'Recap — last 7 days',
  recap_available_tomorrow: 'Recap — available tomorrow',
  recap_last_8_days: 'Recap — last 8 days',
  is_reconstructed: 'Reconstructed from memory',
};

function norm(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = String(v).trim();
  return s === '' ? null : s;
}

function statusLabel(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return STATUS_SHORT[v - 1] ?? String(v);
}

function clock(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : formatMinutes(v);
}

function span(e: EventLike): string {
  return `${clock(e.start_minute)}–${clock(e.end_minute)}`;
}

function byStart(a: EventLike, b: EventLike) {
  return a.start_minute - b.start_minute;
}

/**
 * Compare a certified log with the amendment that supersedes it.
 *
 * Returns one row per changed field. Segments are matched on start minute,
 * because that is what identifies a duty-status change to a reader of the
 * grid; a segment whose start moved reads as one removed and one added, which
 * is the honest description of that edit.
 */
export function diffAmendment(
  original: { day: RodsDay; events: EventLike[] },
  amended: { day: RodsDay; events: EventLike[] },
): AmendmentChange[] {
  const changes: AmendmentChange[] = [];

  for (const [column, label] of Object.entries(AMENDABLE_HEADER_FIELDS)) {
    const before = norm((original.day as unknown as Record<string, unknown>)[column]);
    const after = norm((amended.day as unknown as Record<string, unknown>)[column]);
    if (before !== after) changes.push({ field_path: label, old_value: before, new_value: after });
  }

  const before = [...original.events].sort(byStart);
  const after = [...amended.events].sort(byStart);
  const afterByStart = new Map(after.map((e) => [e.start_minute, e]));
  const beforeByStart = new Map(before.map((e) => [e.start_minute, e]));

  for (const b of before) {
    const a = afterByStart.get(b.start_minute);
    if (!a) {
      changes.push({
        field_path: `Duty status entry ${span(b)}`,
        old_value: `${statusLabel(b.duty_status) ?? '—'} — ${norm(b.city) ?? '—'}, ${norm(b.state) ?? '—'}`,
        new_value: null,
      });
      continue;
    }
    const fields: Array<[string, string | null, string | null]> = [
      ['end time', clock(b.end_minute), clock(a.end_minute)],
      ['duty status', statusLabel(b.duty_status), statusLabel(a.duty_status)],
      ['city', norm(b.city), norm(a.city)],
      ['state', norm(b.state), norm(a.state)],
      ['remarks', norm(b.remarks), norm(a.remarks)],
    ];
    for (const [name, ov, nv] of fields) {
      if (ov !== nv) {
        changes.push({
          field_path: `Duty status entry ${span(b)} — ${name}`,
          old_value: ov, new_value: nv,
        });
      }
    }
  }

  for (const a of after) {
    if (beforeByStart.has(a.start_minute)) continue;
    changes.push({
      field_path: `Duty status entry ${span(a)}`,
      old_value: null,
      new_value: `${statusLabel(a.duty_status) ?? '—'} — ${norm(a.city) ?? '—'}, ${norm(a.state) ?? '—'}`,
    });
  }

  return changes;
}