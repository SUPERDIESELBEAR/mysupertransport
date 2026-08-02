/**
 * The ONLY writer for rods_days_cache and rods_events_cache.
 *
 * Pass C made the cache authoritative for uncertified days: what the driver
 * sees offline is what is in these two stores, and the sync queue replays them
 * to the server later. That makes an accidental field drop a data-loss bug —
 * a `.put({ ...day, cached_at })` that forgets `unsynced` silently marks a day
 * synced and lets the next hydration overwrite the driver's edits.
 *
 * So the fields that carry sync state are REQUIRED parameters here, and raw
 * `.put` on either store is banned by lint. Every caller has to say, out loud,
 * whether what it is writing is ahead of the server.
 *
 * Must not import the Supabase client — hydration, the sync queue and the
 * roadside graph all reach this module.
 */
import { roadsideDb, type RodsDayCacheEntry, type RodsEventCacheEntry } from './db';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';
import { raiseSyncAlert } from './queue/alerts';

export interface PutCachedDayInput {
  day: RodsDay;
  operator_id: string;
  log_date: string;
  /** True when the device holds edits the server has not confirmed. */
  unsynced: boolean;
  /**
   * Monotonic per-day. Pass the version the queue entry carries; a sync only
   * clears `unsynced` when the version it sent is still the current one.
   */
  version: number;
  /** When the driver signed on this device. Non-null = locally locked. */
  local_certified_at: string | null;
  sync_rejected: boolean;
  sync_stalled: boolean;
  /** SQLSTATE (or `HTTP <status>`) behind a terminal failure, when known. */
  sync_failure_code?: string | null;
  /** True when the refusal matched a rejection this client knows by name. */
  sync_failure_recognized?: boolean;
  /** Set only by the driver's dismiss tap. See markSyncConfirmedSeen. */
  sync_confirmed_seen_at?: string | null;
  cached_at?: string;
}

export function cachedDayRecord(input: PutCachedDayInput): RodsDayCacheEntry {
  return {
    log_date: input.log_date,
    operator_id: input.operator_id,
    day: input.day,
    unsynced: input.unsynced,
    unsynced_flag: input.unsynced ? 1 : 0,
    version: input.version,
    local_certified_at: input.local_certified_at,
    sync_rejected: input.sync_rejected,
    sync_stalled: input.sync_stalled,
    sync_failure_code: input.sync_failure_code ?? null,
    sync_failure_recognized: input.sync_failure_recognized ?? false,
    sync_confirmed_seen_at: input.sync_confirmed_seen_at ?? null,
    cached_at: input.cached_at ?? new Date().toISOString(),
  };
}

/** Write one cached day. Safe inside an open Dexie transaction. */
export async function putCachedDay(input: PutCachedDayInput): Promise<RodsDayCacheEntry> {
  // Carried forward, never re-stated by every caller: these three describe
  // what already happened to this day (a terminal failure, the driver's
  // acknowledgement), not what the caller is writing. A hydration put that
  // omitted them would silently resurrect a dismissed confirmation.
  const existing = await roadsideDb.rods_days_cache.get(input.log_date);
  const record = cachedDayRecord({
    ...input,
    sync_failure_code: input.sync_failure_code ?? existing?.sync_failure_code ?? null,
    sync_failure_recognized:
      input.sync_failure_recognized ?? existing?.sync_failure_recognized ?? false,
    sync_confirmed_seen_at:
      input.sync_confirmed_seen_at ?? existing?.sync_confirmed_seen_at ?? null,
  });
  await roadsideDb.rods_days_cache.put(record);
  return record;
}

