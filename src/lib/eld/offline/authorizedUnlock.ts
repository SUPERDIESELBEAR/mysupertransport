/**
 * The one path out of a terminal certify chain.
 *
 * A day whose chain went terminal is signed, locked, uneditable, unsynced and
 * — before this module — unrecoverable: `local_certified_at` had exactly one
 * writer and no clearer, so nothing in the app could return the day to draft.
 *
 * The unlock is driver-initiated and office-authorized OUT OF BAND. Management
 * cannot write to a driver's Dexie, so the authorization arrives by phone and
 * is recorded here as free text naming who gave it and why. That text is the
 * audit trail; the server-side record is filed through the queue.
 *
 * Bytes are never destroyed. The rendered PDF and the signature image stay in
 * their stores, and every cancelled queue entry is cancelled, not deleted.
 */
import { roadsideDb } from './db';
import { getCachedDay, putCachedDay } from './cache';
import { cancelChainForDay, enqueue, newSyncId, type CancelledEntrySnapshot } from './queue/store';
import type { RodsDay } from '@/lib/eld/rodsTypes';

export type UnlockOutcome =
  | { ok: true; cancelled: CancelledEntrySnapshot[] }
  /** Nothing to unlock — the day is not locally certified on this device. */
  | { ok: false; reason: 'not_locked' }
  /**
   * The office HAS the certification after all: a response was lost, not the
   * write. Unlocking would hand the driver an editable copy of a record that
   * is certified and immutable server-side. Refused, and the local copy is
   * reconciled to the server's in the same action.
   */
  | { ok: false; reason: 'server_certified' };

export interface AuthorizedUnlockInput {
  operatorId: string;
  logDate: string;
  /** Free text naming who at the office authorized the unlock, and why. */
  reason: string;
  deviceInfo?: string | null;
  /** Injected in tests. Reads the server's copy of the day, or null offline. */
  readServerDay?: (dayId: string) => Promise<Record<string, unknown> | null>;
}

async function defaultReadServerDay(dayId: string): Promise<Record<string, unknown> | null> {
  // Imported lazily so this module stays out of /roadside's Supabase-free
  // import graph until an unlock is actually attempted.
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('rods_days').select('*').eq('id', dayId).maybeSingle();
  // A read that failed is NOT evidence the office lacks the certification. It
  // is the offline case, which is the ordinary case for a stalled day, so the
  // unlock proceeds — the queued record tells the office what happened.
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}

/** Payload cap: keys and a short state map, never a queue dump. */
const MAX_RECORDED_ENTRIES = 20;

export async function authorizedUnlockDay(input: AuthorizedUnlockInput): Promise<UnlockOutcome> {
  const { operatorId, logDate } = input;
  const reason = (input.reason ?? '').trim();
  if (!reason) throw new Error('A written reason naming the office authorization is required.');

  const entry = await getCachedDay(logDate);
  if (!entry?.local_certified_at) return { ok: false, reason: 'not_locked' };

  const read = input.readServerDay ?? defaultReadServerDay;
  const serverRow = await read(entry.day.id);
  if (serverRow && serverRow.status === 'certified') {
    // Reconcile rather than unlock. The chain is cancelled either way: it was
    // trying to do something the office has already recorded.
    await cancelChainForDay(
      logDate,
      'Cancelled: the office already holds this certification.',
      'server_certified',
    );
    await putCachedDay({
      day: serverRow as unknown as RodsDay,
      operator_id: operatorId,
      log_date: logDate,
      unsynced: false,
      version: entry.version,
      local_certified_at: entry.local_certified_at,
      sync_rejected: false,
      sync_stalled: false,
    });
    return { ok: false, reason: 'server_certified' };
  }

  const unlockedAt = new Date().toISOString();
  const localCertifiedAt = entry.local_certified_at;
  const idempotencyKey = newSyncId();
  let cancelled: CancelledEntrySnapshot[] = [];

  // One transaction: the day must never be observable as unlocked-but-chained
  // or cancelled-but-locked. Both stores are in scope, and `enqueue` opens a
  // nested transaction on a subset of it.
  await roadsideDb.transaction('rw', roadsideDb.rods_days_cache, roadsideDb.sync_queue, async () => {
    cancelled = await cancelChainForDay(
      logDate,
      `Cancelled by an office-authorized unlock on ${unlockedAt}: ${reason}`,
      'authorized_unlock',
      // The dead entries are part of the story the office is being handed.
      true,
    );

    await putCachedDay({
      // The day goes back to draft on this device. The signed PDF and the
      // signature bytes stay in their stores untouched.
      day: { ...entry.day, status: 'draft', locked: false } as RodsDay,
      operator_id: operatorId,
      log_date: logDate,
      unsynced: true,
      version: entry.version + 1,
      local_certified_at: null,
      sync_rejected: false,
      sync_stalled: false,
    });

    const recorded = cancelled.slice(0, MAX_RECORDED_ENTRIES);
    await enqueue({
      id: idempotencyKey,
      kind: 'record_unlock',
      payload: {
        operator_id: operatorId,
        rods_day_id: entry.day.id,
        log_date: logDate,
        unlocked_at: unlockedAt,
        local_certified_at: localCertifiedAt,
        cancelled_entry_ids: recorded.map((e) => e.id),
        cancelled_states: Object.fromEntries(
          recorded.map((e) => [e.id, { kind: e.kind, status: e.status, attempts: e.attempts }]),
        ),
        reason,
        device_info: input.deviceInfo ?? null,
        idempotency_key: idempotencyKey,
      },
    });
  });

  return { ok: true, cancelled };
}