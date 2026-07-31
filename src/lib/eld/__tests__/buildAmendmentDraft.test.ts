import { describe, expect, it } from 'vitest';
import { AMENDMENT_RESET_FIELDS, buildAmendmentDraft } from '../buildAmendmentDraft';

/**
 * Snapshot of public.rods_days as of 2026-07-31.
 *
 * This is the recurrence guard. A column added to rods_days fails this test,
 * which forces a decision: clone it (the default -- just add it here) or list
 * it in AMENDMENT_RESET_FIELDS. Previously a new column simply went missing
 * from amendments with no signal at all.
 */
const RODS_DAYS_COLUMNS = [
  'amendment_reason', 'carrier_mc', 'carrier_name', 'carrier_usdot',
  'certification_device_info', 'certification_legal_name',
  'certification_signature_path', 'certification_token', 'certified_at',
  'certified_by', 'co_driver_name', 'created_at', 'from_location',
  'home_terminal_address', 'home_terminal_timezone', 'id', 'is_reconstructed',
  'locked', 'log_date', 'main_office_address', 'operator_id', 'pdf_path',
  'period_start_time', 'recap_available_tomorrow', 'recap_last_7_days',
  'recap_last_8_days', 'recap_on_duty_today', 'record_source',
  'shipping_document_no', 'source_document_path', 'status',
  'supersedes_day_id', 'to_location', 'total_driving_minutes',
  'total_mileage_today', 'total_miles_driving_today', 'total_off_duty_minutes',
  'total_on_duty_minutes', 'total_sleeper_minutes', 'trailer_numbers',
  'truck_number', 'updated_at',
];

/** The twelve header fields certify_rods_day refuses to certify without. */
const GUARDED_HEADER_FIELDS = [
  'total_miles_driving_today', 'truck_number', 'carrier_name', 'carrier_usdot',
  'carrier_mc', 'main_office_address', 'home_terminal_address',
  'home_terminal_timezone', 'from_location', 'to_location', 'co_driver_name',
  'shipping_document_no',
];

function fakeDay(): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  RODS_DAYS_COLUMNS.forEach((c, i) => { row[c] = `v${i}`; });
  row.id = 'original-id';
  return row;
}

describe('buildAmendmentDraft', () => {
  it('copies every column that is not explicitly reset or omitted', () => {
    const original = fakeDay();
    const draft = buildAmendmentDraft(original as never);
    const reset = new Set(Object.keys(AMENDMENT_RESET_FIELDS));

    for (const col of RODS_DAYS_COLUMNS) {
      if (reset.has(col)) continue;
      expect(draft[col], `${col} was not cloned`).toBe(original[col]);
    }
  });

  it('clones every field certify_rods_day guards', () => {
    const original = fakeDay();
    const draft = buildAmendmentDraft(original as never);
    for (const col of GUARDED_HEADER_FIELDS) {
      expect(draft[col], `guarded field ${col} missing from amendment`).toBe(original[col]);
    }
  });

  it('resets certification state and points at the original', () => {
    const draft = buildAmendmentDraft(fakeDay() as never);
    expect(draft.status).toBe('draft');
    expect(draft.locked).toBe(false);
    expect(draft.record_source).toBe('keyed');
    expect(draft.certified_at).toBeNull();
    expect(draft.certification_token).toBeNull();
    expect(draft.pdf_path).toBeNull();
    expect(draft.supersedes_day_id).toBe('original-id');
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('created_at');
    expect(draft).not.toHaveProperty('updated_at');
  });

  it('knows the full rods_days column list', () => {
    // Fails when a migration adds a column. Update the snapshot, and decide
    // whether the new column clones (default) or resets.
    const draft = buildAmendmentDraft(fakeDay() as never);
    const known = new Set(RODS_DAYS_COLUMNS);
    for (const key of Object.keys(draft)) expect(known.has(key)).toBe(true);
    for (const key of Object.keys(AMENDMENT_RESET_FIELDS)) expect(known.has(key)).toBe(true);
  });
});