export interface PutCachedEventsInput {
  rods_day_id: string;
  log_date: string;
  events: RodsEvent[];
  unsynced: boolean;
  version: number;
  cached_at?: string;
  /** Needed to attribute the empty-segment alert; the RPC refuses an
   *  unattributable write. */
  operator_id: string;
  /**
   * Which writer this is. REQUIRED and never inferred: `unsynced` does not
   * identify the caller (markDaySynced re-puts hydration-sourced rows), and a
   * new writer must state its provenance rather than default into silence.
   */
  provenance: EventCacheProvenance;
  /**
   * Server-side status of the day these segments belong to. REQUIRED for the
   * same reason: the input carries no status of its own, so it cannot tell a
   * certified day from a draft.
   */
  day_status: RodsDay['status'];
  /**
   * When the driver signed on this device. A local certification leaves
   * `day_status` at 'draft' until the queue drains — the lock is
   * `local_certified_at` — so a certified-with-no-segments write on that path
   * is only visible through this field.
   */
  local_certified_at: string | null;
}

export type EventCacheProvenance =
  | 'hydration'
  | 'local_certification'
  | 'sync_flag_clear'
  /** The day editor, driver-authored: draft creation or a segment save. */
  | 'editor'
  /**
   * The editor's post-read refresh, aligning the cache with rows just read
   * from the server. Kept distinct from `editor` because it is not a driver
   * edit: an empty set here means the SERVER handed over a certified day with
   * no segments, which is a different fault from the editor producing one.
   */
  | 'server_read';

/**
 * Keys only, no prose. Returned to the caller rather than stored in module
 * state: a module-level list would survive an aborted transaction (raising an
 * alert for a write that never landed) and would let concurrent callers —
 * hydration running while a certification commits — drain each other's
 * entries. Scoped to the call, an abort discards it with the frame.
 */
export interface EmptySegmentsDetected {
  rods_day_id: string;
  log_date: string;
  operator_id: string;
  provenance: EventCacheProvenance;
}

export interface PutCachedEventsResult {
  record: RodsEventCacheEntry;
  /** Non-null when a CERTIFIED day was written with an empty segment set. */
  emptySegments: EmptySegmentsDetected | null;
}

export function cachedEventsRecord(input: PutCachedEventsInput): RodsEventCacheEntry {
  return {
    rods_day_id: input.rods_day_id,
    log_date: input.log_date,
    events: input.events,
    unsynced: input.unsynced,
    version: input.version,
    cached_at: input.cached_at ?? new Date().toISOString(),
  };
}

/**
 * Write one day's cached segments. Safe inside an open Dexie transaction.
 *
 * Detects, but does NOT raise, the empty-certified-set condition: raising
 * enqueues onto sync_queue, which is outside the cache-table transaction the
 * callers hold, and Dexie would throw on the undeclared table — taking the
 * cache write down with it. Pass the returned `emptySegments` to
 * `flushEmptySegmentAlerts` after your transaction commits.
 */
export async function putCachedEvents(input: PutCachedEventsInput): Promise<PutCachedEventsResult> {
  const record = cachedEventsRecord(input);
  await roadsideDb.rods_events_cache.put(record);
  const certified = input.day_status === 'certified' || input.local_certified_at !== null;
  return {
    record,
    emptySegments: certified && input.events.length === 0
      ? {
          rods_day_id: input.rods_day_id,
          log_date: input.log_date,
          operator_id: input.operator_id,
          provenance: input.provenance,
        }
      : null,
  };
}

/**
 * Raise what `putCachedEvents` detected, after the caller's transaction has
 * committed. Tolerates null so no caller needs a branch. Never throws —
 * `raiseSyncAlert` swallows and counts its own failures — so an alert cannot
 * cost the write it describes.
 */
export async function flushEmptySegmentAlerts(
  detected: EmptySegmentsDetected | null,
): Promise<void> {
  if (!detected) return;
  await raiseSyncAlert({
    kind: 'certified_day_no_segments',
    operator_id: detected.operator_id,
    log_date: detected.log_date,
    detail: JSON.stringify({
      rods_day_id: detected.rods_day_id,
      log_date: detected.log_date,
      provenance: detected.provenance,
    }),
  });
}

