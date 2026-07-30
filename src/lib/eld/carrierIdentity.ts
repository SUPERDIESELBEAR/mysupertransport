/**
 * Carrier identity for record creation.
 *
 * The record of truth is the `carrier_profile` singleton. Nothing that creates
 * a federal record reads it live: a driver keying a log during a malfunction is
 * frequently offline, and a live read there either fails or — worse — succeeds
 * against a profile that has been edited since the day being reconstructed.
 * Creation paths read the Dexie cache written at the last authenticated load,
 * snapshot the seven fields onto the row, and BLOCK when the cache is absent.
 *
 * Blocking is the correct behaviour. A record created with a guessed carrier
 * identity is a defective federal record; a record the driver could not create
 * until they get one bar of signal is an inconvenience.
 *
 * This module must not import the Supabase client — it is reachable from the
 * roadside graph via the Dexie store.
 */
import { readLocalMeta, type LocalMeta } from './offline/db';

export interface CachedCarrier {
  legal_name: string;
  usdot_number: string;
  mc_number: string;
  main_office_address: string;
  home_terminal_address: string;
  home_terminal_timezone: string;
  fmcsa_division_state: string;
}

export const CARRIER_CACHE_MISSING_MESSAGE =
  'Carrier details have not been downloaded to this device yet. Connect to the '
  + 'internet once and reopen this screen — the record cannot be created without '
  + 'the carrier name, USDOT number and terminal address required on the log.';

/** Reads the cached carrier, or null when it was never fully cached. */
export function carrierFromMeta(meta: LocalMeta | undefined | null): CachedCarrier | null {
  if (!meta?.carrier_cached_at) return null;
  const carrier: CachedCarrier = {
    legal_name: meta.carrier_name,
    usdot_number: meta.carrier_usdot,
    mc_number: meta.carrier_mc,
    main_office_address: meta.carrier_main_office_address,
    home_terminal_address: meta.carrier_home_terminal_address,
    home_terminal_timezone: meta.carrier_home_terminal_timezone,
    fmcsa_division_state: meta.carrier_fmcsa_division_state,
  };
  // Every field certify_rods_day guards on must be present before a record is
  // created with this carrier, MC number included — a day snapshotted without
  // one can never be certified, and the driver only finds out at signing time.
  const required: (keyof CachedCarrier)[] = [
    'legal_name', 'usdot_number', 'mc_number', 'main_office_address',
    'home_terminal_address', 'home_terminal_timezone',
  ];
  if (required.some((k) => !carrier[k]?.trim())) return null;
  return carrier;
}

export async function readCachedCarrier(): Promise<CachedCarrier | null> {
  return carrierFromMeta(await readLocalMeta());
}

/** Throws the driver-facing block message when the carrier was never cached. */
export async function requireCachedCarrier(): Promise<CachedCarrier> {
  const carrier = await readCachedCarrier();
  if (!carrier) throw new Error(CARRIER_CACHE_MISSING_MESSAGE);
  return carrier;
}

/** The carrier columns snapshotted onto a rods_days row at creation. */
export function rodsDayCarrierSnapshot(carrier: CachedCarrier) {
  return {
    carrier_name: carrier.legal_name,
    carrier_usdot: carrier.usdot_number,
    carrier_mc: carrier.mc_number,
    main_office_address: carrier.main_office_address,
    home_terminal_address: carrier.home_terminal_address,
    home_terminal_timezone: carrier.home_terminal_timezone,
  };
}

/** The carrier columns snapshotted onto an eld_malfunction_events row. */
export function malfunctionCarrierSnapshot(carrier: CachedCarrier) {
  return {
    carrier_legal_name: carrier.legal_name,
    carrier_usdot: carrier.usdot_number,
    carrier_mc: carrier.mc_number,
    carrier_main_office_address: carrier.main_office_address,
  };
}
