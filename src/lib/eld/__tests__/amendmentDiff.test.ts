import { describe, expect, it } from 'vitest';
import { diffAmendment } from '../amendmentDiff';
import { RODS_HEADER_LABELS } from '../rodsHeaderFields';
import type { RodsDay } from '../rodsTypes';

const day = (over: Partial<RodsDay> = {}): RodsDay => ({
  id: 'd', operator_id: 'o', log_date: '2026-06-16', record_source: 'keyed', status: 'certified',
  locked: true, is_reconstructed: false, supersedes_day_id: null, amendment_reason: null,
  carrier_name: 'SUPERTRANSPORT LLC', carrier_usdot: '1234567', carrier_mc: 'MC-987654',
  main_office_address: '100 Main St', home_terminal_address: '100 Main St',
  home_terminal_timezone: 'America/Chicago', truck_number: '77', trailer_numbers: 'T-1',
  co_driver_name: 'None', shipping_document_no: 'BOL-5150', bol_photo_path: null, from_location: 'Joplin, MO',
  to_location: 'Tulsa, OK', total_miles_driving_today: 412, total_mileage_today: null,
  period_start_time: '00:00:00', recap_on_duty_today: null, recap_last_7_days: null,
  recap_available_tomorrow: null, recap_last_8_days: null, total_off_duty_minutes: 600,
  total_sleeper_minutes: 0, total_driving_minutes: 840, total_on_duty_minutes: 0,
  source_document_path: null, pdf_path: null, certified_at: '2026-06-17T00:00:00Z',
  certification_legal_name: 'Craig Pate', certification_signature_path: 'sig.png',
  created_at: '', updated_at: '', ...over,
});

const seg = (start: number, end: number, status: 1 | 2 | 3 | 4, city = 'Joplin', state = 'MO') =>
  ({ start_minute: start, end_minute: end, duty_status: status, city, state, remarks: null });

describe('diffAmendment', () => {
  it('reports nothing when the amendment changed nothing', () => {
    const events = [seg(0, 600, 1), seg(600, 1440, 3)];
    expect(diffAmendment({ day: day(), events }, { day: day(), events })).toEqual([]);
  });

  it('ignores certification and lock columns, which the server owns', () => {
    const events = [seg(0, 1440, 1)];
    const changes = diffAmendment(
      { day: day(), events },
      { day: day({ locked: false, status: 'draft', certified_at: null, pdf_path: 'new.pdf' }), events },
    );
    expect(changes).toEqual([]);
  });

  it('names the header field an auditor reads, not the column name', () => {
    const events = [seg(0, 1440, 1)];
    const changes = diffAmendment(
      { day: day(), events },
      { day: day({ truck_number: '82', total_miles_driving_today: 430 }), events },
    );
    expect(changes).toContainEqual({ field_path: 'Truck / tractor no.', old_value: '77', new_value: '82' });
    expect(changes).toContainEqual({ field_path: 'Total miles driving today', old_value: '412', new_value: '430' });
  });

  it('uses the same label strings the printed form uses — one source, no drift', () => {
    const events = [seg(0, 1440, 1)];
    const changes = diffAmendment(
      { day: day(), events },
      { day: day({ to_location: 'Wichita, KS', trailer_numbers: 'T-9' }), events },
    );
    expect(changes).toContainEqual({
      field_path: RODS_HEADER_LABELS.to_location, old_value: 'Tulsa, OK', new_value: 'Wichita, KS',
    });
    expect(changes).toContainEqual({
      field_path: RODS_HEADER_LABELS.trailer_numbers, old_value: 'T-1', new_value: 'T-9',
    });
    // Guard the property that matters: no change row ever names a column.
    for (const c of changes) expect(c.field_path).not.toMatch(/^[a-z0-9_]+$/);
  });

  it('never emits a change row for the log date, which an amendment cannot move', () => {
    const events = [seg(0, 1440, 1)];
    const changes = diffAmendment(
      { day: day(), events },
      { day: day({ log_date: '2026-06-17' }), events },
    );
    expect(changes).toEqual([]);
  });

  it('treats blank and null as the same value, so whitespace is not an edit', () => {
    const events = [seg(0, 1440, 1)];
    expect(diffAmendment(
      { day: day({ trailer_numbers: null }), events },
      { day: day({ trailer_numbers: '   ' }), events },
    )).toEqual([]);
  });

  it('emits one row per changed segment field, labelled by time span', () => {
    const changes = diffAmendment(
      { day: day(), events: [seg(600, 1440, 3, 'Joplin', 'MO')] },
      { day: day(), events: [{ ...seg(600, 1440, 4, 'Tulsa', 'OK'), remarks: 'Fuel stop' }] },
    );
    expect(changes).toEqual([
      { field_path: 'Duty status entry 10:00–24:00 — duty status', old_value: 'Driving', new_value: 'On duty' },
      { field_path: 'Duty status entry 10:00–24:00 — city', old_value: 'Joplin', new_value: 'Tulsa' },
      { field_path: 'Duty status entry 10:00–24:00 — state', old_value: 'MO', new_value: 'OK' },
      { field_path: 'Duty status entry 10:00–24:00 — remarks', old_value: null, new_value: 'Fuel stop' },
    ]);
  });

  it('reads a split segment as one removal and two additions', () => {
    const changes = diffAmendment(
      { day: day(), events: [seg(600, 1440, 3)] },
      { day: day(), events: [seg(600, 900, 3), seg(900, 1440, 4, 'Tulsa', 'OK')] },
    );
    expect(changes).toContainEqual({
      field_path: 'Duty status entry 10:00–24:00 — end time', old_value: '24:00', new_value: '15:00',
    });
    expect(changes).toContainEqual({
      field_path: 'Duty status entry 15:00–24:00', old_value: null, new_value: 'On duty — Tulsa, OK',
    });
  });

  it('records a deleted segment with its old content, not a bare flag', () => {
    const changes = diffAmendment(
      { day: day(), events: [seg(0, 600, 1), seg(600, 1440, 3)] },
      { day: day(), events: [seg(0, 600, 1)] },
    );
    expect(changes).toEqual([
      { field_path: 'Duty status entry 10:00–24:00', old_value: 'Driving — Joplin, MO', new_value: null },
    ]);
  });
});