/**
 * Field-level change record for an amended log.
 *
 * These are manual records of duty status under 49 CFR 395.8, kept on the
 * paper-log allowance at 395.34. Neither section requires a written reason or
 * an annotation of what changed on a correction — 395.8(e)(1) prohibits a
 * false report and 395.8(f)(7) makes the driver's signature certify the
 * entries are true, and that is the whole of it.
 *
 * The reason and this per-field record are SUPERTRANSPORT carrier policy.
 * Keeping the superseded row on file alone would leave an auditor to eyeball
 * two logs side by side to find the edit. `certify_rods_day` persists these
 * rows in the same transaction as the certification.
 */
import { STATUS_SHORT, formatMinutes } from './rodsGridGeometry';
import { AMENDABLE_HEADER_COLUMNS, RODS_HEADER_LABELS } from './rodsHeaderFields';
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

  // Labels come from rodsHeaderFields — the same strings printed on the form —
  // so a change row never names a database column.
  for (const column of AMENDABLE_HEADER_COLUMNS) {
    const label = RODS_HEADER_LABELS[column];
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