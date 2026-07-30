/**
 * Paper record-of-duty-status (RODS) types.
 *
 * SUPERDRIVE is not an ELD. These records exist only while the driver's own
 * registered ELD is malfunctioning (49 CFR 395.34) and are kept the same way a
 * paper log book would be.
 */

export type RodsStatus = 'draft' | 'certified' | 'superseded';
export type RecordSource = 'keyed' | 'eld_document';

export interface RodsDay {
  id: string;
  operator_id: string;
  log_date: string;
  record_source: RecordSource;
  status: RodsStatus;
  locked: boolean;
  is_reconstructed: boolean;
  supersedes_day_id: string | null;
  amendment_reason: string | null;

  carrier_name: string | null;
  carrier_usdot: string | null;
  carrier_mc: string | null;
  /** Frozen at draft creation from the cached carrier record. */
  main_office_address: string | null;
  home_terminal_address: string | null;
  /**
   * The home terminal's time standard, frozen per day. §395.8 requires it on
   * the face of the record, and freezing it means a historical log shows the
   * zone that was in effect on that date even if the driver later moves
   * terminals. Never read a live operator row to fill this in.
   */
  home_terminal_timezone: string | null;
  truck_number: string | null;
  trailer_numbers: string | null;
  co_driver_name: string | null;
  shipping_document_no: string | null;
  from_location: string | null;
  to_location: string | null;
  total_miles_driving_today: number | null;
  total_mileage_today: number | null;
  /** Start of the driver's 24-hour period, e.g. '00:00:00'. */
  period_start_time: string | null;

  recap_on_duty_today: string | null;
  recap_last_7_days: string | null;
  recap_available_tomorrow: string | null;
  recap_last_8_days: string | null;

  total_off_duty_minutes: number;
  total_sleeper_minutes: number;
  total_driving_minutes: number;
  total_on_duty_minutes: number;

  source_document_path: string | null;
  pdf_path: string | null;

  certified_at: string | null;
  certification_legal_name: string | null;
  certification_signature_path: string | null;

  created_at: string;
  updated_at: string;
}

export interface RodsEvent {
  id: string;
  rods_day_id: string;
  start_minute: number;
  /** Null while the driver has not entered an end time yet. */
  end_minute: number | null;
  duty_status: 1 | 2 | 3 | 4 | null;
  city: string | null;
  state: string | null;
  remarks: string | null;
  is_short_period: boolean | null;
}

/** A segment is only usable on a certified record once every field is entered. */
export function isCompleteEvent(
  e: Pick<RodsEvent, 'end_minute' | 'duty_status' | 'city' | 'state'>,
): boolean {
  return (
    e.end_minute !== null && e.duty_status !== null
    && !!e.city?.trim() && !!e.state?.trim()
  );
}

export const RODS_BUCKET = 'rods-logs';

/**
 * Three states only. "Already on file" was removed — it was always the same
 * state as complete, just a different label.
 */
export type RodsChipState = 'needed' | 'in_progress' | 'complete';

export interface RodsChip {
  state: RodsChipState;
  label: string;
  color: string;
}

export function rodsChip(day: RodsDay | null | undefined): RodsChip {
  if (!day) return { state: 'needed', label: 'Needed', color: '#C0392B' };
  if (day.status === 'draft') return { state: 'in_progress', label: 'In progress', color: '#E08A2E' };
  // Storage state is 'certified' for both. The label differs by record_source:
  // uploads were certified on the driver's own ELD, not in SUPERDRIVE.
  return day.record_source === 'eld_document'
    ? { state: 'complete', label: 'On file (ELD log)', color: '#2E7D4F' }
    : { state: 'complete', label: 'Certified', color: '#2E7D4F' };
}

export function isComplete(day: RodsDay | null | undefined): boolean {
  return rodsChip(day).state === 'complete';
}

/**
 * Uploaded ELD documents have no rods_events, so all four derived totals are
 * zero. Rendering 0:00 across the board reads as a data error — suppress the
 * totals row entirely for these days.
 */
export function showsDerivedTotals(day: RodsDay): boolean {
  return day.record_source === 'keyed';
}

/** The reconstruction window: current day plus the previous 7. */
export const RECONSTRUCTION_DAYS = 8;

export function reconstructionDates(today: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < RECONSTRUCTION_DAYS; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  return out;
}

export function formatLogDate(iso: string): string {
  // Anchor at noon so a 'YYYY-MM-DD' never slips a day across timezones.
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}