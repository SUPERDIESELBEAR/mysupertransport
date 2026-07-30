/**
 * Sync-queue persistence. Dexie only — this module must never import the
 * Supabase client. The runner is the single place the queue meets the network,
 * which is what keeps /roadside's import graph clean.
 */
import {
  roadsideDb, type SyncQueueEntry, type SyncKind, type SyncErrorClass,
} from '../db';
import { assertSmallPayload, backoffFor, SUCCEEDED_TTL_MS } from './types';

export function newSyncId(): string {
  return crypto.randomUUID();
}

export interface EnqueueInput {
  /** Supply an id to make the enqueue idempotent across restarts. */
  id?: string;
  kind: SyncKind;
  payload: Record<string, unknown>;
  depends_on?: string[];
  client_timestamp?: string;
}

/**
 * Enqueue, or no-op when an entry with this id already exists in ANY status.
 * Callers that derive a deterministic id (the notice drain does) rely on this:
 * re-running must never produce a second upload or a second send.
 */
export async function enqueue(input: EnqueueInput): Promise<SyncQueueEntry> {
  assertSmallPayload(input.kind, input.payload);
  const id = input.id ?? newSyncId();
  const now = new Date().toISOString();

  return roadsideDb.transaction('rw', roadsideDb.sync_queue, async () => {
    const existing = await roadsideDb.sync_queue.get(id);
    if (existing) return existing;
    const entry: SyncQueueEntry = {
      id,
      kind: input.kind,
      payload: input.payload,
      depends_on: input.depends_on ?? [],
      attempts: 0,
      next_attempt_at: now,
      status: 'pending',
      last_error: null,
      last_error_class: null,
      client_timestamp: input.client_timestamp ?? now,
      created_at: now,
      updated_at: now,
    };
    await roadsideDb.sync_queue.put(entry);
    return entry;
  });
}

export async function getEntry(id: string): Promise<SyncQueueEntry | undefined> {
  return roadsideDb.sync_queue.get(id);
}

export async function allEntries(): Promise<SyncQueueEntry[]> {
  return roadsideDb.sync_queue.toArray();
}

/**
 * Entries that are pending, due, and whose every prerequisite has succeeded.
 * Ordered by client_timestamp so a day's uploads and its certification replay
 * in the order the driver performed them.
 */
export async function dueEntries(now = new Date()): Promise<SyncQueueEntry[]> {
  const all = await roadsideDb.sync_queue.toArray();
  const byId = new Map(all.map((e) => [e.id, e]));
  const iso = now.toISOString();
  return all
    .filter((e) => e.status === 'pending' && e.next_attempt_at <= iso)
    .filter((e) => e.depends_on.every((dep) => byId.get(dep)?.status === 'succeeded'))
    .sort((a, b) => a.client_timestamp.localeCompare(b.client_timestamp));
}

export async function markInFlight(id: string): Promise<void> {
  await roadsideDb.sync_queue.update(id, { status: 'in_flight', updated_at: new Date().toISOString() });
}

export async function markSucceeded(id: string): Promise<void> {
  await roadsideDb.sync_queue.update(id, {
    status: 'succeeded', last_error: null, last_error_class: null,
    updated_at: new Date().toISOString(),
  });
}

export async function markRetry(
  id: string, errorClass: SyncErrorClass, message: string,
): Promise<void> {
  const entry = await roadsideDb.sync_queue.get(id);
  if (!entry) return;
  const attempts = entry.attempts + 1;
  await roadsideDb.sync_queue.update(id, {
    status: 'pending',
    attempts,
    next_attempt_at: new Date(Date.now() + backoffFor(attempts - 1)).toISOString(),
    last_error: message,
    last_error_class: errorClass,
    updated_at: new Date().toISOString(),
  });
}

export async function markTerminal(
  id: string, status: 'failed' | 'rejected', errorClass: SyncErrorClass, message: string,
): Promise<void> {
  const entry = await roadsideDb.sync_queue.get(id);
  await roadsideDb.sync_queue.update(id, {
    status,
    attempts: (entry?.attempts ?? 0) + 1,
    last_error: message,
    last_error_class: errorClass,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Purge succeeded entries older than the TTL. `rejected` and `failed` are kept
 * forever: they are the only on-device record that a signed federal document
 * never reached the server.
 */
export async function purgeSucceeded(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - SUCCEEDED_TTL_MS).toISOString();
  const stale = await roadsideDb.sync_queue
    .where('status').equals('succeeded')
    .filter((e) => e.updated_at < cutoff)
    .toArray();
  await roadsideDb.sync_queue.bulkDelete(stale.map((e) => e.id));
  return stale.length;
}

export interface SyncCounts {
  pending: number;
  inFlight: number;
  failed: number;
  rejected: number;
}

export async function syncCounts(): Promise<SyncCounts> {
  const all = await roadsideDb.sync_queue.toArray();
  return {
    pending: all.filter((e) => e.status === 'pending').length,
    inFlight: all.filter((e) => e.status === 'in_flight').length,
    failed: all.filter((e) => e.status === 'failed').length,
    rejected: all.filter((e) => e.status === 'rejected').length,
  };
}