/**
 * Clear `unsynced` for a day, but ONLY if the version that just synced is
 * still the current one. A driver who edits again while the entry is in flight
 * bumps the version; clearing the flag then would tell hydration it is safe to
 * overwrite edits that have never left the device.
 */
export async function markDaySynced(logDate: string, syncedVersion: number): Promise<void> {
  const existing = await roadsideDb.rods_days_cache.get(logDate);
  if (!existing || existing.version !== syncedVersion) return;
  await putCachedDay({ ...existing, unsynced: false, sync_rejected: false, cached_at: existing.cached_at });
  const events = await roadsideDb.rods_events_cache.get(existing.day.id);
  if (events && events.version === syncedVersion) {
    const { emptySegments } = await putCachedEvents({
      ...events,
      unsynced: false,
      cached_at: events.cached_at,
      operator_id: existing.operator_id,
      provenance: 'sync_flag_clear',
      day_status: existing.day.status,
      local_certified_at: existing.local_certified_at,
    });
    // No transaction here, so this is already post-commit.
    await flushEmptySegmentAlerts(emptySegments);
  }
}

/** Read the cached day for a date, or undefined. */
export async function getCachedDay(logDate: string): Promise<RodsDayCacheEntry | undefined> {
  return roadsideDb.rods_days_cache.get(logDate);
}

/** A day the driver signed on this device whose certification has not landed. */
export function isLocallyCertified(entry: RodsDayCacheEntry | undefined | null): boolean {
  return !!entry?.local_certified_at;
}

/**
 * Flag a cached day whose sync chain went terminal.
 *
 * `rejected` — the office refused the write; replaying cannot change that.
 * `stalled`  — the chain gave up or was cancelled by a dead prerequisite.
 *
 * The flag is what the driver-facing banner reads, and a day carrying it while
 * `local_certified_at` is set is the dead end the authorized unlock exists to
 * open: signed on this device, locked, and not received by the office.
 *
 * No-op when the day is not cached — there is nothing on this device to flag,
 * and inventing a row here would fabricate a federal record.
 */
export async function markDayStalled(
  logDate: string,
  which: 'stalled' | 'rejected',
  detail?: { code: string | null; recognized: boolean },
): Promise<void> {
  const existing = await roadsideDb.rods_days_cache.get(logDate);
  if (!existing) return;
  await putCachedDay({
    ...existing,
    sync_stalled: which === 'stalled' ? true : existing.sync_stalled,
    sync_rejected: which === 'rejected' ? true : existing.sync_rejected,
    // First terminal answer wins: a later cancellation must not overwrite the
    // code that actually explains why the day is stuck.
    sync_failure_code: existing.sync_failure_code ?? detail?.code ?? null,
    sync_failure_recognized: existing.sync_failure_code
      ? existing.sync_failure_recognized
      : detail?.recognized ?? false,
    cached_at: existing.cached_at,
  });
}

/**
 * Record the driver's dismissal of the "the office has your log" confirmation.
 *
 * This is the ONLY writer of `sync_confirmed_seen_at`, and it is called from
 * exactly one place: the dismiss button in LogSyncBanner. Nothing else may set
 * it — the whole point of the field is that the confirmation waits for a tap.
 */
export async function markSyncConfirmedSeen(logDate: string): Promise<void> {
  const existing = await roadsideDb.rods_days_cache.get(logDate);
  if (!existing) return;
  await putCachedDay({
    ...existing,
    sync_confirmed_seen_at: new Date().toISOString(),
    cached_at: existing.cached_at,
  });
}

/**
 * Dates the driver signed on this device that went terminal — the dead end the
 * banner and the authorized unlock exist for. Sorted newest first.
 */
export async function stalledLockedDates(): Promise<string[]> {
  const all = await roadsideDb.rods_days_cache.toArray();
  return all
    .filter((e) => !!e.local_certified_at && (e.sync_stalled || e.sync_rejected))
    .map((e) => e.log_date)
    .sort((a, b) => b.localeCompare(a));
}