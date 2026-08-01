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
    cached_at: input.cached_at ?? new Date().toISOString(),
  };
}

/** Write one cached day. Safe inside an open Dexie transaction. */
export async function putCachedDay(input: PutCachedDayInput): Promise<RodsDayCacheEntry> {
  const record = cachedDayRecord(input);
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

/** Write one day's cached segments. Safe inside an open Dexie transaction. */
export async function putCachedEvents(input: PutCachedEventsInput): Promise<RodsEventCacheEntry> {
  const record = cachedEventsRecord(input);
  await roadsideDb.rods_events_cache.put(record);
  return record;
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
    await putCachedEvents({ ...events, unsynced: false, cached_at: events.cached_at });
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
  logDate: string, which: 'stalled' | 'rejected',
): Promise<void> {
  const existing = await roadsideDb.rods_days_cache.get(logDate);
  if (!existing) return;
  await putCachedDay({
    ...existing,
    sync_stalled: which === 'stalled' ? true : existing.sync_stalled,
    sync_rejected: which === 'rejected' ? true : existing.sync_rejected,
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