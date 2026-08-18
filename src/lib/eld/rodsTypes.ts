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
  /**
   * Photo of the day's shipping document. Supporting evidence only — the
   * §395.8(d)(11) entry is `shipping_document_no`, and the certification guard
   * checks that field, never this one.
   */
  bol_photo_path: string | null;
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
  /**
   * Display-only JPEG re-encode of the uploaded document, produced on the
   * driver's device at upload. The original stays the record; this exists
   * because pdf-lib cannot embed HEIC. Optional: rows filed before Pass B §6.
   */
  display_document_path?: string | null;
  /**
   * The uploading device ATTEMPTED a conversion and could not. Not the same as
   * "no display copy" — a PDF is never converted and leaves this false.
   */
  display_conversion_failed?: boolean;
  pdf_path: string | null;

  certified_at: string | null;
  certification_legal_name: string | null;
  certification_signature_path: string | null;
  /**
   * How the signature image was checked before this log was committed.
   * `null` on a log certified by a client build that predates the check.
   * See `src/lib/eld/signatureIntegrity.ts`.
   */
  certification_signature_validation?: unknown;

  /**
   * Stamped from `operators.is_demo` by a BEFORE INSERT trigger and immutable
   * afterwards. Carried on the record rather than looked up because the
   * roadside surface renders offline and cannot reach the backend.
   */
  is_demo?: boolean;

  /** Device-local state overlaid by `useRodsDays`. Server rows never set these. */
  local_certified_at?: string | null;
  unsynced?: boolean;
  sync_rejected?: boolean;
  sync_stalled?: boolean;

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
 * Start of the 24-hour period when the driver has not set one.
 *
 * This value MUST equal the `period_start_time` default on `public.rods_days`
 * ('00:00:00'). A client-minted draft that omits the field and a server row
 * that defaulted it are the same log; if the two disagree, every certification
 * preflight after a round-trip reports a difference in a field nobody touched.
 * A phantom entry in that dialog is not cosmetic — the dialog exists so a
 * driver can judge what changed, and "use the saved version" is a discard.
 */
export const RODS_PERIOD_START_DEFAULT = '00:00:00';

export interface NewLocalRodsDayInput {
  id?: string;
  operator_id: string;
  log_date: string;
  is_reconstructed?: boolean;
  /** Carrier snapshot and any caller overrides, applied last. */
  overrides?: Partial<RodsDay>;
}

/**
 * Mint a draft day on the device.
 *
 * Every column the database defaults is set explicitly here, to the same
 * value. That is the whole point of the factory: a draft built ad hoc omits
 * whatever the author forgot, and the omission only surfaces later as a
 * spurious diff against the row the server filled in.
 *
 * The id is minted client-side so a driver in a dead zone can start the day's
 * log; the same UUID is used by every later write.
 */
export function newLocalRodsDay(input: NewLocalRodsDayInput): RodsDay {
  const now = new Date().toISOString();
  return {
    id: input.id ?? crypto.randomUUID(),
    operator_id: input.operator_id,
    log_date: input.log_date,
    record_source: 'keyed',
    status: 'draft',
    locked: false,
    is_reconstructed: !!input.is_reconstructed,
    supersedes_day_id: null,
    amendment_reason: null,

    carrier_name: null,
    carrier_usdot: null,
    carrier_mc: null,
    main_office_address: null,
    home_terminal_address: null,
    home_terminal_timezone: null,
    truck_number: null,
    trailer_numbers: null,
    co_driver_name: null,
    shipping_document_no: null,
    bol_photo_path: null,
    from_location: null,
    to_location: null,
    total_miles_driving_today: null,
    total_mileage_today: null,
    period_start_time: RODS_PERIOD_START_DEFAULT,

    recap_on_duty_today: null,
    recap_last_7_days: null,
    recap_available_tomorrow: null,
    recap_last_8_days: null,

    total_off_duty_minutes: 0,
    total_sleeper_minutes: 0,
    total_driving_minutes: 0,
    total_on_duty_minutes: 0,

    source_document_path: null,
    pdf_path: null,

    certified_at: null,
    certification_legal_name: null,
    certification_signature_path: null,

    created_at: now,
    updated_at: now,
    ...(input.overrides ?? {}),
  };
}

/**
 * Five states. Failure states rank above `syncing` because a signed day that
 * hit a terminal error is not "in progress" — it needs the driver or office
 * to act. `syncing` means the driver signed on this device and the office has
 * not yet confirmed the write.
 */
export type RodsChipState =
  | 'needed'
  | 'in_progress'
  | 'syncing'
  | 'stalled'
  | 'rejected'
  | 'complete';

export interface RodsChip {
  state: RodsChipState;
  label: string;
  color: string;
}

export function rodsChip(day: RodsDay | null | undefined): RodsChip {
  if (!day) return { state: 'needed', label: 'Needed', color: '#C0392B' };
  if (day.sync_rejected) {
    return { state: 'rejected', label: 'Rejected — contact dispatch', color: '#C0392B' };
  }
  if (day.sync_stalled) {
    return { state: 'stalled', label: 'Stalled — contact dispatch', color: '#E08A2E' };
  }
  if (day.local_certified_at && day.status !== 'certified') {
    return { state: 'syncing', label: 'Signed on this device, syncing', color: '#2E7D4F' };
  }
  if (day.status === 'draft') return { state: 'in_progress', label: 'In progress', color: '#E08A2E' };
  // Server state is 'certified' for both. The label differs by record_source:
  // uploads were certified on the driver's own ELD, not in SUPERDRIVE.
  return day.record_source === 'eld_document'
    ? { state: 'complete', label: 'On file (ELD log)', color: '#2E7D4F' }
    : { state: 'complete', label: 'Certified', color: '#2E7D4F' };
}

export function isComplete(day: RodsDay | null | undefined): boolean {
  // A signed day counts as complete for reconstruction counters and for the
  // "View" label, because the driver cannot edit it anymore. Failure states
  // are also complete: the signature happened, even if the office did not
  // receive it. (The chip tells the driver the office side failed.)
  const chip = rodsChip(day);
  if (chip.state === 'complete') return true;
  if (chip.state === 'syncing' || chip.state === 'stalled' || chip.state === 'rejected') return true;
  return false;
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