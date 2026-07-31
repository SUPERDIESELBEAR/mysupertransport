/**
 * Structural guard in front of `certify_rods_day`.
 *
 * Certification locks the row. Anything the driver can see on screen but that
 * never reached the database is lost the instant the RPC returns, and the
 * signed record then differs from what the driver signed. A debounce that
 * dropped a field, a write RLS filtered, a transport failure swallowed by a
 * retry — each one produces the same silent shape.
 *
 * So before certifying we re-read the persisted copy and compare it, field for
 * field, against what is on screen. The comparison is `diffAmendment`, the same
 * function that writes the amendment change record: if it can describe a
 * difference to an auditor, it can describe one to the driver.
 *
 * Online the persisted copy is the server row. Offline it is the Dexie cache
 * (see docs/eld-offline-certification.md, AC-3) — the bytes the queued
 * certification will actually replay against.
 */
import { supabase } from '@/integrations/supabase/client';
import { diffAmendment, type AmendmentChange } from './amendmentDiff';
import { roadsideDb } from './offline/db';
import type { RodsDay, RodsEvent } from './rodsTypes';

export type PreflightSource = 'server' | 'offline_cache';

/** Proof that a specific day was verified against its persisted copy. */
export interface PreflightResult {
  readonly ok: true;
  readonly source: PreflightSource;
  readonly day_id: string;
  readonly log_date: string;
  readonly checked_at: string;
}

/** The persisted copy and the screen disagree. Never resolved automatically. */
export class PreflightMismatchError extends Error {
  readonly differences: AmendmentChange[];
  readonly source: PreflightSource;

  constructor(differences: AmendmentChange[], source: PreflightSource) {
    super(
      'What is on screen has not all been saved yet. Certifying now would lock a log '
      + 'that does not match what you are looking at.',
    );
    this.name = 'PreflightMismatchError';
    this.differences = differences;
    this.source = source;
  }
}

/**
 * The persisted copy could not be read at all. Distinct from a mismatch: we do
 * not know whether it matches, and certifying blind is exactly what this guard
 * exists to prevent.
 */
export class PreflightUnavailableError extends Error {
  constructor(detail: string) {
    super(`The saved copy of this log could not be read, so it cannot be certified yet. ${detail}`);
    this.name = 'PreflightUnavailableError';
  }
}

export function isPreflightMismatch(err: unknown): err is PreflightMismatchError {
  return err instanceof PreflightMismatchError
    || (!!err && typeof err === 'object' && (err as { name?: string }).name === 'PreflightMismatchError');
}

export interface OnScreenState {
  day: RodsDay;
  /** Exactly the rows `saveSegments` was asked to write, in any order. */
  events: Array<Pick<RodsEvent, 'start_minute' | 'end_minute' | 'duty_status' | 'city' | 'state' | 'remarks'>>;
}

export interface PersistedState {
  day: RodsDay;
  events: RodsEvent[];
  source: PreflightSource;
}

/** Read the row the certification will actually lock. */
export async function readPersistedDay(dayId: string, logDate: string, online: boolean): Promise<PersistedState> {
  if (online) {
    const { data: dayRow, error } = await supabase
      .from('rods_days').select('*').eq('id', dayId).maybeSingle();
    if (error) throw new PreflightUnavailableError(error.message);
    if (!dayRow) throw new PreflightUnavailableError('It is no longer on file.');
    const { data: evs, error: evErr } = await supabase
      .from('rods_events').select('*').eq('rods_day_id', dayId).order('start_minute');
    if (evErr) throw new PreflightUnavailableError(evErr.message);
    return {
      day: dayRow as unknown as RodsDay,
      events: (evs ?? []) as unknown as RodsEvent[],
      source: 'server',
    };
  }

  const cached = await roadsideDb.rods_days_cache.get(logDate);
  if (!cached || cached.day.id !== dayId) {
    throw new PreflightUnavailableError('This device has no offline copy of it yet.');
  }
  const cachedEvents = await roadsideDb.rods_events_cache.get(dayId);
  return {
    day: cached.day,
    events: cachedEvents?.events ?? [],
    source: 'offline_cache',
  };
}

/**
 * Throws unless the persisted copy matches the screen. Returns the proof token
 * the certification path carries, so no caller can reach `certify_rods_day`
 * without having run this.
 */
export async function assertPersistedMatches(input: {
  dayId: string;
  logDate: string;
  onScreen: OnScreenState;
  online?: boolean;
}): Promise<PreflightResult> {
  const online = input.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  const persisted = await readPersistedDay(input.dayId, input.logDate, online);

  const differences = diffAmendment(
    { day: persisted.day, events: persisted.events },
    { day: input.onScreen.day, events: input.onScreen.events },
  );
  if (differences.length > 0) throw new PreflightMismatchError(differences, persisted.source);

  return {
    ok: true,
    source: persisted.source,
    day_id: input.dayId,
    log_date: input.logDate,
    checked_at: new Date().toISOString(),
  };
}